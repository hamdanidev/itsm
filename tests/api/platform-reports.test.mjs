// Fase 3A: laporan SLA lintas rumah sakit untuk akun vendor.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import {
  createPlatformUser,
  createTicket,
  seedOrg,
  uniqueLabel,
} from "../lib/fixtures.mjs";

let orgA;
let orgB;
let vendorLead;
let vendorSupport;

before(async () => {
  orgA = await seedOrg({ label: uniqueLabel("repA"), isolatedTenant: true });
  orgB = await seedOrg({ label: uniqueLabel("repB"), isolatedTenant: true });

  await createTicket(orgA.requester.client, {
    type: "incident",
    impact: "clinical_workflow",
    title: "Tiket laporan RS A pertama",
    description: "Tiket untuk menguji laporan SLA lintas rumah sakit.",
  });
  await createTicket(orgA.requester.client, {
    type: "service_request",
    title: "Tiket laporan RS A kedua",
    description: "Tiket kedua untuk menguji hitungan per rumah sakit.",
  });
  await createTicket(orgB.requester.client, {
    type: "incident",
    impact: "operational",
    title: "Tiket laporan RS B",
    description: "Tiket milik rumah sakit kedua pada laporan vendor.",
  });

  vendorLead = await createPlatformUser(orgA.admin, {
    role: "it_lead",
    label: "replead",
  });
  vendorSupport = await createPlatformUser(orgA.admin, {
    role: "it_support",
    label: "repsup",
  });
}, { timeout: 120_000 });

describe("laporan gabungan vendor", () => {
  it("akun vendor mendapat laporan semua rumah sakit", async () => {
    const report = await vendorLead.client.json("GET", "/api/itsm/reports/sla");

    assert.equal(report.scope.mode, "all");
    assert.ok(report.summary.total >= 3);

    const codes = report.tenants.map((item) => item.code);
    assert.ok(codes.includes(orgA.tenant.code), "RS A harus ada di perbandingan");
    assert.ok(codes.includes(orgB.tenant.code), "RS B harus ada di perbandingan");

    for (const item of report.tenants) {
      assert.ok(item.summary, "setiap rumah sakit punya ringkasan sendiri");
      // Rumah sakit tanpa tiket pada rentang ini punya compliance null.
      assert.ok(
        item.summary.compliance === null ||
          typeof item.summary.compliance === "number"
      );
    }

    // Urut dari tiket terbanyak.
    const totals = report.tenants.map((item) => item.summary.total);
    assert.deepEqual(totals, totals.slice().sort((a, b) => b - a));
  });

  it("vendor bisa membatasi laporan ke satu rumah sakit", async () => {
    const report = await vendorLead.client.json(
      "GET",
      `/api/itsm/reports/sla?tenant=${orgA.tenant.id}`
    );

    assert.equal(report.scope.mode, "one");
    assert.equal(report.scope.tenant, orgA.tenant.id);
    assert.equal(report.summary.total, 2);
    assert.equal(report.tenants, undefined);
  });

  it("tenant yang tidak dikenal ditolak", async () => {
    const res = await vendorLead.client.request(
      "GET",
      "/api/itsm/reports/sla?tenant=tidakada123"
    );

    assert.equal(res.status, 404);
  });

  it("vendor support tidak boleh membuka laporan", async () => {
    const res = await vendorSupport.client.request("GET", "/api/itsm/reports/sla");
    assert.equal(res.status, 403);
  });
});

describe("batas laporan akun rumah sakit", () => {
  it("IT Lead rumah sakit hanya melihat tenant sendiri", async () => {
    const report = await orgA.lead.client.json("GET", "/api/itsm/reports/sla");

    assert.equal(report.scope.mode, "own");
    assert.equal(report.summary.total, 2);
    assert.equal(report.tenants, undefined);
  });

  it("parameter tenant tidak bisa dipakai memperluas cakupan", async () => {
    const report = await orgA.lead.client.json(
      "GET",
      `/api/itsm/reports/sla?tenant=${orgB.tenant.id}`
    );

    assert.equal(report.scope.mode, "own");
    assert.equal(report.summary.total, 2);
  });
});

describe("ekspor CSV", () => {
  it("gabungan semua rumah sakit memakai kolom tenant", async () => {
    const res = await vendorLead.client.request("GET", "/api/itsm/reports/sla.csv");
    assert.equal(res.status, 200);

    const text = String(res.data).replace(/^\uFEFF/, "");
    const lines = text.split("\r\n");

    assert.match(lines[0], /^tenant,ticket_no,type,priority,/);
    assert.ok(text.includes(orgA.tenant.name));
    assert.ok(text.includes(orgB.tenant.name));
  });

  it("ekspor satu rumah sakit tetap memakai header lama", async () => {
    const res = await vendorLead.client.request(
      "GET",
      `/api/itsm/reports/sla.csv?tenant=${orgA.tenant.id}`
    );
    assert.equal(res.status, 200);

    const text = String(res.data).replace(/^\uFEFF/, "");
    assert.match(text.split("\r\n")[0], /^ticket_no,type,priority,/);
    assert.ok(!text.includes(orgB.tenant.name));
  });
});
