// Validasi input Konsol Vendor. Modul ini memakai BadRequestError global milik
// PocketBase, jadi di sini distub dulu sebelum modul dijalankan.
import assert from "node:assert/strict";
import test from "node:test";

import { loadHookModule } from "../lib/load-hook.mjs";

globalThis.BadRequestError = class BadRequestError extends Error {};

const platform = loadHookModule("lib/platform.js");

test("normalizeCode membersihkan spasi dan mengubah ke huruf besar", () => {
  assert.equal(platform.normalizeCode(" rsud-bdg "), "RSUD-BDG");
  assert.equal(platform.normalizeCode("abc def"), "ABCDEF");
  assert.equal(platform.normalizeCode(null), "");
});

test("validateTenantInput mengisi default zona waktu", () => {
  const input = platform.validateTenantInput(
    { name: "RSUD Kota", code: "rsud-kota" },
    false
  );

  assert.deepEqual(input, {
    name: "RSUD Kota",
    code: "RSUD-KOTA",
    timezone: "Asia/Jakarta",
  });
});

test("validateTenantInput menolak nama pendek dan kode tidak valid", () => {
  assert.throws(
    () => platform.validateTenantInput({ name: "A", code: "AB" }, false),
    /minimal 2 karakter/
  );

  assert.throws(
    () => platform.validateTenantInput({ name: "RS A", code: "A" }, false),
    /2–20 karakter/
  );

  assert.throws(
    () =>
      platform.validateTenantInput({ name: "RS A", code: "AB CD!" }, false),
    /2–20 karakter/
  );

  assert.throws(
    () =>
      platform.validateTenantInput(
        { name: "RS A", code: "AB", timezone: "bukan/zona!" },
        false
      ),
    /Zona waktu tidak valid/
  );
});

test("validateTenantInput partial hanya menyentuh field yang dikirim", () => {
  assert.deepEqual(platform.validateTenantInput({ is_active: false }, true), {
    is_active: false,
  });

  assert.deepEqual(platform.validateTenantInput({ timezone: "Asia/Makassar" }, true), {
    timezone: "Asia/Makassar",
  });
});

test("validateUserInput menerima job_title dan membatasi panjangnya", () => {
  assert.deepEqual(
    platform.validateUserInput({ job_title: "Programmer" }, true),
    { job_title: "Programmer" }
  );

  assert.throws(
    () => platform.validateUserInput({ job_title: "x".repeat(81) }, true),
    /Teks melebihi 80 karakter/
  );
});

test("validateUserInput menerima tim yang dikenal", () => {
  assert.deepEqual(
    platform.validateUserInput({ team: "application" }, true),
    { team: "application" }
  );

  assert.throws(
    () => platform.validateUserInput({ team: "tim-asing" }, true),
    /Tim tidak valid/
  );
});

test("validateUserInput mewajibkan password saat membuat pengguna", () => {
  assert.throws(
    () =>
      platform.validateUserInput(
        { name: "Budi", email: "budi@rs.id", role: "it_support", password: "123" },
        false
      ),
    /minimal 8 karakter/
  );

  assert.throws(
    () =>
      platform.validateUserInput(
        { name: "Budi", email: "bukan-email", role: "it_support", password: "rahasia123" },
        false
      ),
    /Email tidak valid/
  );

  assert.throws(
    () =>
      platform.validateUserInput(
        { name: "Budi", email: "budi@rs.id", role: "superuser", password: "rahasia123" },
        false
      ),
    /Role harus/
  );
});

test("validateUserInput partial mengizinkan perubahan status saja", () => {
  assert.deepEqual(platform.validateUserInput({ is_active: false }, true), {
    is_active: false,
  });
  assert.deepEqual(platform.validateUserInput({ password: "" }, true), {});
});
