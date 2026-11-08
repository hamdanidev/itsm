// Merge tiket duplikat: tiket sumber ditutup, riwayat dipindahkan, audit dan
// notifikasi tercatat, dan aturan keamanan/validasi tetap berlaku.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import {
  createTicket,
  postComment,
  seedOrg,
  ticketRecord,
  uniqueLabel,
} from "../lib/fixtures.mjs";

let org;

async function merge(sourceId, targetId, note = "Duplikat laporan yang sama.") {
  return org.support.client.json("POST", `/api/itsm/tickets/${sourceId}/merge`, {
    body: { target: targetId, note },
  });
}

before(async () => {
  org = await seedOrg({
    label: uniqueLabel("merge"),
    isolatedTenant: true,
  });
});

describe("merge tiket duplikat", () => {
  it("menutup sumber, memindahkan riwayat, dan menulis audit di kedua tiket", async () => {
    const target = await createTicket(org.requester.client, {
      title: "SIMRS tidak bisa dibuka di triage",
      description: "Layar putih setelah login pada semua komputer triage.",
    });
    const source = await createTicket(org.requester.client, {
      title: "SIMRS error di pendaftaran",
      description: "Masalah yang sama: layar putih setelah login di pendaftaran.",
    });

    await postComment(
      org.requester.client,
      source.id,
      "Kejadian yang sama dengan tiket triage."
    );

    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    const form = new FormData();
    form.append("file", new Blob([png], { type: "image/png" }), "bukti.png");
    form.append("visibility", "public");
    await org.support.client.request(
      "POST",
      `/api/itsm/tickets/${source.id}/attachments`,
      { form }
    );

    const result = await merge(source.id, target.id, "Satu gangguan SIMRS.");

    assert.equal(result.source.status, "closed");
    assert.equal(result.target.ticket_no, target.ticket_no);

    const mergedSource = await ticketRecord(org.admin, source.id);
    assert.equal(mergedSource.status, "closed");
    assert.equal(mergedSource.merged_into, target.id);
    assert.equal(mergedSource.resolution_code, "duplicate");
    assert.match(mergedSource.resolution_summary, new RegExp(target.ticket_no));
    assert.equal(mergedSource.next_due_at, "");

    const sourceComments = await org.admin.list("ticket_comments", {
      filter: `ticket="${source.id}"`,
    });
    const targetComments = await org.admin.list("ticket_comments", {
      filter: `ticket="${target.id}"`,
    });
    assert.equal(sourceComments.totalItems, 0);
    assert.equal(targetComments.totalItems, 1);

    const sourceAttachments = await org.admin.list("ticket_attachments", {
      filter: `ticket="${source.id}"`,
    });
    const targetAttachments = await org.admin.list("ticket_attachments", {
      filter: `ticket="${target.id}"`,
    });
    assert.equal(sourceAttachments.totalItems, 0);
    assert.equal(targetAttachments.totalItems, 1);

    const sourceAudit = await org.admin.list("audit_logs", {
      filter: `ticket="${source.id}" && action="merge"`,
    });
    const targetAudit = await org.admin.list("audit_logs", {
      filter: `ticket="${target.id}" && action="merge"`,
    });
    assert.equal(sourceAudit.totalItems, 1);
    assert.equal(targetAudit.totalItems, 1);
    assert.equal(sourceAudit.items[0].changes.target_no, target.ticket_no);

    const notifications = await org.admin.list("notifications", {
      filter: `ticket="${source.id}" && title="Tiket digabung"`,
    });
    assert.equal(notifications.totalItems, 1);
    assert.equal(notifications.items[0].user, org.requester.user.id);
  });

  it("menolak merge ke diri sendiri, jenis berbeda, dan tiket yang sudah selesai", async () => {
    const source = await createTicket(org.requester.client, {
      title: "Printer IGD macet",
      description: "Printer tidak mengeluarkan label pasien sejak pagi.",
    });
    const request = await createTicket(org.requester.client, {
      type: "service_request",
      title: "Minta akses laporan",
      description: "Akses laporan bulanan untuk kepala unit.",
    });

    const self = await org.support.client.request(
      "POST",
      `/api/itsm/tickets/${source.id}/merge`,
      { body: { target: source.id } }
    );
    assert.equal(self.status, 400);

    const wrongType = await org.support.client.request(
      "POST",
      `/api/itsm/tickets/${source.id}/merge`,
      { body: { target: request.id } }
    );
    assert.equal(wrongType.status, 400);

    await org.support.client.json("POST", `/api/itsm/tickets/${source.id}/assign`, {
      body: { assignee: org.support.user.id },
    });
    await org.support.client.json(
      "POST",
      `/api/itsm/tickets/${source.id}/transition`,
      { body: { status: "in_progress" } }
    );
    await org.support.client.json(
      "POST",
      `/api/itsm/tickets/${source.id}/transition`,
      {
        body: {
          status: "resolved",
          resolution_summary: "Printer sudah diganti dengan unit cadangan.",
          resolution_code: "fixed",
        },
      }
    );

    const closedSource = await createTicket(org.requester.client, {
      title: "Tiket aktif lain",
      description: "Tiket ini masih aktif dan bisa menjadi tujuan merge.",
    });

    const closed = await org.support.client.request(
      "POST",
      `/api/itsm/tickets/${closedSource.id}/merge`,
      { body: { target: source.id } }
    );
    assert.equal(closed.status, 400);
  });

  it("menolak requester dan tiket lintas rumah sakit", async () => {
    const source = await createTicket(org.requester.client, {
      title: "Jaringan ruang farmasi putus",
      description: "Akses jaringan di farmasi hilang sejak pagi.",
    });
    const target = await createTicket(org.requester.client, {
      title: "Jaringan farmasi tidak stabil",
      description: "Koneksi jaringan farmasi terputus-putus.",
    });

    const forbidden = await org.requester.client.request(
      "POST",
      `/api/itsm/tickets/${source.id}/merge`,
      { body: { target: target.id } }
    );
    assert.equal(forbidden.status, 403);

    const other = await seedOrg({
      label: uniqueLabel("merge-other"),
      isolatedTenant: true,
    });
    const foreign = await createTicket(other.requester.client, {
      title: "Tiket rumah sakit lain",
      description: "Tiket ini milik tenant yang berbeda.",
    });

    const crossTenant = await org.support.client.request(
      "POST",
      `/api/itsm/tickets/${source.id}/merge`,
      { body: { target: foreign.id } }
    );
    assert.equal(crossTenant.status, 404);
  });

  it("tiket sumber yang sudah digabung tidak dapat digabung lagi", async () => {
    const target = await createTicket(org.requester.client, {
      title: "Aplikasi farmasi error",
      description: "Aplikasi farmasi menampilkan error saat menyimpan resep.",
    });
    const source = await createTicket(org.requester.client, {
      title: "Error simpan resep farmasi",
      description: "Error yang sama saat menyimpan resep di farmasi.",
    });

    await merge(source.id, target.id);

    const again = await org.support.client.request(
      "POST",
      `/api/itsm/tickets/${source.id}/merge`,
      { body: { target: target.id } }
    );
    assert.equal(again.status, 400);
  });
});
