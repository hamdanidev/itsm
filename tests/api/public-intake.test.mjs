// Intake publik lewat QR: token titik, tiket tamu, lampiran, dan pembatasan.
import assert from "node:assert/strict";
import { File } from "node:buffer";
import { before, describe, it } from "node:test";

import {
  readEnv,
  seedOrg,
  uniqueLabel,
} from "../lib/fixtures.mjs";

let org;
let base;
let point;

async function createPoint(overrides = {}) {
  const result = await org.lead.client.json("POST", "/api/itsm/intake-points", {
    body: {
      name: `Titik ${uniqueLabel("qr")}`,
      unit: org.unit.id,
      location: "IGD",
      max_per_hour: 20,
      ...overrides,
    },
  });

  return result.point;
}

async function publicGet(token) {
  const response = await fetch(`${base}/api/itsm/public/intake/${token}`);
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { status: response.status, data };
}

async function publicPost(token, payload, files = []) {
  const form = new FormData();
  form.set("payload", JSON.stringify(payload));

  for (const file of files) {
    form.append("files", file, file.name);
  }

  const response = await fetch(`${base}/api/itsm/public/intake/${token}`, {
    method: "POST",
    body: form,
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return { status: response.status, data };
}

async function publicStatus(publicToken) {
  const response = await fetch(
    `${base}/api/itsm/public/tickets/${publicToken}`
  );

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return { status: response.status, data };
}

async function publicCsat(publicToken, payload) {
  const response = await fetch(
    `${base}/api/itsm/public/tickets/${publicToken}/csat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return { status: response.status, data };
}

async function createGuestTicket(overrides = {}) {
  const meta = (await publicGet(point.token)).data;
  const created = await publicPost(point.token, payloadFor(meta, overrides));

  assert.equal(created.status, 201, JSON.stringify(created.data));

  const list = await org.admin.list("tickets", {
    filter: `ticket_no="${created.data.ticket_no}"`,
    perPage: 1,
  });

  return { created: created.data, ticket: list.items[0] };
}

async function resolveTicket(ticketId) {
  await org.support.client.json("POST", `/api/itsm/tickets/${ticketId}/assign`, {
    body: { assignee: org.support.user.id },
  });
  await org.support.client.json("POST", `/api/itsm/tickets/${ticketId}/transition`, {
    body: { status: "in_progress" },
  });
  await org.support.client.json("POST", `/api/itsm/tickets/${ticketId}/transition`, {
    body: {
      status: "resolved",
      resolution_summary: "Koneksi ke server SIMRS dipulihkan dan diuji ulang.",
      resolution_code: "fixed",
    },
  });
}

function payloadFor(meta, overrides = {}) {
  return {
    type: "incident",
    service: meta.services[0].id,
    impact: "operational",
    title: "SIMRS tidak bisa dibuka di triase",
    description: "Sejak pagi layar putih setelah login. Sudah dicoba ulang.",
    reporter_name: "Rina",
    reporter_contact: "rina@rs.id",
    patient_data_confirmed: true,
    ...overrides,
  };
}

before(async () => {
  base = readEnv().url;
  org = await seedOrg({ label: uniqueLabel("intake") });
  point = await createPoint();
});

describe("intake publik QR", () => {
  it("meta publik bisa dibaca tanpa login dan tidak membocorkan data internal", async () => {
    const result = await publicGet(point.token);

    assert.equal(result.status, 200);
    assert.equal(result.data.point.name, point.name);
    assert.equal(result.data.point.location, "IGD");
    assert.ok(result.data.services.length > 0);
    assert.ok(result.data.impacts.length > 0);
    assert.equal(result.data.tenant.name.length > 0, true);

    const serialized = JSON.stringify(result.data);
    assert.equal(serialized.includes('"token"'), false);
    assert.equal(serialized.includes('"requester"'), false);
  });

  it("membuat tiket tamu dengan unit/lokasi dari titik QR dan lampiran", async () => {
    const meta = (await publicGet(point.token)).data;

    // Helper publicPost memakai FormData; sertakan satu lampiran teks.
    const file = new File(["screenshot bug"], `bukti-${Date.now()}.txt`, {
      type: "text/plain",
    });

    const created = await publicPost(point.token, payloadFor(meta), [file]);

    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.match(created.data.ticket_no, /^INC-/);
    assert.equal(created.data.location, "IGD");

    const list = await org.admin.list("tickets", {
      filter: `ticket_no="${created.data.ticket_no}"`,
      perPage: 1,
    });
    const ticket = list.items[0];

    assert.ok(ticket, "tiket harus tersimpan");
    assert.equal(String(ticket.requester || ""), "");
    assert.equal(ticket.unit, org.unit.id);
    assert.equal(ticket.source, "web");
    assert.equal(ticket.intake_channel, "qr");
    assert.equal(ticket.intake_ref, point.id);
    assert.equal(ticket.location, "IGD");
    assert.equal(ticket.patient_data_confirmed, true);
    assert.equal(ticket.reporter_name, "Rina");
    assert.equal(ticket.reporter_contact, "rina@rs.id");

    const attachments = await org.support.client.list("ticket_attachments", {
      filter: `ticket="${ticket.id}"`,
      perPage: 10,
    });

    assert.equal(attachments.items.length, 1);
    assert.equal(String(attachments.items[0].uploader || ""), "");
    assert.equal(attachments.items[0].visibility, "public");

    const { token } = await org.support.client.json("POST", "/api/files/token");
    const url = `${base}/api/files/${attachments.items[0].collectionId}/${attachments.items[0].id}/${attachments.items[0].file}?token=${encodeURIComponent(token)}`;
    const download = await fetch(url);
    assert.equal(download.status, 200);
    assert.equal(await download.text(), "screenshot bug");
  });

  it("menolak tanpa attestation data pasien", async () => {
    const meta = (await publicGet(point.token)).data;
    const result = await publicPost(
      point.token,
      payloadFor(meta, { patient_data_confirmed: false })
    );

    assert.equal(result.status, 400);
    assert.match(String(result.data.message), /data pasien|pasien/i);
  });

  it("menolak change request dari kanal publik", async () => {
    const meta = (await publicGet(point.token)).data;
    const result = await publicPost(
      point.token,
      payloadFor(meta, { type: "change_request" })
    );

    assert.equal(result.status, 400);
    assert.match(String(result.data.message), /staf IT/i);
  });

  it("menolak lampiran dengan tipe tidak didukung", async () => {
    const meta = (await publicGet(point.token)).data;
    const file = new File(["biner"], "malware.exe", {
      type: "application/octet-stream",
    });

    const result = await publicPost(point.token, payloadFor(meta), [file]);

    assert.equal(result.status, 400);
    assert.match(String(result.data.message), /Tipe lampiran/i);
  });

  it("token tidak dikenal, nonaktif, dan kedaluwarsa ditolak", async () => {
    const unknown = await publicGet("tidak-ada-token-publik");
    assert.equal(unknown.status, 404);

    const disabled = await createPoint();
    await org.lead.client.json(
      "PATCH",
      `/api/itsm/intake-points/${disabled.id}`,
      { body: { is_active: false } }
    );

    const disabledResult = await publicGet(disabled.token);
    assert.equal(disabledResult.status, 404);
  });

  it("membatasi jumlah tiket per titik per jam", async () => {
    const limited = await createPoint({ max_per_hour: 1 });
    const meta = (await publicGet(limited.token)).data;

    const first = await publicPost(limited.token, payloadFor(meta));
    assert.equal(first.status, 201);

    const second = await publicPost(limited.token, payloadFor(meta));
    assert.equal(second.status, 400);
    assert.match(String(second.data.message), /Terlalu banyak/i);
  });

  it("hanya Kepala IT yang dapat mengelola titik QR", async () => {
    const support = await org.support.client.request("GET", "/api/itsm/intake-points");
    assert.equal(support.status, 403);

    const requester = await org.requester.client.request(
      "GET",
      "/api/itsm/intake-points"
    );
    assert.equal(requester.status, 403);

    const lead = await org.lead.client.json("GET", "/api/itsm/intake-points");
    assert.ok(Array.isArray(lead.items));
  });

  it("rotasi token membuat tautan lama tidak berlaku", async () => {
    const rotating = await createPoint();
    const rotated = await org.lead.client.json(
      "POST",
      `/api/itsm/intake-points/${rotating.id}/rotate`
    );

    assert.notEqual(rotated.point.token, rotating.token);
    assert.equal((await publicGet(rotating.token)).status, 404);
    assert.equal((await publicGet(rotated.point.token)).status, 200);
  });

  it("tiket tamu mendapat tautan status bertoken dan email konfirmasi", async () => {
    const { created, ticket } = await createGuestTicket();

    assert.match(created.public_token, /^[a-z2-9]{32}$/);
    assert.equal(created.receipt_email, true);

    const status = await publicStatus(created.public_token);

    assert.equal(status.status, 200);
    assert.equal(status.data.ticket.ticket_no, created.ticket_no);
    assert.equal(status.data.ticket.status, "open");
    assert.equal(status.data.can_submit_csat, false);
    assert.equal(status.data.csat, null);

    const serialized = JSON.stringify(status.data);
    for (const field of [
      "requester",
      "assignee",
      "reporter_contact",
      "description",
      "intake_ref",
      "public_token",
    ]) {
      assert.equal(
        serialized.includes(`"${field}"`),
        false,
        `status publik tidak boleh memuat ${field}`
      );
    }

    const outbox = await org.admin.list("email_outbox", {
      filter: `ticket="${ticket.id}" && template="guest_receipt"`,
      perPage: 5,
    });

    assert.equal(outbox.items.length, 1, "email konfirmasi harus masuk antrean");
    assert.equal(outbox.items[0].status, "queued");
    assert.equal(outbox.items[0].to, "rina@rs.id");
    assert.match(outbox.items[0].text, /\/t\/[a-z2-9]{32}/);
  });

  it("status publik hanya menampilkan pembaruan publik", async () => {
    const { created, ticket } = await createGuestTicket();

    await org.support.client.json("POST", `/api/itsm/tickets/${ticket.id}/comments`, {
      body: {
        body: "Catatan internal: jangan tampil ke pelapor.",
        visibility: "internal",
      },
    });
    await org.support.client.json("POST", `/api/itsm/tickets/${ticket.id}/comments`, {
      body: {
        body: "Tim IT sedang memeriksa laporan Anda.",
        visibility: "public",
      },
    });

    const status = await publicStatus(created.public_token);
    const serialized = JSON.stringify(status.data);

    assert.equal(status.status, 200);
    assert.equal(
      serialized.includes("Catatan internal: jangan tampil"),
      false,
      "komentar internal tidak boleh bocor"
    );
    assert.equal(
      serialized.includes("Tim IT sedang memeriksa laporan Anda."),
      true,
      "komentar publik harus tampil"
    );
  });

  it("CSAT tamu hanya bisa dikirim sekali setelah tiket selesai", async () => {
    const { created, ticket } = await createGuestTicket();

    const early = await publicCsat(created.public_token, { score: 5 });
    assert.equal(early.status, 400);
    assert.match(String(early.data.message), /selesai|ditutup/i);

    await resolveTicket(ticket.id);

    const afterResolve = await publicStatus(created.public_token);
    assert.equal(afterResolve.data.ticket.status, "resolved");
    assert.equal(afterResolve.data.can_submit_csat, true);
    assert.match(
      afterResolve.data.ticket.resolution_summary,
      /Koneksi ke server SIMRS/
    );

    const submitted = await publicCsat(created.public_token, {
      score: 4,
      comment: "Respons cepat, komunikasi jelas.",
    });

    assert.equal(submitted.status, 201, JSON.stringify(submitted.data));
    assert.equal(submitted.data.score, 4);
    assert.equal(submitted.data.source, "guest");

    const duplicate = await publicCsat(created.public_token, { score: 5 });
    assert.equal(duplicate.status, 400);
    assert.match(String(duplicate.data.message), /sudah dikirim/i);

    const status = await publicStatus(created.public_token);
    assert.equal(status.data.csat.score, 4);
    assert.equal(status.data.can_submit_csat, false);

    const audits = await org.admin.list("audit_logs", {
      filter: `ticket="${ticket.id}" && action="csat"`,
      perPage: 5,
    });
    assert.equal(audits.items.length, 1);
    assert.equal(audits.items[0].actor_role, "guest");
  });

  it("tautan status yang tidak dikenal ditolak", async () => {
    const result = await publicStatus("tidak-ada-token-status-tiket");
    assert.equal(result.status, 404);
  });
});
