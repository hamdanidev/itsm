// Increment C: asset/CI, tautan tiket, CSAT, dan laporan operasional.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import {
  createTicket,
  seedOrg,
  ticketRecord,
  uniqueLabel,
} from "../lib/fixtures.mjs";

let org;
let otherOrg;
let service;

async function createAsset(client, overrides = {}) {
  return client.json("POST", "/api/itsm/assets", {
    body: {
      name: `Printer farmasi ${Date.now().toString(36)}`,
      type: "printer",
      status: "active",
      criticality: "high",
      location: "Farmasi lantai 1",
      service: service.id,
      unit: org.unit.id,
      ...overrides,
    },
  });
}

async function resolveTicket(ticketId) {
  await org.lead.client.json("POST", `/api/itsm/tickets/${ticketId}/assign`, {
    body: { assignee: org.support.user.id },
  });
  await org.support.client.json(
    "POST",
    `/api/itsm/tickets/${ticketId}/transition`,
    { body: { status: "in_progress" } }
  );
  await org.support.client.json(
    "POST",
    `/api/itsm/tickets/${ticketId}/transition`,
    {
      body: {
        status: "resolved",
        resolution_summary: "Printer sudah diuji dan kembali mencetak.",
        resolution_code: "fixed",
      },
    }
  );
}

before(async () => {
  org = await seedOrg({ label: uniqueLabel("asset") });
  otherOrg = await seedOrg({
    label: uniqueLabel("asset-other"),
    isolatedTenant: true,
  });

  service = await org.admin.create("services", {
    tenant: org.tenant.id,
    name: "Layanan Aset Uji",
    code: `AST-${Date.now().toString(36).toUpperCase().slice(-5)}`,
    is_active: true,
  });
});

describe("asset / CI", () => {
  it("membuat aset, service CI, dan detail riwayat", async () => {
    const asset = await createAsset(org.lead.client, {
      name: "Printer label farmasi",
    });

    assert.match(asset.asset_no, /^AST-\d{8}-[A-Z0-9]{6}$/);
    assert.equal(asset.name, "Printer label farmasi");

    const cis = await org.admin.list("service_cis", {
      filter: `asset="${asset.id}"`,
    });
    assert.equal(cis.items.length, 1);
    assert.equal(cis.items[0].service, service.id);
    assert.equal(cis.items[0].criticality, "high");

    const incident = await createTicket(org.requester.client, {
      type: "incident",
      service: service.id,
      asset_id: asset.id,
      title: "Printer label farmasi macet",
      description: "Printer label di farmasi tidak mengeluarkan label.",
    });

    const linked = await org.support.client.json(
      "GET",
      `/api/itsm/tickets/${incident.id}/assets`
    );
    assert.equal(linked.assets.length, 1);
    assert.equal(linked.assets[0].id, asset.id);
    assert.equal(linked.assets[0].relation, "affected");

    const detail = await org.lead.client.json(
      "GET",
      `/api/itsm/assets/${asset.id}`
    );
    assert.equal(detail.asset.service_name, "Layanan Aset Uji");
    assert.equal(detail.asset.unit_name, org.unit.name);
    assert.equal(detail.tickets.length, 1);
    assert.equal(detail.tickets[0].id, incident.id);
    assert.equal(detail.counts.open_tickets, 1);

    const ticket = await ticketRecord(org.admin, incident.id);
    assert.equal(ticket.id, incident.id);

    const options = await org.requester.client.json(
      "GET",
      "/api/itsm/assets/options"
    );
    assert.equal(options.assets.length, 1);
    assert.equal(options.assets[0].notes, undefined);
    assert.equal(options.assets[0].service, service.id);

    const rawList = await org.requester.client.request(
      "GET",
      "/api/collections/assets/records"
    );
    assert.ok(
      rawList.status === 403 || (rawList.data?.items || []).length === 0
    );
  });

  it("requester tidak boleh menulis aset dan aset lintas tenant ditolak", async () => {
    const forbidden = await org.requester.client.request(
      "POST",
      "/api/itsm/assets",
      { body: { name: "Aset ilegal" } }
    );
    assert.equal(forbidden.status, 403);

    const asset = await createAsset(org.lead.client);
    const foreign = await otherOrg.lead.client.request(
      "PATCH",
      `/api/itsm/assets/${asset.id}`,
      { body: { name: "Diubah tenant lain" } }
    );
    assert.equal(foreign.status, 404);
  });

  it("menautkan dan melepas aset dari tiket dengan audit", async () => {
    const asset = await createAsset(org.lead.client);
    const incident = await createTicket(org.requester.client, {
      type: "incident",
      service: service.id,
      title: "Tiket tanpa aset awal",
      description: "Tiket ini akan ditautkan ke aset lewat detail.",
    });

    await org.support.client.json(
      "POST",
      `/api/itsm/tickets/${incident.id}/assets`,
      { body: { asset_id: asset.id, relation: "caused" } }
    );

    const afterLink = await org.support.client.json(
      "GET",
      `/api/itsm/tickets/${incident.id}/assets`
    );
    assert.equal(afterLink.assets[0].relation, "caused");

    await org.support.client.json(
      "DELETE",
      `/api/itsm/tickets/${incident.id}/assets/${asset.id}`
    );

    const afterUnlink = await org.support.client.json(
      "GET",
      `/api/itsm/tickets/${incident.id}/assets`
    );
    assert.equal(afterUnlink.assets.length, 0);

    const audit = await org.admin.list("audit_logs", {
      filter: `ticket="${incident.id}" && action="asset_link"`,
    });
    assert.equal(audit.items.length, 1);
  });
});

