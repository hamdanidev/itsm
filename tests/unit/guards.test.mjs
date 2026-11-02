// Unit test guard teks/tanggal. guards.js memakai kelas error global milik
// PocketBase, jadi di sini distub dulu sebelum modul dijalankan.
import assert from "node:assert/strict";
import test from "node:test";

import { loadHookModule } from "../lib/load-hook.mjs";

globalThis.BadRequestError = class BadRequestError extends Error {};
globalThis.UnauthorizedError = class UnauthorizedError extends Error {};
globalThis.ForbiddenError = class ForbiddenError extends Error {};
globalThis.NotFoundError = class NotFoundError extends Error {};

const guards = loadHookModule("lib/guards.js");

function auth(role) {
  return { get: (key) => (key === "role" ? role : undefined) };
}

test("cleanText memangkas spasi dan menormalkan nilai kosong", () => {
  assert.equal(guards.cleanText("  halo  "), "halo");
  assert.equal(guards.cleanText(null), "");
  assert.equal(guards.cleanText(undefined), "");
  assert.equal(guards.cleanText(0), "0");
});

test("cleanText menolak teks melebihi batas", () => {
  assert.equal(guards.cleanText("abc", 3), "abc");
  assert.throws(() => guards.cleanText("abcd", 3), /maximum length of 3/);
});

test("optionalDate mengosongkan nilai kosong dan memvalidasi tanggal", () => {
  assert.equal(guards.optionalDate(""), "");
  assert.equal(guards.optionalDate(null), "");
  assert.equal(guards.optionalDate(undefined), "");

  const iso = guards.optionalDate("2026-11-02T09:00:00+07:00", "planned_start");
  assert.equal(iso, new Date("2026-11-02T02:00:00.000Z").toISOString());

  assert.throws(
    () => guards.optionalDate("bukan-tanggal", "planned_start"),
    /Invalid date for planned_start/
  );
});

test("peran staf dan lead dikenali dari role", () => {
  assert.equal(guards.roleOf(auth("it_support")), "it_support");
  assert.equal(guards.roleOf(null), "");

  assert.equal(guards.isStaff(auth("it_support")), true);
  assert.equal(guards.isStaff(auth("it_lead")), true);
  assert.equal(guards.isStaff(auth("requester")), false);
  assert.equal(guards.isStaff(auth("")), false);

  assert.equal(guards.isLead(auth("it_lead")), true);
  assert.equal(guards.isLead(auth("it_support")), false);
});

test("assertStaff dan assertLead melempar untuk peran yang salah", () => {
  assert.doesNotThrow(() => guards.assertStaff(auth("it_support")));
  assert.throws(() => guards.assertStaff(auth("requester")), /Staff role required/);

  assert.doesNotThrow(() => guards.assertLead(auth("it_lead")));
  assert.throws(() => guards.assertLead(auth("it_support")), /IT Lead role required/);
});

function scopedAuth(role, isPlatform) {
  return {
    get: (key) => {
      if (key === "role") return role;
      if (key === "is_platform_staff") return isPlatform;
      return undefined;
    },
  };
}

test("scope platform dikenali terpisah dari role", () => {
  assert.equal(guards.isPlatformStaff(scopedAuth("it_lead", true)), true);
  assert.equal(guards.isPlatformStaff(scopedAuth("it_lead", false)), false);
  assert.equal(guards.isPlatformStaff(scopedAuth("it_lead", undefined)), false);
  assert.equal(guards.isPlatformStaff(null), false);

  assert.equal(guards.isPlatformAdmin(scopedAuth("it_lead", true)), true);
  assert.equal(guards.isPlatformAdmin(scopedAuth("it_support", true)), false);
  assert.equal(guards.isPlatformAdmin(scopedAuth("it_lead", false)), false);
});

test("assertPlatformStaff dan assertPlatformAdmin menolak akun tenant", () => {
  assert.doesNotThrow(() =>
    guards.assertPlatformStaff(scopedAuth("it_support", true))
  );
  assert.throws(
    () => guards.assertPlatformStaff(scopedAuth("it_lead", false)),
    /Platform staff role required/
  );

  assert.doesNotThrow(() =>
    guards.assertPlatformAdmin(scopedAuth("it_lead", true))
  );
  assert.throws(
    () => guards.assertPlatformAdmin(scopedAuth("it_support", true)),
    /Platform admin role required/
  );
});
