// Email transaksional: undangan akun, reset password, notifikasi tiket,
// preferensi penerima, dan kontrol akses.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import {
  assignTicket,
  createTicket,
  readEnv,
  seedOrg,
  uniqueLabel,
} from "../lib/fixtures.mjs";
import { ApiClient } from "../lib/api-client.mjs";

let org;
let invitee;
let inviteEmail;

function outbox(admin, filter) {
  return admin.list("email_outbox", { filter, sort: "-created", perPage: 50 });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

before(async () => {
  org = await seedOrg({ label: uniqueLabel("email"), isolatedTenant: true });
});

describe("status email", () => {
  it("IT Lead melihat status transport dan antrean tenant-nya", async () => {
    const status = await org.lead.client.json("GET", "/api/itsm/mail/status");

    assert.equal(status.transport, "capture");
    assert.equal(status.configured, false);
    assert.equal(status.can_send, true);
    assert.ok(Number.isInteger(status.queued));
    assert.ok(Number.isInteger(status.failed));
    assert.equal(typeof status.app_url, "string");
  });

  it("support, requester, dan koleksi mentah tidak boleh membaca email", async () => {
    const support = await org.support.client.request(
      "GET",
      "/api/itsm/mail/status"
    );
    assert.equal(support.status, 403);

    const requester = await org.requester.client.request(
      "GET",
      "/api/itsm/mail/status"
    );
    assert.equal(requester.status, 403);

    const raw = await org.lead.client.request(
      "GET",
      "/api/collections/email_outbox/records"
    );
    assert.equal(raw.status, 403);
  });
});

describe("undangan akun", () => {
  it("membuat akun mengirim email berisi password awal", async () => {
    inviteEmail = `undangan.${Date.now().toString(36)}@uji.local`;

    const created = await org.lead.client.json("POST", "/api/itsm/team", {
      body: {
        name: "Anggota Undangan",
        email: inviteEmail,
        role: "it_support",
      },
    });

    invitee = created.user;
    assert.equal(created.email.sent, true);
    assert.equal(created.email.transport, "capture");

    const rows = await outbox(
      org.admin,
      `template = "invitation" && to = "${inviteEmail}"`
    );

    assert.equal(rows.totalItems, 1);
    const email = rows.items[0];

    assert.equal(email.status, "sent");
    assert.equal(email.tenant, org.tenant.id);
    assert.equal(email.user, invitee.id);
    assert.match(email.subject, /Undangan akses/i);
    assert.ok(email.html.includes(created.password), "password awal ada di email");
    assert.match(email.html, /\/login/);
    assert.match(email.html, /IT Support/);
    assert.ok(email.text.includes(created.password));
  });

  it("reset password mengirim password baru, bukan password lama", async () => {
    const reset = await org.lead.client.json(
      "POST",
      `/api/itsm/team/${invitee.id}/password`
    );

    assert.equal(reset.email.sent, true);

    const rows = await outbox(
      org.admin,
      `template = "password_reset" && to = "${inviteEmail}"`
    );

    assert.equal(rows.totalItems, 1);
    const email = rows.items[0];

    assert.equal(email.status, "sent");
    assert.ok(email.html.includes(reset.password));
    assert.match(email.subject, /Password baru/i);
  });
});

describe("notifikasi tiket", () => {
  it("penugasan mengantrekan email dan dispatch menandainya terkirim", async () => {
    const ticket = await createTicket(org.requester.client, {
      priority: "high",
      title: "Email penugasan tiket",
    });

    await assignTicket(org.lead.client, ticket.id, org.support.user.id);
    await sleep(150);

    const queued = await outbox(
      org.admin,
      `template = "notification" && user = "${org.support.user.id}" && event = "assigned"`
    );

    assert.ok(queued.totalItems >= 1, "email penugasan harus masuk antrean");

    const email = queued.items[0];
    assert.equal(email.status, "queued");
    assert.ok(email.html.includes("Email penugasan tiket"));
    assert.ok(email.html.includes(`/tickets/${ticket.id}`));

    const dispatched = await org.admin.json(
      "POST",
      "/api/itsm/mail/dispatch"
    );
    assert.ok(dispatched.sent >= 1);

    const sent = await outbox(
      org.admin,
      `template = "notification" && user = "${org.support.user.id}" && event = "assigned"`
    );

    assert.equal(sent.items[0].status, "sent");
    assert.ok(sent.items[0].sent_at);
  });

  it("preferensi email dimatikan menghentikan antrean notifikasi", async () => {
    const beforeCount = await outbox(
      org.admin,
      `template = "notification" && user = "${org.support.user.id}"`
    );

    const profile = await org.support.client.json("PATCH", "/api/itsm/profile", {
      body: {
        name: "Support Email Uji",
        phone: "",
        employee_no: "",
        email_notifications: false,
      },
    });

    assert.equal(profile.email_notifications, false);

    const ticket = await createTicket(org.requester.client, {
      title: "Tidak boleh masuk email",
    });

    await assignTicket(org.lead.client, ticket.id, org.support.user.id);
    await sleep(150);

    const afterCount = await outbox(
      org.admin,
      `template = "notification" && user = "${org.support.user.id}"`
    );

    assert.equal(afterCount.totalItems, beforeCount.totalItems);

    // Aktifkan lagi supaya perilaku default tetap teruji di test lain.
    const restored = await org.support.client.json("PATCH", "/api/itsm/profile", {
      body: {
        name: "Support Email Uji",
        phone: "",
        employee_no: "",
        email_notifications: true,
      },
    });

    assert.equal(restored.email_notifications, true);
  });
});

describe("kontrol dispatch", () => {
  it("hanya superuser yang boleh memicu pengiriman", async () => {
    const url = readEnv().url;
    const client = new ApiClient(url);

    await client.login(org.lead.email, "RahasiaUji123!");

    const res = await client.request("POST", "/api/itsm/mail/dispatch");
    assert.equal(res.status, 403);
  });
});
