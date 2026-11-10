// Unit test pemeriksaan operasional: kesegaran backup dan ambang disk.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import {
  buildPushUrl,
  evaluateBackup,
  evaluateDisk,
  pushHeartbeat,
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

test("URL push Uptime Kuma memuat status, pesan, dan ping", () => {
  const url = new URL(
    buildPushUrl("https://uptime.example/api/push/TOKEN", {
      status: "fail",
      message: "health: Health 500",
      ping: 42.4,
    })
  );

  assert.equal(url.pathname, "/api/push/TOKEN");
  assert.equal(url.searchParams.get("status"), "down");
  assert.equal(url.searchParams.get("msg"), "health: Health 500");
  assert.equal(url.searchParams.get("ping"), "42");
});

test("pushHeartbeat mengirim status down saat pemeriksaan gagal", async () => {
  let captured = null;
  const server = createServer((request, response) => {
    captured = new URL(request.url, "http://127.0.0.1");
    response.end("ok");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  try {
    const result = await pushHeartbeat(
      `http://127.0.0.1:${port}/api/push/token`,
      {
        status: "fail",
        health: { level: "fail", message: "Health 500", latencyMs: 12 },
        backup: { level: "ok", message: "" },
        disk: { level: "ok", message: "" },
      }
    );

    assert.equal(result.ok, true);
    assert.equal(result.status, "down");
    assert.equal(captured.searchParams.get("status"), "down");
    assert.match(captured.searchParams.get("msg"), /health: Health 500/);
    assert.equal(captured.searchParams.get("ping"), "12");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("pushHeartbeat dilewati bila URL tidak diatur", async () => {
  const result = await pushHeartbeat("", { status: "ok" });

  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
});
