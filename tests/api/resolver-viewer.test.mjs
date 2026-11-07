// Role akses baru: Teknisi (resolver) dan Pengamat (viewer).
//
// Resolver hanya mengerjakan tiket yang di-assign kepadanya; Pengamat hanya
// membaca laporan dan tidak boleh menyentuh tiket.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import { expectStatus } from "../lib/api-client.mjs";
import {
  addMember,
  assignTicket,
  createTicket,
  postComment,
  seedOrg,
  transition,
  uniqueLabel,
} from "../lib/fixtures.mjs";

let org;
let resolver;
let viewer;
let ticket;
let otherTicket;
let appResolver;
let netResolver;
let teamTicket;

before(async () => {
  org = await seedOrg({ label: uniqueLabel("role") });

  resolver = await addMember(org.admin, {
    tenantId: org.tenant.id,
    unitId: org.itUnit.id,
    role: "resolver",
    label: "teknisi",
    name: "Teknisi Uji",
  });

  viewer = await addMember(org.admin, {
    tenantId: org.tenant.id,
    unitId: org.itUnit.id,
    role: "viewer",
    label: "pengamat",
    name: "Pengamat Uji",
  });

  ticket = await createTicket(org.requester.client, {
    title: "Insiden untuk teknisi",
    description: "Tiket ini akan ditugaskan ke teknisi untuk diuji alurnya.",
  });

  otherTicket = await createTicket(org.requester.client, {
    title: "Insiden milik staf lain",
    description: "Tiket ini tidak boleh dikerjakan oleh teknisi lain.",
  });

  // Hanya Kepala IT yang boleh menugaskan ke staf lain.
  await assignTicket(org.lead.client, ticket.id, resolver.user.id);
  await assignTicket(org.support.client, otherTicket.id, org.support.user.id);

  appResolver = await addMember(org.admin, {
    tenantId: org.tenant.id,
    unitId: org.itUnit.id,
    role: "resolver",
    team: "application",
    label: "teknisi-aplikasi",
    name: "Teknisi Aplikasi",
  });

  netResolver = await addMember(org.admin, {
    tenantId: org.tenant.id,
    unitId: org.itUnit.id,
    role: "resolver",
    team: "network",
    label: "teknisi-jaringan",
    name: "Teknisi Jaringan",
  });

  const service = await org.admin.create("services", {
    tenant: org.tenant.id,
    name: "SIMRS Uji",
    code: `SIM${Date.now().toString(36).slice(-6).toUpperCase()}`,
    team: "application",
    is_active: true,
  });

  teamTicket = await createTicket(org.requester.client, {
    title: "Insiden antrean tim aplikasi",
    description: "Tiket ini masuk antrean tim aplikasi lewat layanan SIMRS.",
    service: service.id,
  });

  await postComment(
    org.support.client,
    teamTicket.id,
    "Catatan internal tim aplikasi",
    "internal"
  );
}, { timeout: 120_000 });

describe("resolver (Teknisi)", () => {
  it("hanya melihat tiket yang ditugaskan kepadanya", async () => {
    const list = await resolver.client.list("tickets", { perPage: 100 });
    const ids = list.items.map((item) => item.id);

    assert.ok(ids.includes(ticket.id), "tiket assigned harus terlihat");
    assert.ok(!ids.includes(otherTicket.id), "tiket staf lain tidak boleh terlihat");
  });

  it("bisa menulis dan membaca komentar internal pada tiketnya", async () => {
    await postComment(
      resolver.client,
      ticket.id,
      "Catatan internal dari teknisi",
      "internal"
    );

    const comments = await resolver.client.list("ticket_comments", {
      filter: `ticket="${ticket.id}"`,
      perPage: 100,
    });

    assert.ok(
      comments.items.some(
        (item) =>
          item.visibility === "internal" &&
          item.body.includes("Catatan internal dari teknisi")
      ),
      "komentar internal harus terlihat oleh teknisi pemilik tiket"
    );
  });

  it("tidak bisa triage, assign orang lain, atau membuat problem", async () => {
    await expectStatus(
      resolver.client.request("POST", `/api/itsm/tickets/${ticket.id}/triage`, {
        body: { priority: "high", reason: "Coba triage oleh teknisi" },
      }),
      403,
      "triage oleh teknisi"
    );

    await expectStatus(
      resolver.client.request("POST", `/api/itsm/tickets/${ticket.id}/assign`, {
        body: { assignee: org.support.user.id },
      }),
      403,
      "assign orang lain oleh teknisi"
    );

    await expectStatus(
      resolver.client.request("POST", "/api/itsm/problems", {
        body: { title: "Problem dari teknisi" },
      }),
      403,
      "problem oleh teknisi"
    );
  });

  it("bisa mulai dan menyelesaikan tiket assigned", async () => {
    const started = await transition(resolver.client, ticket.id, "in_progress");
    assert.equal(started.status, "in_progress");

    const resolved = await transition(resolver.client, ticket.id, "resolved", {
      resolution_summary: "Aplikasi di-restart dan akses kasir pulih kembali.",
      resolution_code: "fixed",
    });

    assert.equal(resolved.status, "resolved");
    assert.ok(resolved.resolved_at);
  });

  it("tetap tidak boleh menutup tiket", async () => {
    await expectStatus(
      resolver.client.request("POST", `/api/itsm/tickets/${ticket.id}/transition`, {
        body: { status: "closed" },
      }),
      403,
      "close oleh teknisi"
    );
  });

  it("tidak bisa mengerjakan tiket staf lain", async () => {
    await expectStatus(
      resolver.client.request(
        "POST",
        `/api/itsm/tickets/${otherTicket.id}/transition`,
        { body: { status: "in_progress" } }
      ),
      404,
      "transisi tiket staf lain"
    );
  });
});

