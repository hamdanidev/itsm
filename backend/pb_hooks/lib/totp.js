// TOTP (RFC 6238) tanpa dependensi, berjalan di Goja (PocketBase JSVM) maupun
// Node untuk unit test. Dipakai untuk autentikasi dua faktor berbasis aplikasi
// authenticator.
//
// Hanya algoritma SHA-1/6 digit/30 detik yang dipakai; itu yang didukung
// Google Authenticator, Microsoft Authenticator, dan Authy secara default.
// `$security` hanya dibutuhkan untuk membuat secret/kode pemulihan, bukan untuk
// verifikasi, sehingga fungsi verifikasi bisa diuji di Node.

var BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
var RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
var PERIOD_SECONDS = 30;
var DIGITS = 6;

function randomSecret() {
  if (
    typeof $security === "undefined" ||
    !$security ||
    typeof $security.randomStringWithAlphabet !== "function"
  ) {
    throw new Error("Crypto helper tidak tersedia untuk membuat secret TOTP");
  }

  // 32 karakter base32 = 160 bit, panjang standar secret TOTP.
  return $security.randomStringWithAlphabet(32, BASE32_ALPHABET);
}

function base32Decode(input) {
  var clean = String(input == null ? "" : input)
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, "");
  var bytes = [];
  var value = 0;
  var bits = 0;

  for (var i = 0; i < clean.length; i++) {
    var index = BASE32_ALPHABET.indexOf(clean[i]);
    if (index < 0) continue;

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
      value = value & ((1 << bits) - 1);
    }
  }

  return bytes;
}

