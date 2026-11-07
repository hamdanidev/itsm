// Increment A: katalog layanan, approval per item, SLA per layanan, triage,
// on-behalf, dan hasil perubahan.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import {
  approvalSteps,
  createTicket,
  decide,
  seedOrg,
  ticketRecord,
  transition,
  uniqueLabel,
} from "../lib/fixtures.mjs";

let org;
let otherOrg;
let service;
let itemNone;
let itemManager;
let policy;
let nextCode = 0;

function code(prefix) {
  nextCode += 1;
  return `${prefix}${nextCode}${Date.now().toString(36).slice(-4)}`.toUpperCase();
}

before(async () => {
  org = await seedOrg({ label: uniqueLabel("catalog") });
  otherOrg = await seedOrg({
    label: uniqueLabel("catalog-other"),
    isolatedTenant: true,
  });

  service = await org.admin.create("services", {
    tenant: org.tenant.id,
    name: "Layanan Uji Katalog",
    code: code("SVC"),
    description: "Layanan untuk pengujian katalog dan SLA per layanan.",
    support_unit: org.itUnit.id,
    is_active: true,
  });

  itemNone = await org.admin.create("service_items", {
    tenant: org.tenant.id,
    service: service.id,
    name: "Reset password uji",
    code: "RESET",
    description: "Permintaan rutin tanpa approval.",
    approval_mode: "none",
    sort: 10,
    is_active: true,
  });

  itemManager = await org.admin.create("service_items", {
    tenant: org.tenant.id,
    service: service.id,
    name: "Akses baru uji",
    code: "AKSES",
    description: "Permintaan akses dengan approval manajer unit.",
    approval_mode: "manager",
    sort: 20,
    is_active: true,
  });

  const policies = await org.admin.list("sla_policies", {
    filter: `tenant="${org.tenant.id}" && ticket_type="service_request" && priority="normal"`,
    perPage: 1,
  });
  policy = policies.items[0];
});

describe("katalog layanan", () => {
  it("requester dapat membaca katalog tenant-nya", async () => {
    const list = await org.requester.client.list("services", {
      filter: `tenant="${org.tenant.id}" && is_active=true`,
    });

    assert.ok(list.items.some((record) => record.id === service.id));
    assert.ok(list.items.length >= 6, "seed layanan default harus tersedia");
  });

  it("kode layanan dinormalisasi dan item lintas tenant ditolak", async () => {
    const created = await org.admin.create("services", {
      tenant: org.tenant.id,
      name: "Layanan Kode Kecil",
      code: code("kecil"),
      is_active: true,
    });

    assert.match(created.code, /^[A-Z0-9-]+$/);

    const otherService = await otherOrg.admin.create("services", {
      tenant: otherOrg.tenant.id,
      name: "Layanan RS Lain",
      code: code("OTHER"),
      is_active: true,
    });

    const response = await org.admin.request(
      "POST",
      "/api/collections/service_items/records",
      {
        body: {
          tenant: org.tenant.id,
          service: otherService.id,
          name: "Item lintas tenant",
          code: "CROSS",
          approval_mode: "none",
          is_active: true,
        },
      }
    );

    assert.equal(response.status, 400);
  });

  it("support tidak boleh menulis katalog", async () => {
    const response = await org.support.client.request(
      "POST",
      "/api/collections/services/records",
      {
        body: {
          tenant: org.tenant.id,
          name: "Layanan Ilegal",
          code: code("NO"),
          is_active: true,
        },
      }
    );

    assert.ok([400, 403].includes(response.status));
  });
});