describe("antrean tim (Teknisi)", () => {
  it("tiket mewarisi tim dari layanan", async () => {
    const record = await org.admin.json(
      "GET",
      `/api/collections/tickets/records/${teamTicket.id}`
    );

    assert.equal(record.team, "application");
  });

  it("teknisi melihat antrean timnya, teknisi tim lain tidak", async () => {
    const appList = await appResolver.client.list("tickets", { perPage: 100 });
    const netList = await netResolver.client.list("tickets", { perPage: 100 });

    assert.ok(
      appList.items.some((item) => item.id === teamTicket.id),
      "teknisi aplikasi harus melihat antrean tim aplikasi"
    );
    assert.ok(
      !netList.items.some((item) => item.id === teamTicket.id),
      "teknisi jaringan tidak boleh melihat tiket tim aplikasi"
    );
  });

  it("komentar internal tim baru terlihat setelah tiket diambil", async () => {
    const before = await appResolver.client.list("ticket_comments", {
      filter: `ticket="${teamTicket.id}"`,
      perPage: 100,
    });

    assert.ok(
      before.items.every((item) => item.visibility !== "internal"),
      "komentar internal belum terlihat sebelum tiket diambil"
    );

    await assignTicket(appResolver.client, teamTicket.id, appResolver.user.id);

    const after = await appResolver.client.list("ticket_comments", {
      filter: `ticket="${teamTicket.id}"`,
      perPage: 100,
    });

    assert.ok(
      after.items.some((item) => item.body.includes("Catatan internal tim aplikasi")),
      "komentar internal terlihat setelah tiket diambil"
    );
  });

  it("teknisi bisa mengambil dan menyelesaikan tiket timnya", async () => {
    const started = await transition(appResolver.client, teamTicket.id, "in_progress");
    assert.equal(started.status, "in_progress");

    const resolved = await transition(appResolver.client, teamTicket.id, "resolved", {
      resolution_summary: "Konfigurasi layanan SIMRS diperbaiki dan diuji.",
      resolution_code: "fixed",
    });
    assert.equal(resolved.status, "resolved");
  });

  it("teknisi tim lain tidak bisa mengambil tiket tim ini", async () => {
    await expectStatus(
      netResolver.client.request("POST", `/api/itsm/tickets/${teamTicket.id}/assign`, {
        body: { assignee: netResolver.user.id },
      }),
      404,
      "ambil tiket tim lain"
    );
  });
});

describe("viewer (Pengamat)", () => {
  it("bisa membaca laporan tenant-nya", async () => {
    const report = await viewer.client.json("GET", "/api/itsm/reports/sla");

    assert.ok(report.summary, "ringkasan laporan harus tersedia");
    assert.equal(report.scope.mode, "own");
  });

  it("tidak bisa membaca tiket atau mengelola tim", async () => {
    const tickets = await viewer.client.list("tickets", { perPage: 10 });
    assert.equal(tickets.totalItems, 0);

    await expectStatus(
      viewer.client.request("GET", "/api/itsm/team"),
      403,
      "tim oleh pengamat"
    );
  });

  it("tidak bisa menulis komentar", async () => {
    await expectStatus(
      viewer.client.request("POST", `/api/itsm/tickets/${ticket.id}/comments`, {
        body: { body: "Coba komentar", visibility: "public" },
      }),
      404,
      "komentar oleh pengamat"
    );
  });

  it("bisa membaca audit tenant-nya", async () => {
    const audit = await viewer.client.json("GET", "/api/itsm/audit?perPage=10");

    assert.ok(Array.isArray(audit.items));
    assert.ok(audit.items.length > 0, "harus ada audit tenant");
    assert.ok(
      audit.items.every((item) => item.tenant === org.tenant.id),
      "audit pengamat harus dibatasi ke tenant sendiri"
    );
  });

  it("requester dan Staff IT tidak boleh membuka audit", async () => {
    await expectStatus(
      org.requester.client.request("GET", "/api/itsm/audit"),
      403,
      "audit oleh pemohon"
    );
    await expectStatus(
      org.support.client.request("GET", "/api/itsm/audit"),
      403,
      "audit oleh Staff IT"
    );
  });
});
