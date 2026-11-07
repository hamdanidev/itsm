// Tim rumah sakit: IT Lead mengelola staf sendiri + kewajiban ganti password.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import { readEnv, seedOrg, uniqueLabel } from "../lib/fixtures.mjs";
import { ApiClient } from "../lib/api-client.mjs";

let org;
let other;

function memberEmail(label) {
  return `${label}.${Date.now().toString(36)}.${Math.random()
    .toString(36)
    .slice(2, 5)}@uji.local`;
}

before(async () => {
  org = await seedOrg({ label: uniqueLabel("tim"), isolatedTenant: true });
  other = await seedOrg({ label: uniqueLabel("tim2"), isolatedTenant: true });
}, { timeout: 120_000 });

describe("akses tim", () => {
  it("IT Lead melihat tim rumah sakitnya", async () => {
    const data = await org.lead.client.json("GET", "/api/itsm/team");

    assert.ok(data.items.length >= 3);
    assert.deepEqual(data.roles, [
      "requester",
      "it_support",
      "resolver",
      "it_lead",
      "viewer",
    ]);
    assert.ok(data.items.every((item) => item.email));
    assert.ok(data.items.some((item) => item.role === "it_lead"));
  });

  it("support dan requester tidak boleh mengelola tim", async () => {
    const support = await org.support.client.request("GET", "/api/itsm/team");
    assert.equal(support.status, 403);

    const requester = await org.requester.client.request("GET", "/api/itsm/team");
    assert.equal(requester.status, 403);
  });

  it("daftar tim mendukung halaman dan pencarian", async () => {
    const first = await org.lead.client.json("GET", "/api/itsm/team?page=1&perPage=2");

    assert.equal(first.perPage, 2);
    assert.equal(first.items.length, 2);
    assert.ok(first.totalItems >= 3);
    assert.equal(first.totalPages, Math.ceil(first.totalItems / 2));
    assert.equal(typeof first.active_lead_count, "number");

    const second = await org.lead.client.json("GET", "/api/itsm/team?page=2&perPage=2");
    assert.equal(second.page, 2);
    assert.notDeepEqual(
      second.items.map((item) => item.id),
      first.items.map((item) => item.id)
    );

    const target = first.items[0];
    const search = await org.lead.client.json(
      "GET",
      `/api/itsm/team?q=${encodeURIComponent(target.name)}`
    );

    assert.ok(search.items.some((item) => item.id === target.id));
    assert.ok(search.totalItems >= 1);
    assert.equal(search.page, 1);
  });
});

describe("menambah anggota tim", () => {
  it("lead membuat akun support dengan password sistem", async () => {
    const email = memberEmail("sup");
    const created = await org.lead.client.json("POST", "/api/itsm/team", {
      body: { name: "Support Baru", email, role: "it_support" },
    });

    assert.equal(created.user.email, email);
    assert.equal(created.user.role, "it_support");
    assert.equal(created.user.must_change_password, true);
    assert.equal(created.user.is_active, true);
    assert.equal(typeof created.password, "string");
    assert.ok(created.password.length >= 12, "password awal harus panjang");
  });

  it("email duplikat dan role asing ditolak", async () => {
    const email = memberEmail("dup");

    await org.lead.client.json("POST", "/api/itsm/team", {
      body: { name: "Pertama", email, role: "requester" },
    });

    const duplicate = await org.lead.client.request("POST", "/api/itsm/team", {
      body: { name: "Kedua", email, role: "requester" },
    });
    assert.equal(duplicate.status, 400);

    const badRole = await org.lead.client.request("POST", "/api/itsm/team", {
      body: { name: "Ketiga", email: memberEmail("role"), role: "admin" },
    });
    assert.equal(badRole.status, 400);
  });

  it("unit milik rumah sakit lain ditolak", async () => {
    const res = await org.lead.client.request("POST", "/api/itsm/team", {
      body: {
        name: "Salah Unit",
        email: memberEmail("unit"),
        role: "it_support",
        unit: other.itUnit.id,
      },
    });

    assert.equal(res.status, 400);
  });

  it("lead boleh menambah lead lain", async () => {
    const email = memberEmail("lead");
    const created = await org.lead.client.json("POST", "/api/itsm/team", {
      body: { name: "Lead Kedua", email, role: "it_lead" },
    });

    assert.equal(created.user.role, "it_lead");
  });

  it("lead boleh menambah teknisi dan pengamat", async () => {
    const teknisi = await org.lead.client.json("POST", "/api/itsm/team", {
      body: {
        name: "Teknisi Baru",
        email: memberEmail("teknisi"),
        role: "resolver",
        job_title: "Programmer",
        team: "application",
      },
    });

    const pengamat = await org.lead.client.json("POST", "/api/itsm/team", {
      body: {
        name: "Pengamat Baru",
        email: memberEmail("pengamat"),
        role: "viewer",
      },
    });

    assert.equal(teknisi.user.role, "resolver");
    assert.equal(teknisi.user.job_title, "Programmer");
    assert.equal(teknisi.user.team, "application");
    assert.equal(pengamat.user.role, "viewer");

    const updated = await org.lead.client.json(
      "PATCH",
      `/api/itsm/team/${teknisi.user.id}`,
      { body: { job_title: "Senior Programmer" } }
    );
    assert.equal(updated.user.job_title, "Senior Programmer");
  });
});

