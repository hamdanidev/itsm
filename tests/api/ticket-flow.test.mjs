// Alur tiket end-to-end lewat API: approval dua tahap, transisi status,
// jeda SLA, resolusi, tutup, dan buka kembali.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import {
  approvalSteps,
  assignTicket,
  createTicket,
  decide,
  seedOrg,
  ticketRecord,
  transition,
  uniqueLabel,
} from "../lib/fixtures.mjs";
import { expectStatus } from "../lib/api-client.mjs";

const TOLERANCE_MS = 3000;

let org;
let sr;

before(async () => {
  org = await seedOrg({ label: uniqueLabel("alur") });
  sr = await createTicket(org.requester.client, {
    type: "service_request",
    title: "Permintaan reset akun kasir untuk uji alur",
    description: "Akun kasir terkunci dan perlu direset oleh tim IT.",
  });
});


describe("approval dua tahap", () => {
  it("Service Request membuat tahap manajer unit lalu IT Lead", async () => {
    const steps = await approvalSteps(org.lead.client, sr.id);

    assert.equal(steps.length, 2);
    assert.equal(steps[0].kind, "unit_manager");
    assert.equal(steps[0].approver, org.manager.user.id);
    assert.equal(steps[0].status, "pending");
    assert.equal(steps[1].kind, "it_lead");
    assert.equal(steps[1].status, "pending");
  });

  it("pekerjaan tertahan selama approval belum final", async () => {
    const { status, data } = await org.support.client.request(
      "POST",
      `/api/itsm/tickets/${sr.id}/transition`,
      { body: { status: "in_progress" } }
    );

    assert.equal(status, 400);
    assert.match(String(data.message), /approval/i);
  });

  it("manajer unit menyetujui tahap 1 dan status tetap menunggu", async () => {
    const result = await decide(org.manager.client, sr.id, "approved", "Disetujui manajer");

    assert.equal(result.approval_status, "pending");

    const steps = await approvalSteps(org.lead.client, sr.id);
    assert.equal(steps[0].status, "approved");
    assert.equal(steps[1].status, "pending");

    const ticket = await ticketRecord(org.admin, sr.id);
    assert.equal(ticket.approval_status, "pending");
  });

  it("IT Lead menyetujui tahap akhir dan gate SLA pindah ke penyelesaian", async () => {
    const result = await decide(org.lead.client, sr.id, "approved", "Disetujui lead");

    assert.equal(result.approval_status, "approved");

    const ticket = await ticketRecord(org.admin, sr.id);
    assert.equal(ticket.approval_status, "approved");
    assert.equal(ticket.approved_by, org.lead.user.id);
    assert.equal(ticket.next_due_at, ticket.resolution_due_at);
  });
});

