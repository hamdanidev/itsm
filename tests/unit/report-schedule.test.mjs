// Unit test jadwal laporan: pukul 07:00 waktu lokal tenant, bukan WIB.
import assert from "node:assert/strict";
import test from "node:test";

import { loadHookModule } from "../lib/load-hook.mjs";

const schedule = loadHookModule("lib/report_schedule.js");

function localLabel(iso, zone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));

  const map = {};
  for (const part of parts) map[part.type] = part.value;

  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}`;
}

test("jadwal mingguan jatuh Senin 07:00 waktu lokal tenant", () => {
  // Jumat 6 November 2026 12:00 WITA.
  const now = Date.UTC(2026, 10, 6, 4, 0);
  const next = schedule.nextRun("weekly", now, "Asia/Makassar");

  assert.equal(localLabel(next, "Asia/Makassar"), "2026-11-09 07:00");
  // 07:00 WITA = 23:00Z hari sebelumnya.
  assert.equal(next, "2026-11-08T23:00:00.000Z");
});

test("jadwal mingguan boleh jatuh di hari yang sama bila belum pukul 07:00", () => {
  const now = Date.UTC(2026, 10, 8, 22, 0); // Senin 06:00 WITA
  const next = schedule.nextRun("weekly", now, "Asia/Makassar");

  assert.equal(localLabel(next, "Asia/Makassar"), "2026-11-09 07:00");
  assert.equal(next, "2026-11-08T23:00:00.000Z");
});

test("jadwal bulanan jatuh tanggal 1 pukul 07:00 waktu lokal", () => {
  const now = Date.UTC(2026, 10, 9, 3, 0); // 9 November 11:00 WITA
  const next = schedule.nextRun("monthly", now, "Asia/Makassar");

  assert.equal(localLabel(next, "Asia/Makassar"), "2026-12-01 07:00");
});

test("jadwal bulanan tidak menunggu bila masih tanggal 1 pagi", () => {
  const now = Date.UTC(2026, 10, 30, 22, 30); // 1 Desember 06:30 WITA
  const next = schedule.nextRun("monthly", now, "Asia/Makassar");

  assert.equal(localLabel(next, "Asia/Makassar"), "2026-12-01 07:00");
});

test("zona tenant menggeser jam kirim relatif terhadap WIB", () => {
  const now = Date.UTC(2026, 10, 6, 4, 0);
  const jakarta = schedule.nextRun("weekly", now, "Asia/Jakarta");
  const makassar = schedule.nextRun("weekly", now, "Asia/Makassar");

  assert.equal(localLabel(jakarta, "Asia/Jakarta"), "2026-11-09 07:00");
  assert.equal(localLabel(makassar, "Asia/Makassar"), "2026-11-09 07:00");
  assert.equal(
    new Date(jakarta).getTime() - new Date(makassar).getTime(),
    60 * 60 * 1000
  );
});

test("frekuensi tidak dikenal tidak punya jadwal berikutnya", () => {
  assert.equal(schedule.nextRun("off", Date.now(), "Asia/Jakarta"), "");
  assert.equal(schedule.nextRun("manual", Date.now(), "Asia/Jakarta"), "");
});