describe("intake berbasis layanan", () => {
  it("item tanpa approval tidak membuat langkah approval", async () => {
    const ticket = await createTicket(org.requester.client, {
      type: "service_request",
      service: service.id,
      service_item: itemNone.id,
      impact: "operational",
      title: "Reset password akun SIMRS",
      description: "Mohon reset password akun SIMRS untuk staf unit rawat jalan.",
    });

    assert.equal(ticket.approval_mode, "none");
    assert.equal(ticket.approval_status, "not_required");
    assert.equal(ticket.service, service.id);
    assert.equal(ticket.service_item, itemNone.id);

    const steps = await approvalSteps(org.support.client, ticket.id);
    assert.equal(steps.length, 0);
  });

  it("item manager membuat tahap manajer unit", async () => {
    const ticket = await createTicket(org.requester.client, {
      type: "service_request",
      service: service.id,
      service_item: itemManager.id,
      impact: "operational",
      title: "Permintaan akses modul radiologi",
      description: "Mohon tambahkan akses modul radiologi untuk staf baru.",
    });

    assert.equal(ticket.approval_mode, "manager");
    assert.equal(ticket.approval_status, "pending");

    const steps = await approvalSteps(org.manager.client, ticket.id);
    assert.equal(steps.length, 1);
    assert.equal(steps[0].kind, "unit_manager");
    assert.equal(steps[0].approver, org.manager.user.id);
  });

  it("SLA layanan dipakai bila service punya default_sla", async () => {
    assert.ok(policy, "policy service_request normal harus tersedia");

    await org.admin.update("services", service.id, {
      default_sla: policy.id,
    });

    const ticket = await createTicket(org.requester.client, {
      type: "service_request",
      service: service.id,
      impact: "operational",
      title: "Permintaan layanan dengan SLA khusus",
      description: "Menguji bahwa policy layanan dipakai sebelum policy tipe.",
    });

    const record = await ticketRecord(org.admin, ticket.id);
    assert.equal(record.sla_policy, policy.id);
    assert.equal(record.sla_snapshot.response_minutes, policy.response_minutes);
    assert.equal(record.sla_snapshot.approval_minutes, policy.approval_minutes);
    assert.equal(
      record.sla_snapshot.resolution_minutes,
      policy.resolution_minutes
    );
  });

  it("staf dapat mencatat tiket atas nama pengguna dan sumber telepon", async () => {
    const ticket = await createTicket(org.support.client, {
      type: "incident",
      service: service.id,
      source: "phone",
      requested_for: org.requester.user.id,
      location: "Poli Anak lantai 2",
      impact: "clinical_workflow",
      title: "Telepon: e-resep tidak tercetak",
      description: "Dokter melaporkan melalui telepon bahwa e-resep tidak tercetak.",
    });

    const record = await ticketRecord(org.admin, ticket.id);
    assert.equal(record.requester, org.requester.user.id);
    assert.equal(record.requested_for, org.requester.user.id);
    assert.equal(record.created_by, org.support.user.id);
    assert.equal(record.unit, org.requester.user.unit);
    assert.equal(record.source, "phone");
    assert.equal(record.location, "Poli Anak lantai 2");
  });

  it("requester tidak boleh membuat tiket atas nama orang lain", async () => {
    const response = await org.requester.client.request(
      "POST",
      "/api/itsm/tickets",
      {
        body: {
          type: "incident",
          title: "Percobaan on-behalf",
          description: "Requester tidak boleh membuat tiket atas nama orang lain.",
          impact: "operational",
          patient_data_confirmed: true,
          requested_for: org.support.user.id,
        },
      }
    );

    assert.equal(response.status, 403);
  });
});