describe("siklus kerja, jeda, dan reopen", () => {
  it("assign, mulai, dan tunggu requester menjeda jam penyelesaian", async () => {
    const assigned = await assignTicket(org.support.client, sr.id, org.support.user.id);
    assert.equal(assigned.assignee, org.support.user.id);

    const started = await transition(org.support.client, sr.id, "in_progress");
    assert.equal(started.status, "in_progress");

    const dueBefore = started.resolution_due_at;
    const waiting = await transition(org.support.client, sr.id, "waiting");
    assert.equal(waiting.status, "waiting");

    const record = await ticketRecord(org.admin, sr.id);
    assert.ok(record.sla_paused_at, "sla_paused_at harus terisi");
    assert.equal(record.resolution_due_at, dueBefore, "tenggat tidak berubah saat jeda");

    const resolveWhileWaiting = await org.support.client.request(
      "POST",
      `/api/itsm/tickets/${sr.id}/transition`,
      {
        body: {
          status: "resolved",
          resolution_summary: "Mencoba menutup saat still waiting",
          resolution_code: "fixed",
        },
      }
    );
    assert.equal(resolveWhileWaiting.status, 400);
  });

  it("melanjutkan pekerjaan menggeser tenggat persis selama jeda", async () => {
    const pausedAt = new Date(Date.now() - 90 * 60_000).toISOString();
    await org.admin.update("tickets", sr.id, { sla_paused_at: pausedAt });

    const before = await ticketRecord(org.admin, sr.id);
    const resumed = await transition(org.support.client, sr.id, "in_progress");

    assert.equal(resumed.status, "in_progress");
    assert.equal(resumed.sla_paused_minutes, 90);

    const expected = new Date(before.resolution_due_at).getTime() + 90 * 60_000;
    const actual = new Date(resumed.resolution_due_at).getTime();

    assert.ok(
      Math.abs(actual - expected) <= TOLERANCE_MS,
      `tenggat harus bergeser 90 menit (expected ${new Date(expected).toISOString()}, dapat ${new Date(actual).toISOString()})`
    );

    const after = await ticketRecord(org.admin, sr.id);
    assert.equal(after.sla_paused_at, "");
  });

  it("resolusi divalidasi, lalu tiket bisa ditutup", async () => {
    const tooShort = await org.support.client.request(
      "POST",
      `/api/itsm/tickets/${sr.id}/transition`,
      { body: { status: "resolved", resolution_summary: "pendek", resolution_code: "fixed" } }
    );
    assert.equal(tooShort.status, 400);

    const resolved = await transition(org.support.client, sr.id, "resolved", {
      resolution_summary: "Password direset dan akun kasir diaktifkan kembali.",
      resolution_code: "fixed",
    });
    assert.equal(resolved.status, "resolved");
    assert.ok(resolved.resolved_at);

    const closed = await transition(org.support.client, sr.id, "closed");
    assert.equal(closed.status, "closed");
  });

  it("requester membuka kembali tiket dan siklus SLA dimulai ulang", async () => {
    const reopened = await transition(org.requester.client, sr.id, "reopened");

    assert.equal(reopened.status, "reopened");
    assert.equal(reopened.reopen_count, 1);
    assert.ok(reopened.resolution_due_at);
    assert.ok(
      new Date(reopened.resolution_due_at).getTime() > Date.now(),
      "tenggat penyelesaian baru harus di masa depan"
    );

    const record = await ticketRecord(org.admin, sr.id);
    assert.equal(record.resolved_at, "");
    assert.equal(record.resolution_summary, "");
    assert.equal(record.closed_at, "");
    assert.equal(record.reopen_count, 1);
  });

  it("audit log mencatat create, approve, assign, dan transisi", async () => {
    const logs = await org.lead.client.list("audit_logs", {
      filter: `ticket="${sr.id}"`,
      perPage: 100,
    });
    const actions = new Set(logs.items.map((item) => item.action));

    for (const expected of ["create", "approve", "assign", "transition"]) {
      assert.ok(actions.has(expected), `audit harus memuat aksi ${expected}`);
    }
  });
});

describe("penolakan dan override", () => {
  it("penolakan menghentikan alur dan hanya lead yang bisa override", async () => {
    const rejectedTicket = await createTicket(org.requester.client, {
      type: "service_request",
      title: "Permintaan yang akan ditolak manajer",
      description: "Permintaan uji untuk memastikan penolakan menghentikan alur.",
    });

    const rejected = await decide(
      org.manager.client,
      rejectedTicket.id,
      "rejected",
      "Anggaran belum tersedia"
    );
    assert.equal(rejected.approval_status, "rejected");

    await expectStatus(
      org.support.client.request(
        "POST",
        `/api/itsm/tickets/${rejectedTicket.id}/approval`,
        { body: { decision: "approved" } }
      ),
      403,
      "override oleh support"
    );

    const overridden = await decide(
      org.lead.client,
      rejectedTicket.id,
      "approved",
      "Override lead setelah penolakan"
    );
    assert.equal(overridden.approval_status, "approved");

    const steps = await approvalSteps(org.lead.client, rejectedTicket.id);
    assert.ok(steps.every((step) => step.status === "approved"));
  });

  it("penolakan tanpa alasan ditolak validasi", async () => {
    const ticket = await createTicket(org.requester.client, {
      type: "service_request",
      title: "Permintaan untuk uji validasi alasan",
      description: "Memastikan penolakan wajib menyertakan alasan yang jelas.",
    });

    const { status } = await org.manager.client.request(
      "POST",
      `/api/itsm/tickets/${ticket.id}/approval`,
      { body: { decision: "rejected", note: "" } }
    );

    assert.equal(status, 400);
  });
});