describe("kewajiban ganti password", () => {
  it("akun baru wajib ganti password sebelum memakai aplikasi", async () => {
    const email = memberEmail("wajib");
    const created = await org.lead.client.json("POST", "/api/itsm/team", {
      body: { name: "Wajib Ganti", email, role: "it_support" },
    });

    const { url } = readEnv();
    const member = new ApiClient(url);
    const record = await member.login(email, created.password);

    assert.equal(record.must_change_password, true);

    const blocked = await member.request("GET", "/api/itsm/profile");
    assert.equal(blocked.status, 403);
    assert.match(blocked.data.message, /Ganti password/i);

    const blockedTicket = await member.request("POST", "/api/itsm/tickets", {
      body: {
        type: "incident",
        title: "Tidak boleh",
        description: "Tidak boleh sebelum ganti password.",
        impact: "operational",
        patient_data_confirmed: true,
      },
    });
    assert.equal(blockedTicket.status, 403);

    await member.json("POST", "/api/itsm/profile/password", {
      body: {
        current_password: created.password,
        new_password: "PasswordBaru123!",
        new_password_confirm: "PasswordBaru123!",
      },
    });

    // Ganti password memutar tokenKey, jadi sesi lama berakhir dan pengguna
    // masuk lagi dengan password barunya.
    const fresh = new ApiClient(url);
    const record2 = await fresh.login(email, "PasswordBaru123!");

    assert.equal(record2.must_change_password, false);

    const allowed = await fresh.request("GET", "/api/itsm/profile");
    assert.equal(allowed.status, 200);
    assert.equal(allowed.data.must_change_password, false);
  });
});

describe("batas perubahan", () => {
  it("lead tidak bisa menonaktifkan akun sendiri", async () => {
    const res = await org.lead.client.request(
      "PATCH",
      `/api/itsm/team/${org.lead.user.id}`,
      { body: { is_active: false } }
    );

    assert.equal(res.status, 400);
  });

  it("lead tidak bisa mengubah role sendiri", async () => {
    const res = await org.lead.client.request(
      "PATCH",
      `/api/itsm/team/${org.lead.user.id}`,
      { body: { role: "requester" } }
    );

    assert.equal(res.status, 400);
  });

  it("lead menonaktifkan staf lain", async () => {
    const email = memberEmail("off");
    const created = await org.lead.client.json("POST", "/api/itsm/team", {
      body: { name: "Akan Nonaktif", email, role: "it_support" },
    });

    const res = await org.lead.client.json(
      "PATCH",
      `/api/itsm/team/${created.user.id}`,
      { body: { is_active: false } }
    );

    assert.equal(res.user.is_active, false);
  });

  it("tidak bisa menyentuh staf rumah sakit lain", async () => {
    const res = await org.lead.client.request(
      "PATCH",
      `/api/itsm/team/${other.support.user.id}`,
      { body: { name: "Pindah Silang" } }
    );

    assert.equal(res.status, 404);
  });
});

describe("reset password oleh lead", () => {
  it("password lama tidak berlaku dan password baru wajib diganti", async () => {
    const email = memberEmail("reset");
    const created = await org.lead.client.json("POST", "/api/itsm/team", {
      body: { name: "Reset Password", email, role: "it_support" },
    });

    const { url } = readEnv();
    const member = new ApiClient(url);
    const record = await member.login(email, created.password);

    await member.json("POST", "/api/itsm/profile/password", {
      body: {
        current_password: created.password,
        new_password: "PasswordBaru123!",
        new_password_confirm: "PasswordBaru123!",
      },
    });

    const reset = await org.lead.client.json(
      "POST",
      `/api/itsm/team/${created.user.id}/password`
    );

    assert.notEqual(reset.password, "PasswordBaru123!");
    assert.equal(reset.user.must_change_password, true);

    const fresh = new ApiClient(url);
    const oldPassword = await fresh.request(
      "POST",
      "/api/collections/users/auth-with-password",
      { body: { identity: email, password: "PasswordBaru123!" } }
    );
    assert.equal(oldPassword.status, 400);

    const newLogin = new ApiClient(url);
    const newRecord = await newLogin.login(email, reset.password);
    assert.equal(newRecord.must_change_password, true);
  });
});

describe("jejak audit", () => {
  it("pembuatan akun oleh lead tercatat", async () => {
    const audit = await org.lead.client.list("audit_logs", {
      filter: 'collection_name = "users"',
      sort: "-created",
      perPage: 10,
    });

    assert.ok(audit.totalItems >= 1);

    const created = audit.items.find((item) => item.action === "create");
    assert.ok(created, "create user harus tercatat");
    assert.equal(created.actor, org.lead.user.id);
    assert.equal(created.tenant, org.tenant.id);
  });
});
