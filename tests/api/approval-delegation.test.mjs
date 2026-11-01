// Delegasi approval: meneruskan satu tahap yang sedang menunggu ke approver
// pengganti, dengan alasan wajib dan jejak audit.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import {
  addMember,
  approvalSteps,
  createTicket,
  decide,
  delegateApproval,
  seedOrg,
  uniqueLabel,
} from "../lib/fixtures.mjs";

let org;
let deputy;
let lead2;
let sr;

before(async () => {
  org = await seedOrg({ label: uniqueLabel("delegasi") });

  lead2 = await addMember(org.admin, {
    tenantId: org.tenant.id,
    unitId: org.itUnit.id,
    role: "it_lead",
    label: "lead2",
    name: "Lead Kedua",
  });

  deputy = await addMember(org.admin, {
    tenantId: org.tenant.id,
    unitId: org.unit.id,
    role: "requester",
    label: "wakil",
    name: "Wakil Manajer",
  });

  sr = await createTicket(org.requester.client, {
    type: "service_request",
    title: "Reset akun kasir untuk uji delegasi",
    description: "Akun kasir terkunci dan perlu direset oleh tim IT.",
  });
});

describe("validasi delegasi", () => {
  it("alasan delegasi wajib diisi", async () => {
    const { status } = await org.manager.client.request(
      "POST",
      `/api/itsm/tickets/${sr.id}/approval`,
      { body: { decision: "delegated", delegate: deputy.user.id, note: "" } }
    );

    assert.equal(status, 400);
  });

  it("hanya approver aktif atau IT Lead yang boleh mendelegasikan", async () => {
    const { status } = await org.support.client.request(
      "POST",
      `/api/itsm/tickets/${sr.id}/approval`,
      {
        body: {
          decision: "delegated",
          delegate: deputy.user.id,
          note: "Coba delegasi oleh support",
        },
      }
    );

    assert.equal(status, 403);
  });

  it("delegasi ke diri sendiri ditolak", async () => {
    const { status } = await org.manager.client.request(
      "POST",
      `/api/itsm/tickets/${sr.id}/approval`,
      {
        body: {
          decision: "delegated",
          delegate: org.manager.user.id,
          note: "Delegasi ke diri sendiri",
        },
      }
    );

    assert.equal(status, 400);
  });

  it("delegasi ke pengguna nonaktif ditolak", async () => {
    const inactive = await addMember(org.admin, {
      tenantId: org.tenant.id,
      unitId: org.unit.id,
      role: "requester",
      label: "nonaktif",
      isActive: false,
    });

    const { status } = await org.manager.client.request(
      "POST",
      `/api/itsm/tickets/${sr.id}/approval`,
      {
        body: {
          decision: "delegated",
          delegate: inactive.user.id,
          note: "Delegasi ke pengguna nonaktif",
        },
      }
    );

    assert.equal(status, 400);
  });
});

describe("delegasi tahap manajer unit", () => {
  it("manajer mendelegasikan tahap 1 ke wakilnya", async () => {
    const result = await delegateApproval(
      org.manager.client,
      sr.id,
      deputy.user.id,
      "Manajer cuti sampai Jumat"
    );

    assert.equal(result.delegate, deputy.user.id);
    assert.equal(result.step, 1);
    assert.equal(result.approval_status, "pending");

    const steps = await approvalSteps(org.lead.client, sr.id);
    assert.equal(steps[0].approver, deputy.user.id);
    assert.equal(steps[0].delegated_from, org.manager.user.id);
    assert.equal(steps[0].delegated_by, org.manager.user.id);
    assert.ok(steps[0].delegated_at);
    assert.equal(steps[0].delegation_note, "Manajer cuti sampai Jumat");
  });

  it("pengganti menerima notifikasi delegasi", async () => {
    const notes = await deputy.client.list("notifications", {
      filter: `ticket="${sr.id}"`,
      perPage: 50,
    });

    assert.ok(
      notes.items.some((note) => /delegasi/i.test(note.title)),
      "pengganti harus menerima notifikasi delegasi"
    );
  });

  it("approver asli tidak bisa lagi memutuskan tahap itu", async () => {
    const { status } = await org.manager.client.request(
      "POST",
      `/api/itsm/tickets/${sr.id}/approval`,
      { body: { decision: "approved", note: "Coba setujui setelah delegasi" } }
    );

    assert.equal(status, 403);
  });

  it("audit mencatat aksi delegasi", async () => {
    const logs = await org.lead.client.list("audit_logs", {
      filter: `ticket="${sr.id}"`,
      perPage: 100,
    });
    const delegated = logs.items.filter((item) => item.action === "delegate");

    assert.equal(delegated.length, 1);
    assert.equal(delegated[0].changes.step, 1);
    assert.equal(delegated[0].changes.to, deputy.user.id);
  });

  it("pengganti menyetujui tahap 1 dan tahap IT Lead menjadi aktif", async () => {
    const result = await decide(
      deputy.client,
      sr.id,
      "approved",
      "Disetujui wakil manajer"
    );

    assert.equal(result.approval_status, "pending");
    assert.equal(result.next_step, 2);
  });
});

describe("delegasi tahap IT Lead", () => {
  it("tahap IT Lead hanya dapat didelegasikan ke IT Lead", async () => {
    const { status } = await org.lead.client.request(
      "POST",
      `/api/itsm/tickets/${sr.id}/approval`,
      {
        body: {
          decision: "delegated",
          delegate: org.requester.user.id,
          note: "Coba delegasi ke requester",
        },
      }
    );

    assert.equal(status, 400);
  });

  it("IT Lead mendelegasikan tahap 2 ke lead lain", async () => {
    const result = await delegateApproval(
      org.lead.client,
      sr.id,
      lead2.user.id,
      "Lead sedang di luar kantor"
    );

    assert.equal(result.delegate, lead2.user.id);
    assert.equal(result.step, 2);

    const steps = await approvalSteps(org.lead.client, sr.id);
    assert.equal(steps[1].approver, lead2.user.id);
    assert.equal(steps[1].delegated_by, org.lead.user.id);
  });

  it("lead pengganti menyelesaikan approval", async () => {
    const result = await decide(lead2.client, sr.id, "approved", "Disetujui lead kedua");

    assert.equal(result.approval_status, "approved");

    const steps = await approvalSteps(org.lead.client, sr.id);
    assert.ok(steps.every((step) => step.status === "approved"));
  });

  it("riwayat memuat dua delegasi", async () => {
    const logs = await org.lead.client.list("audit_logs", {
      filter: `ticket="${sr.id}"`,
      perPage: 100,
    });
    const delegated = logs.items.filter((item) => item.action === "delegate");

    assert.equal(delegated.length, 2);
    assert.deepEqual(
      delegated.map((item) => item.changes.step).sort(),
      [1, 2]
    );
  });
});
