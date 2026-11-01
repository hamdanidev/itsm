// Laporan SLA: akses khusus IT Lead, agregasi, filter rentang, dan ekspor CSV.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import {
  createTicket,
  readEnv,
  seedOrg,
  ticketRecord,
  uniqueLabel,
} from "../lib/fixtures.mjs";
import { expectStatus } from "../lib/api-client.mjs";

const API = () => readEnv().url;
const TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
}).format(new Date());

let org;
let tickets;
let unitName;

function shift(iso, minutes) {
  return new Date(new Date(String(iso).replace(" ", "T")).getTime() + minutes * 60000)
    .toISOString();
}

function reportUrl(params = "") {
  return `/api/itsm/reports/sla${params ? `?${params}` : ""}`;
}

before(async () => {
  org = await seedOrg({ label: uniqueLabel("laporan"), isolatedTenant: true });
  unitName = org.unit.name;

  const t1 = await createTicket(org.requester.client, {
    type: "incident",
    impact: "operational",
    title: "Printer farmasi tidak mencetak label",
    description: "Printer di loket farmasi tidak mengeluarkan label resep.",
  });

  const t2 = await createTicket(org.requester.client, {
    type: "incident",
    impact: "patient_safety",
    title: "Hasil laboratorium tidak tampil",
    description: "Hasil laboratorium tidak muncul di rekam medis elektronik.",
  });

  const t3 = await createTicket(org.requester.client, {
    type: "service_request",
    impact: "operational",
    title: "Permintaan akun staf baru",
    description: "Mohon dibuatkan akun untuk staf baru unit rekam medis.",
  });

  const t4 = await createTicket(org.requester.client, {
    type: "change_request",
    impact: "clinical_workflow",
    change_risk: "medium",
    title: "Perubahan alur antrean farmasi",
    description: "Mengubah urutan pemanggilan antrean farmasi rawat jalan.",
    implementation_plan: "Ubah konfigurasi prioritas dan uji di staging.",
    rollback_plan: "Kembalikan konfigurasi lama bila uji gagal.",
  });

  const r1 = await ticketRecord(org.admin, t1.id);
  const r2 = await ticketRecord(org.admin, t2.id);
  const r4 = await ticketRecord(org.admin, t4.id);

  await org.admin.update("tickets", t1.id, {
    status: "resolved",
    resolved_at: shift(r1.created, 120),
    resolved_by: org.support.user.id,
    first_response_at: shift(r1.created, 30),
    first_response_by: org.support.user.id,
    resolution_code: "fixed",
  });

  await org.admin.update("tickets", t2.id, {
    response_breach_at: shift(r2.created, 20),
    escalation_level: 1,
  });

  await org.admin.update("tickets", t4.id, {
    status: "resolved",
    resolved_at: shift(r4.created, 600),
    resolved_by: org.support.user.id,
    resolution_breach_at: shift(r4.created, 500),
    escalation_level: 2,
    resolution_code: "workaround",
  });

  tickets = [t1, t2, t3, t4];
});

describe("akses laporan", () => {
  it("requester dan support ditolak", async () => {
    await expectStatus(
      org.requester.client.request("GET", reportUrl(`from=${TODAY}&to=${TODAY}`)),
      403,
      "laporan oleh requester"
    );

    await expectStatus(
      org.support.client.request("GET", reportUrl(`from=${TODAY}&to=${TODAY}`)),
      403,
      "laporan oleh support"
    );
  });

  it("IT Lead mendapatkan ringkasan sesuai data tenant", async () => {
    const report = await org.lead.client.json(
      "GET",
      reportUrl(`from=${TODAY}&to=${TODAY}`)
    );

    assert.equal(report.range.from, TODAY);
    assert.equal(report.range.days, 1);

    assert.equal(report.summary.total, 4);
    assert.equal(report.summary.resolved, 2);
    assert.equal(report.summary.breached, 2);
    assert.equal(report.summary.compliance, 50);
    assert.equal(report.summary.median_response_minutes, 30);
    assert.equal(report.summary.median_resolution_minutes, 360);

    assert.equal(report.trend.length, 1);
    assert.equal(report.trend[0].created, 4);
    assert.equal(report.trend[0].resolved, 2);

    const unit = report.units.find((item) => item.name === unitName);
    assert.ok(unit, "unit pemohon harus muncul di agregat");
    assert.equal(unit.summary.total, 4);

    const priorities = Object.fromEntries(
      report.priorities.map((item) => [item.name, item.summary.total])
    );
    assert.equal(priorities.critical, 1);
    assert.equal(priorities.high, 1);
    assert.equal(priorities.normal, 2);

    const types = Object.fromEntries(
      report.types.map((item) => [item.name, item.summary.total])
    );
    assert.equal(types.incident, 2);
    assert.equal(types.service_request, 1);
    assert.equal(types.change_request, 1);

    assert.equal(report.breaches.length, 2);
    assert.equal(report.breaches[0].escalation_level, 2);
  });

  it("rentang di luar data menghasilkan laporan kosong", async () => {
    const tomorrow = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
    }).format(new Date(Date.now() + 86400000));

    const report = await org.lead.client.json(
      "GET",
      reportUrl(`from=${tomorrow}&to=${tomorrow}`)
    );

    assert.equal(report.summary.total, 0);
    assert.equal(report.summary.compliance, null);
    assert.deepEqual(report.units, []);
  });

  it("rentang tidak valid ditolak", async () => {
    await expectStatus(
      org.lead.client.request("GET", reportUrl("from=2026-11-05&to=2026-11-01")),
      400,
      "rentang terbalik"
    );

    await expectStatus(
      org.lead.client.request("GET", reportUrl("from=2024-01-01&to=2026-11-01")),
      400,
      "rentang lebih dari 366 hari"
    );
  });

  it("bucket mingguan didukung", async () => {
    const report = await org.lead.client.json(
      "GET",
      reportUrl(`from=${TODAY}&to=${TODAY}&bucket=week`)
    );

    assert.equal(report.range.bucket, "week");
    assert.equal(report.trend.length, 1);
    assert.match(report.trend[0].key, /^\d{4}-W\d{2}$/);
  });
});

describe("ekspor CSV", () => {
  it("mengirim CSV per tiket dengan BOM dan header tetap", async () => {
    const response = await fetch(
      `${API()}/api/itsm/reports/sla.csv?from=${TODAY}&to=${TODAY}`,
      { headers: { Authorization: org.lead.client.token } }
    );

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/csv/);
    assert.match(
      response.headers.get("content-disposition"),
      /laporan-sla-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv/
    );

    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.deepEqual(Array.from(bytes.slice(0, 3)), [0xef, 0xbb, 0xbf]);

    const text = new TextDecoder().decode(bytes.slice(3));
    const lines = text.trim().split(/\r\n/);

    assert.match(lines[0], /^ticket_no,type,priority,unit,category,status,/);
    assert.equal(lines.length, 5, "header + 4 tiket");
    assert.ok(
      lines.some((line) => line.startsWith(tickets[0].ticket_no)),
      "nomor tiket harus ada di CSV"
    );
    assert.ok(
      lines.some((line) => line.includes(",yes,")),
      "kolom breach harus terisi"
    );
  });

  it("CSV juga khusus IT Lead", async () => {
    const response = await fetch(
      `${API()}/api/itsm/reports/sla.csv?from=${TODAY}&to=${TODAY}`,
      { headers: { Authorization: org.requester.client.token } }
    );

    assert.equal(response.status, 403);
  });
});
