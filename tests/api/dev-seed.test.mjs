// Route development untuk seed manual: backdate record dan reset data demo.
// Route ini hanya untuk superuser dan dipakai `scripts/seed.mjs`.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import {
  createTicket,
  postComment,
  seedOrg,
  ticketRecord,
  uniqueLabel,
} from "../lib/fixtures.mjs";

let org;

before(async () => {
  org = await seedOrg({
    label: uniqueLabel("dev-seed"),
    isolatedTenant: true,
  });
});

describe("route seed development", () => {
  it("non-superuser ditolak", async () => {
    const response = await org.lead.client.request(
      "POST",
      "/api/itsm/dev/seed/age",
      { body: { items: [] } }
    );

    assert.equal(response.status, 403);
  });

  it("memundurkan created, komentar, audit, dan nomor tiket", async () => {
    const created = await createTicket(org.requester.client, {
      type: "incident",
      title: "Printer IGD tidak mencetak label",
      description: "Printer label pasien tidak mengeluarkan kertas sejak pagi.",
    });
    await postComment(
      org.requester.client,
      created.id,
      "Sudah dicoba nyalakan ulang, tetap tidak mencetak."
    );

    const target = "2026-08-01T02:00:00.000Z";
    const lastActivity = "2026-08-03T05:00:00.000Z";
    const result = await org.admin.json("POST", "/api/itsm/dev/seed/age", {
      body: {
        items: [
          {
            collection: "tickets",
            id: created.id,
            created: target,
            fields: {
              assigned_at: "2026-08-01T02:15:00.000Z",
              first_response_at: "2026-08-01T02:30:00.000Z",
              last_activity_at: lastActivity,
            },
            breaches: { resolution: true },
          },
        ],
      },
    });

    assert.equal(result.tickets, 1);
    assert.equal(result.comments, 1);

    const ticket = await ticketRecord(org.admin, created.id);
    assert.match(ticket.created, /^2026-08-01 02:00:00/);
    assert.match(ticket.ticket_no, /^INC-20260801-/);
    assert.ok(
      ticket.last_activity_at >= "2026-08-03 05:00:00",
      "aktivitas terakhir tidak boleh lebih awal dari rencana"
    );
    assert.ok(ticket.resolution_breach_at, "breach hasil simulasi harus terisi");
    assert.ok(Number(ticket.escalation_level) >= 1);

    const comments = await org.admin.list("ticket_comments", {
      filter: `ticket="${created.id}"`,
      sort: "created",
    });
    assert.equal(comments.items.length, 1);
    assert.ok(
      comments.items[0].created >= "2026-08-01 02:00:00",
      "waktu komentar ikut dimundurkan"
    );

    const audit = await org.admin.list("audit_logs", {
      filter: `ticket="${created.id}"`,
      sort: "created",
      perPage: 50,
    });
    assert.ok(audit.items.length >= 2);
    assert.match(audit.items[0].created, /^2026-08-01 02:00:00/);
    assert.ok(
      audit.items.every((row) => row.created >= "2026-08-01 02:00:00"),
      "seluruh audit tiket berada di rentang waktu yang dimundurkan"
    );
  });

  it("menolak collection yang tidak didukung", async () => {
    const response = await org.admin.request("POST", "/api/itsm/dev/seed/age", {
      body: { items: [{ collection: "users", id: "x", created: "2026-08-01" }] },
    });

    assert.equal(response.status, 400);
  });

  it("reset menghapus data transaksional tenant tanpa menghapus akun", async () => {
    const ticket = await createTicket(org.requester.client, {
      type: "incident",
      title: "Tiket untuk uji reset seed",
      description: "Tiket ini akan dihapus oleh route reset data demo.",
    });
    await postComment(
      org.requester.client,
      ticket.id,
      "Komentar yang ikut terhapus saat reset."
    );

    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    const form = new FormData();
    form.append("file", new Blob([png], { type: "image/png" }), "bukti.png");
    await org.requester.client.json(
      "POST",
      `/api/itsm/tickets/${ticket.id}/attachments`,
      { form }
    );

    const reset = await org.admin.json("POST", "/api/itsm/dev/seed/reset", {
      body: { tenant: org.tenant.id },
    });

    assert.ok(reset.removed.tickets >= 1);
    assert.ok(reset.removed.comments >= 1);
    assert.ok(reset.removed.attachments >= 1);

    const tickets = await org.admin.list("tickets", {
      filter: `tenant="${org.tenant.id}"`,
    });
    assert.equal(tickets.totalItems, 0);

    const users = await org.admin.list("users", {
      filter: `tenant="${org.tenant.id}"`,
    });
    assert.ok(users.totalItems >= 4, "akun demo tidak ikut dihapus");
  });
});
