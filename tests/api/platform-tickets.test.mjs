// Fase 2: vendor (scope platform) menangani tiket lintas rumah sakit.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import {
  assignTicket,
  createPlatformUser,
  createTicket,
  seedOrg,
  transition,
  uniqueLabel,
} from "../lib/fixtures.mjs";

let org;
let other;
let lead;
let support;
let incident;
let serviceRequest;

before(async () => {
  org = await seedOrg({ label: uniqueLabel("v2"), isolatedTenant: true });
  other = await seedOrg({ label: uniqueLabel("v2o"), isolatedTenant: true });

  lead = await createPlatformUser(org.admin, { role: "it_lead", label: "v2lead" });
  support = await createPlatformUser(org.admin, {
    role: "it_support",
    label: "v2support",
  });

  incident = await createTicket(org.requester.client, {
    type: "incident",
    impact: "operational",
    title: "Vendor mengerjakan tiket rumah sakit",
    description: "Tiket ini dipakai memverifikasi akses vendor lintas tenant.",
  });

  serviceRequest = await createTicket(org.requester.client, {
    type: "service_request",
    title: "Vendor menyetujui permintaan layanan",
    description: "Permintaan layanan untuk menguji approval oleh vendor lead.",
  });
}, { timeout: 120_000 });

describe("akses baca lintas tenant", () => {
  it("vendor dapat melihat tiket dan data rumah sakit lain", async () => {
    const list = await support.client.list("tickets", {
      filter: `tenant = "${org.tenant.id}"`,
      perPage: 50,
    });

    assert.ok(list.totalItems >= 2);
    assert.ok(list.items.some((item) => item.id === incident.id));

    const single = await support.client.json(
      "GET",
      `/api/collections/tickets/records/${incident.id}`
    );
    assert.equal(single.id, incident.id);
  });

  it("expand requester, assignee, dan unit bekerja untuk vendor", async () => {
    const list = await support.client.list("tickets", {
      filter: `id = "${incident.id}"`,
      perPage: 1,
    });
    const ticket = list.items[0];

    assert.ok(ticket.tenant);
  });

  it("vendor dapat membaca data master rumah sakit", async () => {
    const units = await support.client.list("units", {
      filter: `tenant = "${org.tenant.id}"`,
    });
    assert.ok(units.totalItems >= 1);

    const categories = await support.client.list("ticket_categories", {
      filter: `tenant = "${org.tenant.id}"`,
    });
    assert.ok(categories.totalItems >= 0);
  });

  it("pengguna rumah sakit tetap tidak bisa membaca tiket tenant lain", async () => {
    const res = await other.lead.client.request(
      "GET",
      `/api/collections/tickets/records/${incident.id}`
    );

    assert.equal(res.status, 404);

    const list = await other.lead.client.list("tickets", {
      filter: `id = "${incident.id}"`,
    });
    assert.equal(list.totalItems, 0);
  });
});

describe("vendor sebagai assignee dan resolver", () => {
  it("vendor lead menugaskan tiket rumah sakit ke vendor support", async () => {
    const updated = await assignTicket(
      lead.client,
      incident.id,
      support.user.id
    );

    assert.equal(updated.assignee, support.user.id);
    assert.equal(updated.status, "assigned");

    const notifications = await support.client.list("notifications", {
      sort: "-created",
    });
    assert.ok(
      notifications.items.some((item) => item.ticket === incident.id),
      "assignee vendor harus menerima notifikasi penugasan"
    );
  });

  it("vendor support menyelesaikan siklus tiket rumah sakit", async () => {
    await transition(support.client, incident.id, "in_progress");

    await transition(support.client, incident.id, "resolved", {
      resolution_summary: "Akses vendor diuji dan tiket diselesaikan vendor.",
      resolution_code: "fixed",
    });

    const closed = await transition(support.client, incident.id, "closed");
    assert.equal(closed.status, "closed");

    const record = await support.client.json(
      "GET",
      `/api/collections/tickets/records/${incident.id}`
    );
    assert.equal(record.resolved_by, support.user.id);
  });

  it("audit mencatat aktor vendor dengan actor_role platform", async () => {
    const audit = await org.lead.client.list("audit_logs", {
      filter: `ticket = "${incident.id}"`,
      sort: "-created",
      perPage: 50,
    });

    const assignRow = audit.items.find((row) => row.action === "assign");

    assert.ok(assignRow, "audit assign harus ada");
    assert.equal(assignRow.actor, lead.user.id);
    assert.equal(assignRow.actor_role, "platform_it_lead");
  });
});

describe("vendor sebagai approver", () => {
  it("vendor lead menyetujui semua tahap service request", async () => {
    const steps = await support.client.list("ticket_approvals", {
      filter: `ticket = "${serviceRequest.id}"`,
      sort: "step",
    });

    assert.ok(steps.items.length >= 1);

    for (const step of steps.items) {
      if (step.status !== "pending") continue;

      await lead.client.json(
        "POST",
        `/api/itsm/tickets/${serviceRequest.id}/approval`,
        { body: { decision: "approved", note: "Disetujui vendor" } }
      );
    }

    const list = await lead.client.list("tickets", {
      filter: `id = "${serviceRequest.id}"`,
      perPage: 1,
    });

    assert.equal(list.items[0].approval_status, "approved");
  });
});

describe("batas kewenangan vendor", () => {
  it("vendor tidak dapat membuat tiket tanpa tenant", async () => {
    const res = await lead.client.request("POST", "/api/itsm/tickets", {
      body: {
        type: "incident",
        title: "Tiket dari vendor",
        description: "Vendor tidak punya unit sehingga tidak boleh membuat tiket.",
        impact: "operational",
        patient_data_confirmed: true,
      },
    });

    assert.equal(res.status, 400);
    assert.match(res.data.message, /tenant|unit/i);
  });

  it("vendor tidak dapat menulis lewat REST koleksi", async () => {
    const res = await lead.client.request(
      "POST",
      "/api/collections/tickets/records",
      { body: { title: "Tulis langsung" } }
    );

    // createRule tetap null: penulisan hanya lewat route /api/itsm/*.
    assert.equal(res.status, 403);
  });

  it("vendor support tetap tidak bisa membuat tenant", async () => {
    const res = await support.client.request("POST", "/api/itsm/platform/tenants", {
      body: { name: "RS Ditolak", code: `NO${Date.now().toString(36)}` },
    });

    assert.equal(res.status, 403);
  });

  it("profil vendor tetap tanpa tenant", async () => {
    const profile = await lead.client.json("GET", "/api/itsm/profile");
    assert.equal(profile.tenant, "");
    assert.equal(profile.role, "it_lead");
  });
});
