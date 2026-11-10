// Unit test TOTP: vektor RFC 6238, Base32, jendela toleransi, dan kode pemulihan.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { loadHookModule } from "../lib/load-hook.mjs";

const totp = loadHookModule("lib/totp.js");

// Secret RFC 6238: ASCII "12345678901234567890".
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

test("HOTP cocok dengan vektor uji RFC 6238", () => {
  const vectors = [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ];

  for (const [time, expected] of vectors) {
    assert.equal(totp.hotp(RFC_SECRET, totp.stepFor(time)), expected);
  }
});

test("Base32 encode/decode bolak-balik", () => {
  const bytes = [...Buffer.from("12345678901234567890", "utf8")];

  assert.equal(totp.base32Encode(bytes), RFC_SECRET);
  assert.deepEqual(totp.base32Decode(RFC_SECRET), bytes);
});

test("verifyStep menerima kode sekarang dan satu langkah di sekitarnya", () => {
  const now = 1111111109;
  const step = totp.stepFor(now);
  const current = totp.hotp(RFC_SECRET, step);
  const previous = totp.hotp(RFC_SECRET, step - 1);
  const future = totp.hotp(RFC_SECRET, step + 1);
  const far = totp.hotp(RFC_SECRET, step + 2);

  assert.deepEqual(totp.verifyStep(RFC_SECRET, current, { at: now }), {
    valid: true,
    step,
  });
  assert.deepEqual(totp.verifyStep(RFC_SECRET, previous, { at: now }), {
    valid: true,
    step: step - 1,
  });
  assert.deepEqual(totp.verifyStep(RFC_SECRET, future, { at: now }), {
    valid: true,
    step: step + 1,
  });
  assert.equal(totp.verifyStep(RFC_SECRET, far, { at: now }).valid, false);
  assert.equal(totp.verifyStep(RFC_SECRET, "000000", { at: now }).valid, false);
  assert.equal(totp.verifyStep(RFC_SECRET, "", { at: now }).valid, false);
});

test("kode boleh mengandung spasi atau tanda hubung", () => {
  const at = 1234567890;
  const code = totp.hotp(RFC_SECRET, totp.stepFor(at));

  assert.equal(totp.verifyStep(RFC_SECRET, `${code}`, { at }).valid, true);
  assert.equal(totp.normalizeCode(`${code} `), code);
  assert.equal(totp.normalizeCode("123-456"), "123456");
});

test("URI provisioning memuat issuer, akun, dan parameter TOTP", () => {
  const uri = totp.provisioningUri({
    issuer: "RS Contoh",
    account: "budi@rs.example",
    secret: RFC_SECRET,
  });

  assert.match(uri, /^otpauth:\/\/totp\//);
  assert.match(uri, /secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ/);
  assert.match(uri, /issuer=RS%20Contoh/);
  assert.match(uri, /algorithm=SHA1/);
  assert.match(uri, /digits=6/);
  assert.match(uri, /period=30/);
  assert.match(uri, /budi%40rs\.example/);
});

test("hash kode pemulihan menormalkan huruf besar/kecil dan pemisah", () => {
  globalThis.$security = {
    sha256: (text) => createHash("sha256").update(String(text)).digest("hex"),
  };

  const normalized = totp.hashRecoveryCode("abcd-efgh");

  assert.equal(totp.normalizeRecoveryCode(" abcd-efgh "), "ABCDEFGH");
  assert.equal(normalized, totp.hashRecoveryCode("ABCD EFGH"));
  assert.notEqual(normalized, totp.hashRecoveryCode("ABCD-EFGI"));

  delete globalThis.$security;
});
