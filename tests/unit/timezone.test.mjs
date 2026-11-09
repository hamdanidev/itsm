// Unit test konversi zona waktu: offset, DST, batas hari, dan validasi nama.
// Modul ini memakai backend `Intl` saat berjalan di Node, backend yang sama
// dengan basis data zona IANA yang dipakai `Timezone`/`DateTime` di Goja.
import assert from "node:assert/strict";
import test from "node:test";

import { loadHookModule } from "../lib/load-hook.mjs";

const tz = loadHookModule("lib/timezone.js");

function localPartsAt(iso, zone) {
  return tz.localParts(new Date(iso).getTime(), zone);
}

test("offset mengikuti zona, bukan offset tetap", () => {
  const instant = Date.UTC(2026, 10, 9, 3, 0);

  assert.equal(tz.offsetMinutes(instant, "Asia/Jakarta"), 420);
  assert.equal(tz.offsetMinutes(instant, "Asia/Makassar"), 480);
  assert.equal(tz.offsetMinutes(instant, "Asia/Jayapura"), 540);
  assert.equal(tz.offsetMinutes(instant, "UTC"), 0);
});

test("offset berubah mengikuti DST", () => {
  const winter = Date.UTC(2026, 0, 15, 12, 0);
  const summer = Date.UTC(2026, 6, 15, 12, 0);

  assert.equal(tz.offsetMinutes(winter, "America/New_York"), -300);
  assert.equal(tz.offsetMinutes(summer, "America/New_York"), -240);
  assert.equal(tz.offsetMinutes(winter, "Europe/Amsterdam"), 60);
  assert.equal(tz.offsetMinutes(summer, "Europe/Amsterdam"), 120);
});

test("bagian waktu lokal membaca tanggal yang benar di kedua sisi UTC", () => {
  // 03:30Z = 22:30 tanggal sebelumnya di New York, 10:30 di Jakarta.
  const instant = Date.UTC(2026, 10, 9, 3, 30);

  assert.deepEqual(tz.localParts(instant, "America/New_York"), {
    year: 2026,
    month: 10,
    day: 8,
    hour: 22,
    minute: 30,
    weekday: 7,
  });

  assert.equal(tz.dateKey(instant, "Asia/Jakarta"), "2026-11-09");
  assert.equal(tz.dateKey(instant, "America/New_York"), "2026-11-08");
  assert.equal(tz.dateKey(instant, "Pacific/Auckland"), "2026-11-09");
});

test("fromLocal adalah kebalikan localParts", () => {
  const samples = [
    ["2026-11-09T03:30:00.000Z", "Asia/Makassar"],
    ["2026-03-08T07:30:00.000Z", "America/New_York"],
    ["2026-11-02T14:00:00.000Z", "America/New_York"],
    ["2026-06-01T22:15:00.000Z", "Europe/Amsterdam"],
  ];

  for (const [iso, zone] of samples) {
    const instant = new Date(iso).getTime();
    const parts = tz.localParts(instant, zone);
    const rebuilt = tz.fromLocal(
      parts.year,
      parts.month,
      parts.day,
      parts.hour,
      parts.minute,
      zone
    );

    assert.equal(new Date(rebuilt).toISOString(), iso, `${zone} ${iso}`);
  }
});

test("hari DST panjangnya 23 atau 25 jam", () => {
  const springForward = tz.fromLocal(2026, 2, 8, 0, 0, "America/New_York");
  const springEnd = tz.endOfDay(springForward, "America/New_York");
  const springHours = (springEnd + 1 - springForward) / 3600000;

  assert.equal(springHours, 23);

  const fallBack = tz.fromLocal(2026, 10, 1, 0, 0, "America/New_York");
  const fallEnd = tz.endOfDay(fallBack, "America/New_York");
  const fallHours = (fallEnd + 1 - fallBack) / 3600000;

  assert.equal(fallHours, 25);
});

test("startOfDay tidak bergeser karena jam malam", () => {
  const lateAtNight = tz.fromLocal(2026, 10, 5, 23, 45, "Asia/Makassar");
  const start = tz.startOfDay(lateAtNight, "Asia/Makassar");

  assert.deepEqual(tz.localParts(start, "Asia/Makassar"), {
    year: 2026,
    month: 10,
    day: 5,
    hour: 0,
    minute: 0,
    weekday: 4,
  });
});

test("zona tidak dikenal jatuh ke default dan tidak dianggap valid", () => {
  assert.equal(tz.isValidZone("Asia/Jakarta"), true);
  assert.equal(tz.isValidZone("America/Argentina/Buenos_Aires"), true);
  assert.equal(tz.isValidZone("Mars/Olympus"), false);
  assert.equal(tz.isValidZone("bukan/zona!"), false);
  assert.equal(tz.isValidZone(""), false);
  assert.equal(tz.isValidZone(null), false);

  assert.equal(tz.resolveZone("Mars/Olympus"), "Asia/Jakarta");
  assert.equal(tz.resolveZone("Asia/Makassar"), "Asia/Makassar");
});
