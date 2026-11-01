// Perhitungan SLA di jalur pembuatan tiket: kalender, snapshot, gate, dan
// validasi input intake.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import {
  createTicket,
  seedOrg,
  ticketRecord,
  uniqueLabel,
} from "../lib/fixtures.mjs";

const MINUTE = 60_000;
const TOLERANCE = 120_000;

let org;

before(async () => {
  org = await seedOrg({ label: uniqueLabel("sla"), withManager: false });
});


function near(actualIso, expectedMs, tolerance = TOLERANCE) {
  const actual = new Date(actualIso).getTime();
  assert.ok(
    Math.abs(actual - expectedMs) <= tolerance,
    `waktu ${new Date(actual).toISOString()} tidak dekat dengan ${new Date(expectedMs).toISOString()}`
  );
}

describe("SLA saat tiket dibuat", () => {
  it("incident kritis memakai kalender 24x7", async () => {
    const startedAt = Date.now();
    const ticket = await createTicket(org.requester.client, {
      type: "incident",
      impact: "patient_safety",
      title: "Hasil laboratorium tidak muncul di rekam medis",
      description: "Dokter tidak melihat hasil laboratorium pasien di rekam medis elektronik.",
    });

    assert.equal(ticket.priority, "critical");
    near(ticket.response_due_at, startedAt + 15 * MINUTE);
    near(ticket.resolution_due_at, startedAt + 240 * MINUTE);
    assert.ok(!ticket.approval_due_at, "incident tidak punya SLA approval");

    const record = await ticketRecord(org.admin, ticket.id);
    assert.equal(record.sla_snapshot.calendar_mode, "24x7");
    assert.equal(record.sla_snapshot.response_minutes, 15);
    assert.equal(record.sla_snapshot.version, 1);
    assert.ok(record.sla_policy, "policy aktif harus direferensikan");
    assert.equal(record.next_due_at, record.resolution_due_at);
  });

  it("incident normal memakai jam kerja dan snapshot tersimpan", async () => {
    const ticket = await createTicket(org.requester.client, {
      type: "incident",
      impact: "operational",
      title: "Printer label farmasi tidak mencetak",
      description: "Printer label di loket farmasi dua tidak mengeluarkan label.",
    });

    assert.equal(ticket.priority, "normal");

    const record = await ticketRecord(org.admin, ticket.id);
    assert.equal(record.sla_snapshot.calendar_mode, "business_hours");
    assert.equal(record.sla_snapshot.business_start, "08:00");
    assert.equal(record.sla_snapshot.business_end, "17:00");
    assert.deepEqual(record.sla_snapshot.business_days, [1, 2, 3, 4, 5]);
    assert.ok(
      new Date(record.response_due_at).getTime() > Date.now(),
      "tenggat respons harus di masa depan"
    );
  });

  it("Service Request memakai approval sebagai gate berikutnya", async () => {
    const ticket = await createTicket(org.requester.client, {
      type: "service_request",
      impact: "operational",
      title: "Permintaan akun baru staf rekam medis",
      description: "Mohon dibuatkan akun untuk dua staf baru unit rekam medis.",
    });

    assert.ok(ticket.approval_due_at, "SR harus punya tenggat approval");

    const record = await ticketRecord(org.admin, ticket.id);
    assert.equal(record.next_due_at, ticket.approval_due_at);
    assert.equal(record.approval_status, "pending");
    assert.equal(record.sla_snapshot.approval_minutes, 240);
  });

  it("Change Request memakai jadwal implementasi setelah approval", async () => {
    const plannedStart = new Date(Date.now() + 3 * 86_400_000);
    const plannedEnd = new Date(plannedStart.getTime() + 2 * 3_600_000);

    const ticket = await createTicket(org.requester.client, {
      type: "change_request",
      impact: "clinical_workflow",
      title: "Pembaruan endpoint bridging BPJS",
      description: "Endpoint lama akan dinonaktifkan dan perlu pembaruan konfigurasi.",
      change_risk: "high",
      planned_start: plannedStart.toISOString(),
      planned_end: plannedEnd.toISOString(),
      implementation_plan: "Perbarui endpoint dan sertifikat, lalu uji verifikasi SEP.",
      rollback_plan: "Kembalikan konfigurasi lama bila verifikasi gagal.",
    });

    const record = await ticketRecord(org.admin, ticket.id);
    assert.equal(record.change_risk, "high");
    assert.equal(record.next_due_at, ticket.approval_due_at);
    assert.equal(record.sla_snapshot.resolution_minutes, 0);
  });
});

describe("validasi intake", () => {
  const base = {
    type: "incident",
    title: "Validasi intake tiket",
    description: "Deskripsi yang cukup panjang untuk lolos validasi.",
    impact: "operational",
  };

  it("attestation data pasien wajib", async () => {
    const { status } = await org.requester.client.request("POST", "/api/itsm/tickets", {
      body: { ...base },
    });
    assert.equal(status, 400);
  });

  it("judul dan deskripsi minimal divalidasi", async () => {
    const shortTitle = await org.requester.client.request("POST", "/api/itsm/tickets", {
      body: { ...base, title: "abc", patient_data_confirmed: true },
    });
    assert.equal(shortTitle.status, 400);

    const shortDescription = await org.requester.client.request(
      "POST",
      "/api/itsm/tickets",
      { body: { ...base, title: "Judul valid", description: "pendek", patient_data_confirmed: true } }
    );
    assert.equal(shortDescription.status, 400);
  });

  it("dampak klinis dan jenis tiket harus dikenal", async () => {
    const badImpact = await org.requester.client.request("POST", "/api/itsm/tickets", {
      body: { ...base, impact: "sangat-kritis", patient_data_confirmed: true },
    });
    assert.equal(badImpact.status, 400);

    const badType = await org.requester.client.request("POST", "/api/itsm/tickets", {
      body: { ...base, type: "problem", patient_data_confirmed: true },
    });
    assert.equal(badType.status, 400);
  });

  it("jadwal perubahan harus berurutan", async () => {
    const { status } = await org.requester.client.request("POST", "/api/itsm/tickets", {
      body: {
        ...base,
        type: "change_request",
        patient_data_confirmed: true,
        planned_start: new Date(Date.now() + 7_200_000).toISOString(),
        planned_end: new Date(Date.now() + 3_600_000).toISOString(),
      },
    });
    assert.equal(status, 400);
  });

  it("kategori yang tidak dikenal ditolak", async () => {
    const { status } = await org.requester.client.request("POST", "/api/itsm/tickets", {
      body: {
        ...base,
        title: "Kategori tidak dikenal",
        category: "kategori-tidak-ada",
        patient_data_confirmed: true,
      },
    });

    assert.equal(status, 400);
  });
});
