// Unit test agregasi laporan SLA: median, bucket waktu, ringkasan, dan CSV.
import assert from "node:assert/strict";
import test from "node:test";

import { loadHookModule } from "../lib/load-hook.mjs";

const reporting = loadHookModule("lib/reporting.js");

const WIB_OFFSET = 7 * 60 * 60 * 1000;

function wib(year, month, day, hour = 0) {
  return Date.UTC(year, month - 1, day, hour) - WIB_OFFSET;
}

function row(overrides = {}) {
  return {
    ticketNo: "INC-1",
    type: "incident",
    priority: "normal",
    status: "resolved",
    unit: "IGD",
    category: "Pendaftaran",
    createdMs: wib(2026, 11, 2, 9),
    firstResponseMs: wib(2026, 11, 2, 9) + 30 * 60000,
    resolvedMs: wib(2026, 11, 2, 11),
    breached: false,
    breachedMs: 0,
    escalationLevel: 0,
    resolutionCode: "fixed",
    reopenCount: 0,
    ...overrides,
  };
}

test("median menangani data kosong, ganjil, dan genap", () => {
  assert.equal(reporting.median([]), null);
  assert.equal(reporting.median([5]), 5);
  assert.equal(reporting.median([1, 3]), 2);
  assert.equal(reporting.median([10, 1, 2]), 2);
  assert.equal(reporting.median([4, 1, 3, 2]), 2.5);
});

test("compliance membulatkan satu desimal dan kosong untuk nol tiket", () => {
  assert.equal(reporting.compliance(0, 0), null);
  assert.equal(reporting.compliance(10, 2), 80);
  assert.equal(reporting.compliance(3, 1), 66.7);
});

test("bucket bulan dan minggu memakai kalender WIB", () => {
  const monday = wib(2026, 11, 2, 9);
  const sunday = wib(2026, 11, 8, 20);
  const nextMonday = wib(2026, 11, 9, 8);

  assert.equal(reporting.monthKey(monday), "2026-11");
  assert.equal(reporting.weekKey(monday), "2026-W45");
  assert.equal(reporting.weekKey(sunday), "2026-W45");
  assert.equal(reporting.weekKey(nextMonday), "2026-W46");
});

test("summarize menghitung resolved, breach, dan median", () => {
  const rows = [
    row(),
    row({
      ticketNo: "INC-2",
      createdMs: wib(2026, 11, 2, 10),
      firstResponseMs: 0,
      resolvedMs: 0,
      status: "open",
    }),
    row({
      ticketNo: "INC-3",
      createdMs: wib(2026, 11, 3, 9),
      firstResponseMs: wib(2026, 11, 3, 9) + 60 * 60000,
      resolvedMs: wib(2026, 11, 3, 19),
      breached: true,
      priority: "critical",
      reopenCount: 2,
    }),
  ];

  const summary = reporting.summarize(rows);

  assert.equal(summary.total, 3);
  assert.equal(summary.resolved, 2);
  assert.equal(summary.breached, 1);
  assert.equal(summary.compliance, 66.7);
  assert.equal(summary.median_response_minutes, 45);
  assert.equal(summary.median_resolution_minutes, 360);
  assert.equal(summary.reopens, 2);
});

test("aggregate mengelompokkan unit, prioritas, jenis, dan tren bulanan", () => {
  const rows = [
    row(),
    row({
      ticketNo: "INC-2",
      unit: "Farmasi",
      priority: "critical",
      type: "service_request",
      breached: true,
      breachedMs: wib(2026, 11, 2, 12),
    }),
    row({
      ticketNo: "INC-3",
      createdMs: wib(2026, 12, 2, 9),
      resolvedMs: 0,
      firstResponseMs: 0,
      status: "open",
      unit: "IGD",
    }),
  ];

  const report = reporting.aggregate(rows, {
    fromMs: wib(2026, 11, 1),
    toMs: wib(2026, 12, 31, 23),
    bucket: "month",
  });

  assert.equal(report.summary.total, 3);
  assert.deepEqual(
    report.trend.map((item) => [item.key, item.created]),
    [
      ["2026-11", 2],
      ["2026-12", 1],
    ]
  );

  assert.equal(report.units[0].name, "IGD");
  assert.equal(report.units[0].summary.total, 2);
  assert.equal(report.priorities[0].name, "critical");
  assert.equal(report.types[0].name, "incident");
  assert.equal(report.breaches.length, 1);
  assert.equal(report.breaches[0].ticket_no, "INC-2");
});

test("trend mingguan memakai label minggu ISO", () => {
  const report = reporting.aggregate([row()], {
    fromMs: wib(2026, 11, 1),
    toMs: wib(2026, 11, 30, 23),
    bucket: "week",
  });

  assert.ok(report.trend.length >= 2);
  assert.equal(report.trend[0].key, "2026-W44");
  assert.match(report.trend[0].label, /Minggu \d+/);
});

test("CSV mengutip koma, tanda kutip, dan memakai header tetap", () => {
  const csv = reporting.toCsv([
    row({
      ticketNo: "INC-1",
      unit: 'IGD, "Rawat"',
      resolutionCode: "fixed",
    }),
  ]);
  const lines = csv.split("\r\n");

  assert.match(lines[0], /^ticket_no,type,priority,unit,/);
  assert.match(lines[1], /^INC-1,incident,normal,"IGD, ""Rawat""",/);
  assert.equal(lines.length, 2);
});

test("parseRange memvalidasi rentang dan default 90 hari", () => {
  const now = wib(2026, 11, 2, 12);
  const def = reporting.parseRange({}, now);

  assert.equal(def.days, 90);
  assert.equal(def.to, "2026-11-02");
  assert.equal(def.bucket, "month");

  const week = reporting.parseRange({ bucket: "week", from: "2026-10-01", to: "2026-10-31" }, now);
  assert.equal(week.bucket, "week");
  assert.equal(week.days, 31);

  assert.match(reporting.parseRange({ from: "2026-13-01" }, now).error, /tidak valid/);
  assert.match(
    reporting.parseRange({ from: "2026-11-05", to: "2026-11-01" }, now).error,
    /sebelum/
  );
  assert.match(
    reporting.parseRange({ from: "2024-01-01", to: "2026-11-01" }, now).error,
    /366/
  );
});