function base32Encode(bytes) {
  var output = "";
  var value = 0;
  var bits = 0;

  for (var i = 0; i < bytes.length; i++) {
    value = (value << 8) | (bytes[i] & 0xff);
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
      value = value & ((1 << bits) - 1);
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  while (output.length % 8 !== 0) output += "=";

  return output;
}

function rotl(value, bits) {
  return ((value << bits) | (value >>> (32 - bits))) | 0;
}

// SHA-1 atas array byte; mengembalikan array 20 byte.
function sha1(bytes) {
  var bitLength = bytes.length * 8;
  var padded = bytes.slice();

  padded.push(0x80);
  while (padded.length % 64 !== 56) padded.push(0);

  var high = Math.floor(bitLength / 4294967296);
  var low = bitLength >>> 0;

  padded.push(
    (high >>> 24) & 0xff,
    (high >>> 16) & 0xff,
    (high >>> 8) & 0xff,
    high & 0xff,
    (low >>> 24) & 0xff,
    (low >>> 16) & 0xff,
    (low >>> 8) & 0xff,
    low & 0xff
  );

  var h0 = 0x67452301;
  var h1 = 0xefcdab89;
  var h2 = 0x98badcfe;
  var h3 = 0x10325476;
  var h4 = 0xc3d2e1f0;

  for (var offset = 0; offset < padded.length; offset += 64) {
    var w = [];

    for (var i = 0; i < 16; i++) {
      w[i] =
        (padded[offset + i * 4] << 24) |
        (padded[offset + i * 4 + 1] << 16) |
        (padded[offset + i * 4 + 2] << 8) |
        padded[offset + i * 4 + 3];
    }

    for (var j = 16; j < 80; j++) {
      w[j] = rotl(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);
    }

    var a = h0;
    var b = h1;
    var c = h2;
    var d = h3;
    var e = h4;

    for (var k = 0; k < 80; k++) {
      var f;
      var constant;

      if (k < 20) {
        f = (b & c) | (~b & d);
        constant = 0x5a827999;
      } else if (k < 40) {
        f = b ^ c ^ d;
        constant = 0x6ed9eba1;
      } else if (k < 60) {
        f = (b & c) | (b & d) | (c & d);
        constant = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        constant = 0xca62c1d6;
      }

      var temp = (rotl(a, 5) + f + e + constant + w[k]) | 0;

      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }

  var digest = [];

  function appendWord(word) {
    digest.push(
      (word >>> 24) & 0xff,
      (word >>> 16) & 0xff,
      (word >>> 8) & 0xff,
      word & 0xff
    );
  }

  appendWord(h0);
  appendWord(h1);
  appendWord(h2);
  appendWord(h3);
  appendWord(h4);

  return digest;
}

function hmacSha1(keyBytes, messageBytes) {
  var key = keyBytes.slice();

  if (key.length > 64) key = sha1(key);

  var inner = [];
  var outer = [];

  for (var i = 0; i < 64; i++) {
    var byte = i < key.length ? key[i] & 0xff : 0;
    inner.push(byte ^ 0x36);
    outer.push(byte ^ 0x5c);
  }

  return sha1(outer.concat(sha1(inner.concat(messageBytes))));
}

function counterBytes(counter) {
  var high = Math.floor(counter / 4294967296);
  var low = counter % 4294967296;

  return [
    (high >>> 24) & 0xff,
    (high >>> 16) & 0xff,
    (high >>> 8) & 0xff,
    high & 0xff,
    (low >>> 24) & 0xff,
    (low >>> 16) & 0xff,
    (low >>> 8) & 0xff,
    low & 0xff,
  ];
}

// HOTP (RFC 4226) 6 digit untuk counter tertentu.
function hotp(secret, counter) {
  var digest = hmacSha1(base32Decode(secret), counterBytes(counter));
  var offset = digest[19] & 0x0f;
  var binary =
    (((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff)) >>>
    0;
  var code = String(binary % 1000000);

  while (code.length < DIGITS) code = "0" + code;

  return code;
}

function stepFor(epochSeconds) {
  return Math.floor(Number(epochSeconds || 0) / PERIOD_SECONDS);
}

function normalizeCode(code) {
  return String(code == null ? "" : code).replace(/[\s-]/g, "");
}

// Memeriksa kode TOTP dengan toleransi satu langkah ke belakang/depan.
// Mengembalikan { valid, step }; step dipakai untuk mencegah kode dipakai ulang.
function verifyStep(secret, code, options) {
  var normalized = normalizeCode(code);
  var opts = options || {};
  var window = opts.window === undefined ? 1 : Number(opts.window);

  if (!/^\d{6}$/.test(normalized)) {
    return { valid: false, step: 0 };
  }

  var current = opts.at
    ? stepFor(opts.at)
    : stepFor(Math.floor(Date.now() / 1000));

  for (var offset = -window; offset <= window; offset++) {
    var step = current + offset;
    if (step < 0) continue;
    if (hotp(secret, step) === normalized) {
      return { valid: true, step: step };
    }
  }

  return { valid: false, step: 0 };
}

function provisioningUri(options) {
  var opts = options || {};
  var issuer = String(opts.issuer || "Healthcare ITSM");
  var account = String(opts.account || "");
  var secret = String(opts.secret || "");
  var label = encodeURIComponent(issuer) + ":" + encodeURIComponent(account);

  return (
    "otpauth://totp/" +
    label +
    "?secret=" +
    encodeURIComponent(secret) +
    "&issuer=" +
    encodeURIComponent(issuer) +
    "&algorithm=SHA1&digits=" +
    DIGITS +
    "&period=" +
    PERIOD_SECONDS
  );
}

// Kode pemulihan sekali pakai. Tanpa karakter ambigu supaya mudah disalin.
function generateRecoveryCodes(count) {
  var total = Number(count) > 0 ? Number(count) : 10;
  var codes = [];

  if (
    typeof $security === "undefined" ||
    !$security ||
    typeof $security.randomStringWithAlphabet !== "function"
  ) {
    throw new Error("Crypto helper tidak tersedia untuk membuat kode pemulihan");
  }

  for (var i = 0; i < total; i++) {
    // 12 karakter (60 bit) supaya hash SHA-256 tetap mahal untuk ditebak bila
    // database bocor; tetap mudah diketik ulang.
    var raw = $security.randomStringWithAlphabet(12, RECOVERY_ALPHABET);
    codes.push(
      raw.slice(0, 4) + "-" + raw.slice(4, 8) + "-" + raw.slice(8, 12)
    );
  }

  return codes;
}

function normalizeRecoveryCode(code) {
  return String(code == null ? "" : code)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function hashRecoveryCode(code) {
  if (
    typeof $security === "undefined" ||
    !$security ||
    typeof $security.sha256 !== "function"
  ) {
    throw new Error("Crypto helper tidak tersedia untuk hash kode pemulihan");
  }

  return $security.sha256(normalizeRecoveryCode(code));
}

module.exports = {
  BASE32_ALPHABET: BASE32_ALPHABET,
  PERIOD_SECONDS: PERIOD_SECONDS,
  DIGITS: DIGITS,
  randomSecret: randomSecret,
  base32Decode: base32Decode,
  base32Encode: base32Encode,
  sha1: sha1,
  hmacSha1: hmacSha1,
  hotp: hotp,
  stepFor: stepFor,
  normalizeCode: normalizeCode,
  verifyStep: verifyStep,
  provisioningUri: provisioningUri,
  generateRecoveryCodes: generateRecoveryCodes,
  normalizeRecoveryCode: normalizeRecoveryCode,
  hashRecoveryCode: hashRecoveryCode,
};