describe("triage", () => {
  it("triage mengubah prioritas, menghitung ulang SLA, dan menulis audit", async () => {
    const ticket = await createTicket(org.requester.client, {
      type: "incident",
      impact: "operational",
      title: "Printer farmasi tidak mencetak label",
      description: "Printer di loket farmasi berhenti mencetak label obat.",
    });

    const beforeRecord = await ticketRecord(org.admin, ticket.id);
    assert.equal(beforeRecord.priority, "normal");

    const triaged = await org.support.client.json(
      "POST",
      `/api/itsm/tickets/${ticket.id}/triage`,
      {
        body: {
          priority: "critical",
          impact: "patient_safety",
          reason: "Berdampak pada keselamatan pasien dan antrean obat.",
        },
      }
    );

    assert.equal(triaged.priority, "critical");
    assert.equal(triaged.impact, "patient_safety");

    const afterRecord = await ticketRecord(org.admin, ticket.id);
    assert.ok(
      new Date(afterRecord.response_due_at).getTime() <
        new Date(beforeRecord.response_due_at).getTime(),
      "tenggat respons kritis harus lebih cepat"
    );

    const audit = await org.admin.list("audit_logs", {
      filter: `ticket="${ticket.id}" && action="triage"`,
    });
    assert.equal(audit.items.length, 1);
    assert.equal(audit.items[0].changes.priority.from, "normal");
    assert.equal(audit.items[0].changes.priority.to, "critical");

    const requesterAttempt = await org.requester.client.request(
      "POST",
      `/api/itsm/tickets/${ticket.id}/triage`,
      { body: { priority: "low" } }
    );
    assert.equal(requesterAttempt.status, 403);
  });

  it("triage ke item tanpa approval membangun ulang alur approval", async () => {
    const ticket = await createTicket(org.requester.client, {
      type: "service_request",
      impact: "operational",
      title: "Permintaan awal tanpa katalog",
      description: "Tiket dibuat tanpa layanan, lalu ditriage ke item tanpa approval.",
    });

    const beforeSteps = await approvalSteps(org.support.client, ticket.id);
    assert.ok(beforeSteps.length >= 1);

    const triaged = await org.support.client.json(
      "POST",
      `/api/itsm/tickets/${ticket.id}/triage`,
      {
        body: {
          service: service.id,
          service_item: itemNone.id,
          reason: "Permintaan rutin, cukup dipenuhi tanpa approval.",
        },
      }
    );

    assert.equal(triaged.approval_mode, "none");
    assert.equal(triaged.approval_status, "not_required");

    const afterSteps = await approvalSteps(org.support.client, ticket.id);
    assert.equal(afterSteps.length, 0);
  });

  it("triage tanpa alasan ditolak", async () => {
    const ticket = await createTicket(org.requester.client, {
      type: "incident",
      impact: "operational",
      title: "Triage tanpa alasan",
      description: "Memastikan alasan triage wajib diisi minimal lima karakter.",
    });

    const response = await org.support.client.request(
      "POST",
      `/api/itsm/tickets/${ticket.id}/triage`,
      { body: { priority: "high" } }
    );

    assert.equal(response.status, 400);
  });

  it("triage ditolak setelah pekerjaan dimulai", async () => {
    const ticket = await createTicket(org.requester.client, {
      type: "incident",
      impact: "operational",
      title: "Gangguan jaringan setelah pekerjaan dimulai",
      description: "Tiket ini akan dimulai sebelum triage dicoba.",
    });

    await org.support.client.json(
      "POST",
      `/api/itsm/tickets/${ticket.id}/assign`,
      { body: { assignee: org.support.user.id } }
    );
    await transition(org.support.client, ticket.id, "in_progress");

    const response = await org.support.client.request(
      "POST",
      `/api/itsm/tickets/${ticket.id}/triage`,
      { body: { priority: "low" } }
    );

    assert.equal(response.status, 400);
  });
});

describe("hasil perubahan", () => {
  it("CR wajib mengisi outcome dan tanggal aktual saat resolved", async () => {
    const plannedStart = new Date(Date.now() + 86_400_000);
    const plannedEnd = new Date(plannedStart.getTime() + 3_600_000);

    const ticket = await createTicket(org.requester.client, {
      type: "change_request",
      impact: "operational",
      title: "Perubahan konfigurasi printer farmasi",
      description: "Menguji kewajiban outcome dan tanggal aktual pada change request.",
      change_risk: "low",
      planned_start: plannedStart.toISOString(),
      planned_end: plannedEnd.toISOString(),
      implementation_plan: "Perbarui driver printer dan uji cetak label.",
      rollback_plan: "Kembalikan driver lama bila cetak gagal.",
    });

    await decide(org.manager.client, ticket.id, "approved", "Disetujui manajer.");
    await decide(org.lead.client, ticket.id, "approved", "Disetujui IT Lead.");

    await org.support.client.json(
      "POST",
      `/api/itsm/tickets/${ticket.id}/assign`,
      { body: { assignee: org.support.user.id } }
    );
    await transition(org.support.client, ticket.id, "in_progress");

    const withoutOutcome = await org.support.client.request(
      "POST",
      `/api/itsm/tickets/${ticket.id}/transition`,
      {
        body: {
          status: "resolved",
          resolution_summary: "Driver berhasil diperbarui dan printer diuji.",
          resolution_code: "fixed",
        },
      }
    );
    assert.equal(withoutOutcome.status, 400);

    const resolved = await transition(org.support.client, ticket.id, "resolved", {
      resolution_summary: "Driver berhasil diperbarui dan printer diuji.",
      resolution_code: "fixed",
      change_outcome: "successful",
    });

    assert.equal(resolved.change_outcome, "successful");
    assert.ok(resolved.actual_start);
    assert.ok(resolved.actual_end);
  });
});
