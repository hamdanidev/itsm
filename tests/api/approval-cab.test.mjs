// Tahap CAB untuk Change Request berisiko tinggi dan SLA per tahap approval.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import {
  addMember,
  approvalSteps,
  createTicket,
  decide,
  delegateApproval,
  seedOrg,
  ticketRecord,
  uniqueLabel,
} from "../lib/fixtures.mjs";

const TOLERANCE_MS = 120_000;

const HIGH_RISK_CHANGE = {
  type: "change_request",
  impact: "clinical_workflow",
  change_risk: "high",
  title: "Pembaruan endpoint bridging BPJS",
  description: "Endpoint lama dinonaktifkan dan perlu pembaruan konfigurasi.",
  implementation_plan: "Perbarui endpoint dan sertifikat, lalu uji verifikasi SEP.",
  rollback_plan: "Kembalikan konfigurasi lama bila verifikasi gagal.",
};

let org;
let lead2;
let cr;
let singleOrg;
let singleCr;

before(async () => {
  org = await seedOrg({ label: uniqueLabel("cab") });

  lead2 = await addMember(org.admin, {
    tenantId: org.tenant.id,
    unitId: org.itUnit.id,
    role: "it_lead",
    label: "lead2",
    name: "Lead Kedua",
  });

  const plannedStart = new Date(Date.now() + 5 * 86_400_000);
  const plannedEnd = new Date(plannedStart.getTime() + 3 * 3_600_000);

  cr = await createTicket(org.requester.client, {
    ...HIGH_RISK_CHANGE,
    planned_start: plannedStart.toISOString(),
    planned_end: plannedEnd.toISOString(),
  });

  singleOrg = await seedOrg({
    label: uniqueLabel("cabtunggal"),
    isolatedTenant: true,
  });
  const singleStart = new Date(Date.now() + 6 * 86_400_000);
  singleCr = await createTicket(singleOrg.requester.client, {
    ...HIGH_RISK_CHANGE,
    planned_start: singleStart.toISOString(),
    planned_end: new Date(singleStart.getTime() + 3_600_000).toISOString(),
  });
});

describe("rencana approval", () => {
  it("CR high risk dengan dua IT Lead memakai tahap CAB", async () => {
    const steps = await approvalSteps(org.lead.client, cr.id);

    assert.equal(steps.length, 3);
    assert.deepEqual(
      steps.map((step) => step.kind),
      ["unit_manager", "it_lead", "cab"]
    );
  });

  it("CR high risk dengan satu IT Lead melewati tahap CAB", async () => {
    const steps = await approvalSteps(singleOrg.lead.client, singleCr.id);

    assert.equal(steps.length, 2);
    assert.deepEqual(
      steps.map((step) => step.kind),
      ["unit_manager", "it_lead"]
    );
  });

  it("CR risiko rendah tidak memakai tahap CAB", async () => {
    const lowRisk = await createTicket(org.requester.client, {
      ...HIGH_RISK_CHANGE,
      change_risk: "medium",
      title: "Perubahan alur antrean farmasi",
      description: "Mengubah urutan pemanggilan antrean farmasi rawat jalan.",
    });

    const steps = await approvalSteps(org.lead.client, lowRisk.id);
    assert.deepEqual(
      steps.map((step) => step.kind),
      ["unit_manager", "it_lead"]
    );
  });
});

describe("SLA per tahap approval", () => {
  it("tenggat tahap dihitung ulang saat tahap itu aktif", async () => {
    const past = new Date(Date.now() - 5 * 3_600_000).toISOString();
    const stepsBefore = await approvalSteps(org.lead.client, cr.id);

    await org.admin.update("tickets", cr.id, {
      approval_due_at: past,
      next_due_at: past,
    });
    await org.admin.update("ticket_approvals", stepsBefore[0].id, {
      due_at: past,
    });

    const result = await decide(
      org.manager.client,
      cr.id,
      "approved",
      "Disetujui manajer"
    );

    assert.equal(result.next_step, 2);
    assert.ok(
      new Date(result.approval_due_at).getTime() > Date.now(),
      "tenggat tahap baru harus di masa depan"
    );

    const steps = await approvalSteps(org.lead.client, cr.id);
    assert.equal(steps[1].due_at, result.approval_due_at);

    const ticket = await ticketRecord(org.admin, cr.id);
    assert.equal(ticket.approval_due_at, steps[1].due_at);
    assert.equal(ticket.next_due_at, steps[1].due_at);
    assert.ok(
      new Date(ticket.approval_due_at).getTime() >
        new Date(past).getTime() + 3_600_000,
      "tenggat tidak boleh menyalin tenggat lama yang sudah lewat"
    );
  });
});

describe("empat mata pada tahap CAB", () => {
  it("IT Lead pertama menyetujui tahap IT Lead", async () => {
    const result = await decide(org.lead.client, cr.id, "approved", "Disetujui lead pertama");

    assert.equal(result.approval_status, "pending");
    assert.equal(result.next_step, 3);
  });

  it("lead yang sama tidak boleh memutuskan CAB", async () => {
    const { status, data } = await org.lead.client.request(
      "POST",
      `/api/itsm/tickets/${cr.id}/approval`,
      { body: { decision: "approved", note: "Coba setujui CAB" } }
    );

    assert.equal(status, 403);
    assert.match(String(data.message), /CAB/);
  });

  it("CAB tidak boleh didelegasikan kembali ke lead yang sama", async () => {
    const { status } = await lead2.client.request(
      "POST",
      `/api/itsm/tickets/${cr.id}/approval`,
      {
        body: {
          decision: "delegated",
          delegate: org.lead.user.id,
          note: "Coba delegasikan CAB ke lead pertama",
        },
      }
    );

    assert.equal(status, 400);
  });

  it("lead kedua menyelesaikan CAB dan gate SLA pindah ke jadwal", async () => {
    const result = await decide(lead2.client, cr.id, "approved", "Disetujui CAB");

    assert.equal(result.approval_status, "approved");

    const ticket = await ticketRecord(org.admin, cr.id);
    assert.equal(ticket.next_due_at, ticket.planned_end);

    const steps = await approvalSteps(org.lead.client, cr.id);
    assert.equal(steps.length, 3);
    assert.ok(steps.every((step) => step.status === "approved"));
  });

  it("audit menandai keputusan CAB", async () => {
    const logs = await org.lead.client.list("audit_logs", {
      filter: `ticket="${cr.id}"`,
      perPage: 100,
    });

    const cabApproval = logs.items.find(
      (item) => item.action === "approve" && item.changes.kind === "cab"
    );

    assert.ok(cabApproval, "audit harus memuat persetujuan CAB");
  });
});
