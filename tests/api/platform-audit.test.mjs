// Fase 3B: audit lintas rumah sakit untuk akun vendor.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import {
  assignTicket,
  createPlatformUser,
  createTicket,
  postComment,
  seedOrg,
  uniqueLabel,
} from "../lib/fixtures.mjs";

let org;
let vendorLead;
let vendorSupport;
let ticket;

before(async () => {
  org = await seedOrg({ label: uniqueLabel("aud"), isolatedTenant: true });

  ticket = await createTicket(org.requester.client, {
    type: "incident",
    impact: "operational",
    title: "Tiket untuk audit lintas rumah sakit",
    description: "Tiket ini dipakai memverifikasi layar audit vendor.",
  });

  // Aktor rumah sakit: assignment oleh IT Lead.
  await assignTicket(org.lead.client, ticket.id, org.support.user.id);

  vendorLead = await createPlatformUser(org.admin, {
    role: "it_lead",
    label: "audlead",
  });
  vendorSupport = await createPlatformUser(org.admin, {
    role: "it_support",
    label: "audsup",
  });

  // Aktor vendor: komentar dari lead vendor.
  await postComment(
    vendorLead.client,
    ticket.id,
    "Komentar vendor untuk jejak audit.",
    "internal"
  );
}, { timeout: 120_000 });

function auditPath(params = {}) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }

  const text = query.toString();
  return `/api/itsm/platform/audit${text ? `?${text}` : ""}`;
}

describe("audit lintas rumah sakit", () => {
  it("vendor melihat jejak aksi pada satu rumah sakit", async () => {
    const data = await vendorLead.client.json(
      "GET",
      auditPath({ tenant: org.tenant.id })
    );

    assert.ok(data.totalItems >= 2, "assign dan komentar harus tercatat");
    assert.ok(data.items.every((item) => item.tenant === org.tenant.id));
    assert.ok(data.items.every((item) => item.actor_name !== "" || item.actor === ""));

    const comment = data.items.find((item) => item.action === "comment");
    assert.ok(comment, "aksi komentar vendor harus ada");
    assert.equal(comment.actor, vendorLead.user.id);
    assert.equal(comment.actor_scope, "platform");
    assert.equal(comment.actor_role, "it_lead");
    assert.equal(comment.ticket_no, ticket.ticket_no);
    assert.equal(comment.tenant_code, org.tenant.code);

    const assign = data.items.find((item) => item.action === "assign");
    assert.equal(assign.actor_scope, "tenant");
  });

  it("filter aksi dan cakupan aktor bekerja", async () => {
    const commentOnly = await vendorLead.client.json(
      "GET",
      auditPath({ tenant: org.tenant.id, action: "comment" })
    );

    assert.ok(commentOnly.totalItems >= 1);
    assert.ok(commentOnly.items.every((item) => item.action === "comment"));
    assert.ok(
      commentOnly.items.every((item) => item.actor_scope === "platform")
    );

    const tenantOnly = await vendorLead.client.json(
      "GET",
      auditPath({ tenant: org.tenant.id, scope: "tenant" })
    );

    assert.ok(tenantOnly.items.length >= 1);
    assert.ok(tenantOnly.items.every((item) => item.actor_scope === "tenant"));

    const superuserOnly = await vendorLead.client.json(
      "GET",
      auditPath({ tenant: org.tenant.id, scope: "superuser" })
    );

    assert.ok(superuserOnly.items.length >= 1);
    assert.ok(
      superuserOnly.items.every((item) => item.actor_scope === "superuser")
    );
  });

  it("pencarian nomor tiket menyaring jejak audit", async () => {
    const data = await vendorLead.client.json(
      "GET",
      auditPath({ tenant: org.tenant.id, q: ticket.ticket_no })
    );

    assert.ok(data.totalItems >= 2);
    assert.ok(data.items.every((item) => item.ticket === ticket.id));
  });

  it("nomor tiket yang tidak ada menghasilkan hasil kosong", async () => {
    const data = await vendorLead.client.json(
      "GET",
      auditPath({ tenant: org.tenant.id, q: "TIDAK-ADA-999" })
    );

    assert.equal(data.totalItems, 0);
    assert.deepEqual(data.items, []);
  });

  it("paginasi membatasi jumlah baris", async () => {
    const data = await vendorLead.client.json(
      "GET",
      auditPath({ tenant: org.tenant.id, perPage: 1 })
    );

    assert.equal(data.items.length, 1);
    assert.equal(data.perPage, 1);
    assert.ok(data.totalPages >= 2);
  });

  it("vendor support boleh membaca audit", async () => {
    const res = await vendorSupport.client.request(
      "GET",
      auditPath({ tenant: org.tenant.id })
    );

    assert.equal(res.status, 200);
  });

  it("filter tidak valid ditolak", async () => {
    const badAction = await vendorLead.client.request(
      "GET",
      auditPath({ action: "hapus-semua" })
    );
    assert.equal(badAction.status, 400);

    const badTenant = await vendorLead.client.request(
      "GET",
      auditPath({ tenant: "tidakada123" })
    );
    assert.equal(badTenant.status, 404);
  });

  it("pengguna rumah sakit tidak boleh membuka audit vendor", async () => {
    const res = await org.lead.client.request(
      "GET",
      auditPath({ tenant: org.tenant.id })
    );

    assert.equal(res.status, 403);
  });
});
