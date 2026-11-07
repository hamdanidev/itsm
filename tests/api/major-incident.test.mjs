// Increment D: insiden mayor, tiket terdampak, broadcast, resolusi, dan PIR.
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

function code(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase().slice(-5)}`;
}

async function declare(client, body) {
  return client.json("POST", "/api/itsm/incidents", { body });
}

async function patchIncident(client, id, body) {
  return client.json("PATCH", `/api/itsm/incidents/${id}`, { body });
}

async function addUpdate(client, id, body) {
  return client.json("POST", `/api/itsm/incidents/${id}/updates`, { body });
}

async function linkTicket(client, id, ticketId, relation) {
  return client.json("POST", `/api/itsm/incidents/${id}/tickets`, {
    body: { ticket_id: ticketId, relation },
  });
}

async function incidentRow(admin, id) {
  return admin.json("GET", `/api/collections/major_incidents/records/${id}`);
}

before(async () => {
  org = await seedOrg({ label: uniqueLabel("incident") });
  otherOrg = await seedOrg({
    label: uniqueLabel("incident-other"),
    isolatedTenant: true,
  });

  service = await org.admin.create("services", {
    tenant: org.tenant.id,
    name: "SIMRS Rawat Inap",
    code: code("SIMRS"),
    is_active: true,
  });
});

describe("insiden mayor", () => {
  it("mendeklarasikan insiden, menautkan tiket sumber, dan broadcast", async () => {
    const ticket = await createTicket(org.requester.client, {
      title: "SIMRS rawat inap tidak bisa dibuka",
      description: "Seluruh unit rawat inap gagal membuka modul SIMRS.",
      service: service.id,
    });

    const incident = await declare(org.support.client, {
      title: "SIMRS rawat inap down total",
      description: "Modul rawat inap tidak dapat diakses sejak pukul 09.10.",
      severity: "sev1",
      impact_summary: "Pendaftaran dan input asuhan terganggu.",
      affected_services: [service.id, service.id],
      source_ticket: ticket.id,
      commander: org.support.user.id,
    });

    assert.match(incident.incident_no, /^INC-\d{8}-[A-Z0-9]{6}$/);
    assert.equal(incident.status, "declared");
    assert.equal(incident.severity, "sev1");
    assert.equal(incident.commander, org.support.user.id);
    assert.equal(incident.affected_services.length, 1);
    assert.ok(incident.started_at);

    const row = await ticketRecord(org.admin, ticket.id);
    assert.equal(row.major_incident, incident.id);

    const links = await org.admin.list("major_incident_tickets", {
      filter: `incident="${incident.id}"`,
    });
    assert.equal(links.items.length, 1);
    assert.equal(links.items[0].relation, "impacted");

    // Staf lain menerima broadcast, requester tidak membaca detail insiden.
    const leadNotifs = await org.lead.client.list("notifications", {
      filter: 'type="incident"',
    });
    assert.ok(leadNotifs.items.length >= 1);
    assert.ok(
      leadNotifs.items.some((item) =>
        String(item.title).includes("dideklarasikan")
      )
    );

    const requesterList = await org.requester.client.list("major_incidents");
    assert.equal(requesterList.items.length, 0);

    const forbidden = await org.requester.client.request(
      "POST",
      "/api/itsm/incidents",
      { body: { title: "Insiden ilegal oleh requester" } }
    );
    assert.equal(forbidden.status, 403);

    const audits = await org.lead.client.list("audit_logs", {
      filter: `action="incident_declare" && record_id="${incident.id}"`,
    });
    assert.equal(audits.items.length, 1);
    assert.equal(audits.items[0].collection_name, "major_incidents");
  });

  it("menautkan beberapa tiket tanpa duplikasi", async () => {
    const incident = await declare(org.support.client, {
      title: "Jaringan IGD terputus dari server SIMRS",
      severity: "sev2",
      affected_services: [service.id],
    });

    const first = await createTicket(org.requester.client, {
      title: "Komputer IGD tidak bisa akses SIMRS",
      service: service.id,
    });
    const second = await createTicket(org.requester.client, {
      title: "Printer triage IGD offline",
      service: service.id,
    });

    await linkTicket(org.support.client, incident.id, first.id, "impacted");
    await linkTicket(org.support.client, incident.id, second.id, "caused");
    await linkTicket(org.support.client, incident.id, second.id, "related");

    const links = await org.admin.list("major_incident_tickets", {
      filter: `incident="${incident.id}"`,
    });
    assert.equal(links.items.length, 2);

    const secondLink = links.items.find((item) => item.ticket === second.id);
    assert.equal(secondLink.relation, "related");

    const updated = await ticketRecord(org.admin, second.id);
    assert.equal(updated.major_incident, incident.id);

    const crossTenant = await otherOrg.support.client.request(
      "POST",
      `/api/itsm/incidents/${incident.id}/tickets`,
      { body: { ticket_id: first.id } }
    );
    assert.equal(crossTenant.status, 404);
  });

  it("update internal tidak dikirim, update publik sampai ke pemilik tiket", async () => {
    const ticket = await createTicket(org.requester.client, {
      title: "Akses SIMRS farmasi lambat",
      service: service.id,
    });

    const incident = await declare(org.support.client, {
      title: "Kinerja database SIMRS menurun",
      severity: "sev2",
      source_ticket: ticket.id,
    });

    const internal = await addUpdate(org.support.client, incident.id, {
      body: "Tim DBA sedang memeriksa lock table.",
      kind: "update",
      visibility: "internal",
    });
    assert.equal(internal.visibility, "internal");

    const requesterAfterInternal = await org.requester.client.list(
      "notifications",
      { filter: `type="incident" && ticket="${ticket.id}"` }
    );
    assert.equal(requesterAfterInternal.items.length, 0);

    const publicUpdate = await addUpdate(org.support.client, incident.id, {
      body: "Akses farmasi sudah normal kembali, silakan mencoba.",
      kind: "communication",
      visibility: "public",
    });
    assert.equal(publicUpdate.visibility, "public");

    const requesterAfterPublic = await org.requester.client.list(
      "notifications",
      { filter: `type="incident" && ticket="${ticket.id}"` }
    );
    assert.equal(requesterAfterPublic.items.length, 1);
    assert.ok(
      requesterAfterPublic.items[0].body.includes(incident.incident_no)
    );

    const updates = await org.support.client.list("incident_updates", {
      filter: `incident="${incident.id}"`,
    });
    assert.equal(updates.items.length, 2);
  });

  it("resolusi wajib ringkasan, penutupan wajib PIR lengkap", async () => {
    const incident = await declare(org.support.client, {
      title: "VPN kantor pusat tidak stabil",
      severity: "sev3",
    });

    const missingSummary = await org.support.client.request(
      "PATCH",
      `/api/itsm/incidents/${incident.id}`,
      { body: { status: "resolved" } }
    );
    assert.equal(missingSummary.status, 400);

    const resolved = await patchIncident(org.support.client, incident.id, {
      status: "resolved",
      resolution_summary: "Failover ke jalur cadangan dan restart tunnel VPN.",
    });
    assert.equal(resolved.status, "resolved");
    assert.ok(resolved.resolved_at);

    const closeWithoutPir = await org.support.client.request(
      "PATCH",
      `/api/itsm/incidents/${incident.id}`,
      { body: { status: "closed" } }
    );
    assert.equal(closeWithoutPir.status, 400);

    const partialPir = await org.support.client.request(
      "PATCH",
      `/api/itsm/incidents/${incident.id}`,
      { body: { pir_completed: true, root_cause: "Tunnel VPN kedaluwarsa" } }
    );
    assert.equal(partialPir.status, 400);

    const pir = await patchIncident(org.support.client, incident.id, {
      root_cause: "Sertifikat tunnel VPN kedaluwarsa tanpa monitoring.",
      pir_actions:
        "Perpanjangan otomatis sertifikat dan alert 30 hari sebelum kedaluwarsa.",
      pir_completed: true,
    });
    assert.ok(pir.pir_completed_at);
    assert.equal(pir.pir_by, org.support.user.id);

    const closed = await patchIncident(org.support.client, incident.id, {
      status: "closed",
    });
    assert.equal(closed.status, "closed");
    assert.ok(closed.closed_at);

    const finalPatch = await org.support.client.request(
      "PATCH",
      `/api/itsm/incidents/${incident.id}`,
      { body: { status: "investigating" } }
    );
    assert.equal(finalPatch.status, 400);

    const audits = await org.lead.client.list("audit_logs", {
      filter: `record_id="${incident.id}"`,
    });
    const actions = audits.items.map((item) => item.action);
    assert.ok(actions.includes("incident_resolve"));
    assert.ok(actions.includes("incident_pir"));
    assert.ok(actions.includes("incident_close"));
  });

  it("tenant lain tidak dapat mengubah insiden", async () => {
    const incident = await declare(org.support.client, {
      title: "Insiden untuk uji isolasi tenant",
      severity: "sev3",
    });

    const crossPatch = await otherOrg.lead.client.request(
      "PATCH",
      `/api/itsm/incidents/${incident.id}`,
      { body: { status: "investigating" } }
    );
    assert.equal(crossPatch.status, 404);

    const crossRead = await otherOrg.lead.client.list("major_incidents", {
      filter: `id="${incident.id}"`,
    });
    assert.equal(crossRead.items.length, 0);

    const row = await incidentRow(org.admin, incident.id);
    assert.equal(row.status, "declared");
  });

  it("statistik laporan menghitung MTTR dan PIR", async () => {
    const stats = await org.lead.client.json(
      "GET",
      "/api/itsm/incidents/stats"
    );

    assert.ok(stats.totals.total >= 1);
    assert.ok(stats.totals.pir_completed >= 1);
    assert.equal(typeof stats.mttr_minutes, "number");
    assert.ok(Array.isArray(stats.trend));
    assert.ok(stats.trend.length >= 1);
    assert.equal(typeof stats.by_severity.sev1, "number");

    const forbidden = await org.support.client.request(
      "GET",
      "/api/itsm/incidents/stats"
    );
    assert.equal(forbidden.status, 403);
  });
});
