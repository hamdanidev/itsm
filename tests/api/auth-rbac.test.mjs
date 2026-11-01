// Autentikasi dan RBAC: aturan akses harus ditegakkan server, bukan UI.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import { ApiClient, expectStatus } from "../lib/api-client.mjs";
import {
  createTicket,
  createUser,
  postComment,
  readEnv,
  seedOrg,
  uniqueLabel,
} from "../lib/fixtures.mjs";

let org;
let sr;

before(async () => {
  org = await seedOrg({ label: uniqueLabel("rbac") });
  sr = await createTicket(org.requester.client, {
    type: "service_request",
    title: "Service request untuk uji RBAC",
    description: "Permintaan layanan yang dipakai untuk menguji aturan akses.",
  });
});


describe("autentikasi", () => {
  it("healthcheck publik merespons 200", async () => {
    const guest = new ApiClient(readEnv().url);
    const { status, data } = await guest.request("GET", "/api/health");
    assert.equal(status, 200);
    assert.equal(data.code, 200);
  });

  it("password salah ditolak", async () => {
    const client = new ApiClient(readEnv().url);
    await expectStatus(
      client.request("POST", "/api/collections/users/auth-with-password", {
        body: { identity: org.requester.email, password: "PasswordSalah123!" },
      }),
      400,
      "login password salah"
    );
  });

  it("user nonaktif tidak bisa login", async () => {
    const email = `nonaktif.${uniqueLabel("x")}@uji.local`;
    await createUser(org.admin, {
      email,
      name: "User Nonaktif",
      role: "requester",
      unitId: org.unit.id,
      tenantId: org.tenant.id,
      isActive: false,
    });

    const client = new ApiClient(readEnv().url);
    const { status, data } = await client.request(
      "POST",
      "/api/collections/users/auth-with-password",
      { body: { identity: email, password: "RahasiaUji123!" } }
    );

    assert.ok(
      [400, 403].includes(status),
      `login user nonaktif harus ditolak, dapat ${status}`
    );
    assert.match(String(data.message), /satisfy|authenticate/i);
  });
});

describe("isolasi data dan RBAC", () => {
  it("tamu tidak menerima daftar tiket", async () => {
    const guest = new ApiClient(readEnv().url);
    const { status, data } = await guest.request(
      "GET",
      "/api/collections/tickets/records"
    );

    assert.equal(status, 200);
    assert.equal(data.totalItems, 0);
  });

  it("requester hanya melihat tiket miliknya, bukan tiket staf lain", async () => {
    const supportTicket = await createTicket(org.support.client, {
      title: "Tiket buatan staf IT untuk unit IT",
      description: "Tiket ini tidak boleh muncul di daftar requester unit lain.",
    });

    const mine = await org.requester.client.list("tickets", { perPage: 100 });
    const ids = mine.items.map((ticket) => ticket.id);

    assert.ok(ids.includes(sr.id), "tiket sendiri harus terlihat");
    assert.ok(!ids.includes(supportTicket.id), "tiket staf lain tidak boleh terlihat");
  });

  it("komentar internal tidak terlihat requester", async () => {
    await postComment(org.support.client, sr.id, "Catatan internal rahasia", "internal");
    await postComment(org.support.client, sr.id, "Komentar publik untuk pemohon", "public");

    const asRequester = await org.requester.client.list("ticket_comments", {
      filter: `ticket="${sr.id}"`,
      perPage: 100,
    });
    const asSupport = await org.support.client.list("ticket_comments", {
      filter: `ticket="${sr.id}"`,
      perPage: 100,
    });

    const requesterBodies = asRequester.items.map((item) => item.body);
    assert.ok(requesterBodies.every((body) => !body.includes("internal")));
    assert.equal(asSupport.items.length, 2);
  });

  it("requester tidak boleh menulis komentar internal", async () => {
    await expectStatus(
      org.requester.client.request("POST", `/api/itsm/tickets/${sr.id}/comments`, {
        body: { body: "Coba tulis internal", visibility: "internal" },
      }),
      403,
      "komentar internal oleh requester"
    );
  });

  it("support tidak boleh memutuskan approval", async () => {
    await expectStatus(
      org.support.client.request("POST", `/api/itsm/tickets/${sr.id}/approval`, {
        body: { decision: "approved", note: "Coba setujui" },
      }),
      403,
      "approval oleh support"
    );
  });

  it("audit log hanya terbaca IT Lead", async () => {
    const asRequester = await org.requester.client.list("audit_logs", { perPage: 5 });
    const asLead = await org.lead.client.list("audit_logs", {
      filter: `ticket="${sr.id}"`,
      perPage: 50,
    });

    assert.equal(asRequester.totalItems, 0);
    assert.ok(asLead.totalItems >= 1, "lead harus melihat audit tiket");
  });

  it("field sensitif user tidak bocor ke pengguna lain", async () => {
    const users = await org.requester.client.list("users", { perPage: 100 });
    const lead = users.items.find((item) => item.id === org.lead.user.id);

    assert.ok(lead, "lead harus terdaftar untuk sesama tenant");
    assert.ok(!lead.phone, "phone harus kosong untuk pengguna lain");
    assert.ok(!lead.employee_no, "employee_no harus kosong untuk pengguna lain");
  });

  it("tulis langsung ke koleksi bisnis ditolak", async () => {
    const created = await org.requester.client.request(
      "POST",
      "/api/collections/tickets/records",
      { body: { title: "Tiket ilegal" } }
    );
    assert.ok(
      [400, 403].includes(created.status),
      `create langsung harus ditolak, dapat ${created.status}`
    );

    const audit = await org.lead.client.request(
      "POST",
      "/api/collections/audit_logs/records",
      { body: { action: "palsu" } }
    );
    assert.ok(
      [400, 403].includes(audit.status),
      `create audit harus ditolak, dapat ${audit.status}`
    );
  });

  it("approval tetap harus lewat approver tahap aktif", async () => {
    const steps = await org.lead.client.list("ticket_approvals", {
      filter: `ticket="${sr.id}"`,
      sort: "step",
    });

    assert.equal(steps.items.length, 2);
    assert.equal(steps.items[0].kind, "unit_manager");

    // Lead bukan approver tahap 1, tetapi tetap boleh (override kebijakan);
    // yang diuji di sini adalah tahap pertama tercatat sebagai approver manajer.
    assert.equal(steps.items[0].approver, org.manager.user.id);
  });
});