describe("CSAT", () => {
  it("hanya pemohon, setelah resolved, dan satu respons per tiket", async () => {
    const incident = await createTicket(org.requester.client, {
      type: "incident",
      service: service.id,
      title: "Tiket untuk penilaian CSAT",
      description: "Tiket ini akan diselesaikan lalu dinilai pemohon.",
    });

    const early = await org.requester.client.request(
      "POST",
      `/api/itsm/tickets/${incident.id}/csat`,
      { body: { score: 5 } }
    );
    assert.equal(early.status, 400);

    await resolveTicket(incident.id);

    const before = await org.requester.client.json(
      "GET",
      `/api/itsm/tickets/${incident.id}/csat`
    );
    assert.equal(before.csat, null);

    const created = await org.requester.client.json(
      "POST",
      `/api/itsm/tickets/${incident.id}/csat`,
      { body: { score: 4, comment: "Respons cepat, komunikasi jelas." } }
    );
    assert.equal(created.score, 4);
    assert.equal(created.comment, "Respons cepat, komunikasi jelas.");

    const duplicate = await org.requester.client.request(
      "POST",
      `/api/itsm/tickets/${incident.id}/csat`,
      { body: { score: 5 } }
    );
    assert.equal(duplicate.status, 400);

    const staffAttempt = await org.support.client.request(
      "POST",
      `/api/itsm/tickets/${incident.id}/csat`,
      { body: { score: 5 } }
    );
    assert.equal(staffAttempt.status, 403);

    const read = await org.support.client.json(
      "GET",
      `/api/itsm/tickets/${incident.id}/csat`
    );
    assert.equal(read.csat.score, 4);
  });
});

describe("laporan operasional", () => {
  it("menggabungkan insiden, CSAT, KB, problem, dan SLA", async () => {
    const wibNow = Date.now() + 7 * 60 * 60 * 1000;
    const to = new Date(wibNow).toISOString().slice(0, 10);
    const from = new Date(wibNow - 30 * 86400000).toISOString().slice(0, 10);
    const query = `?from=${from}&to=${to}`;

    const report = await org.lead.client.json(
      "GET",
      `/api/itsm/reports/operations${query}`
    );

    assert.ok(report.incidents.total >= 1);
    assert.ok(report.csat.count >= 1);
    assert.equal(typeof report.csat.average, "number");
    assert.ok(report.sla.total >= 1);
    assert.ok(Array.isArray(report.incidents.by_service));
    assert.ok(Array.isArray(report.csat.by_service));
    assert.ok(Array.isArray(report.top_problems));

    const csv = await org.lead.client.request(
      "GET",
      `/api/itsm/reports/operations.csv${query}`
    );
    assert.equal(csv.status, 200);
    assert.match(String(csv.data), /csat/);
    assert.match(String(csv.data), /insiden_per_layanan/);
  });

  it("support tidak boleh membuka laporan operasional", async () => {
    const response = await org.support.client.request(
      "GET",
      "/api/itsm/reports/operations"
    );
    assert.equal(response.status, 403);
  });
});
