// Unit test pemeriksaan operasional: kesegaran backup dan ambang disk.
import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateBackup,
  evaluateDisk,
} from "../../scripts/ops/check.mjs";

const HOUR = 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

test("backup segar dan berukuran wajar dianggap OK", () => {
  const result = evaluateBackup({
    now: NOW,
    maxAgeHours: 26,
    files: [
      { name: "pb_backup_lama.zip", size: 1000, mtimeMs: NOW - 48 * HOUR },
      { name: "pb_backup_baru.zip", size: 2000, mtimeMs: NOW - 2 * HOUR },
      { name: "catatan.txt", size: 10, mtimeMs: NOW },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.level, "ok");
  assert.equal(result.name, "pb_backup_baru.zip");
  assert.equal(result.bytes, 2000);
});

test("tidak ada ZIP, ZIP 0 byte, atau backup basi dianggap gagal", () => {
  assert.equal(
    evaluateBackup({ now: NOW, maxAgeHours: 26, files: [] }).level,
    "fail"
  );

  assert.equal(
    evaluateBackup({
      now: NOW,
      maxAgeHours: 26,
      files: [{ name: "pb_backup.zip", size: 0, mtimeMs: NOW - HOUR }],
    }).level,
    "fail"
  );

  assert.equal(
    evaluateBackup({
      now: NOW,
      maxAgeHours: 26,
      files: [{ name: "pb_backup.zip", size: 10, mtimeMs: NOW - 30 * HOUR }],
    }).level,
    "fail"
  );
});

test("ambang disk membedakan OK, warning, dan critical", () => {
  const total = 1000;

  assert.equal(
    evaluateDisk({
      totalBytes: total,
      freeBytes: 500,
      warnPct: 80,
      criticalPct: 90,
    }).level,
    "ok"
  );

  assert.equal(
    evaluateDisk({
      totalBytes: total,
      freeBytes: 150,
      warnPct: 80,
      criticalPct: 90,
    }).level,
    "warn"
  );

  assert.equal(
    evaluateDisk({
      totalBytes: total,
      freeBytes: 50,
      warnPct: 80,
      criticalPct: 90,
    }).level,
    "fail"
  );

  assert.equal(
    evaluateDisk({
      totalBytes: 0,
      freeBytes: 0,
      warnPct: 80,
      criticalPct: 90,
    }).level,
    "warn"
  );
});
