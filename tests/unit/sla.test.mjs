// Unit test matematika SLA: kalender bisnis, hari libur, dan 24x7.
// sla.js adalah CommonJS milik Goja; di Node bisa di-require langsung karena
// fungsi yang diuji tidak menyentuh global PocketBase.
import assert from "node:assert/strict";
import test from "node:test";

import { loadHookModule } from "../lib/load-hook.mjs";

const sla = loadHookModule("lib/sla.js");

const WIB_OFFSET = 7 * 60 * 60 * 1000;

function wib(year, month, day, hour, minute = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - WIB_OFFSET);
}

function parts(value) {
  const date = new Date(value);
  const shifted = new Date(date.getTime() + WIB_OFFSET);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay() || 7,
  };
}

function assertWib(value, year, month, day, hour, minute, label = "") {
  assert.deepEqual(
    {
      year: parts(value).year,
      month: parts(value).month,
      day: parts(value).day,
      hour: parts(value).hour,
      minute: parts(value).minute,
    },
    { year, month, day, hour, minute },
    label
  );
}

function policy(overrides = {}) {
  return {
    id: "policy-uji",
    version: 3,
    calendar_mode: "business_hours",
    response_minutes: 120,
    approval_minutes: 240,
    resolution_minutes: 480,
    business_days: [1, 2, 3, 4, 5],
    business_start: "08:00",
    business_end: "17:00",
    timezone: "Asia/Jakarta",
    ...overrides,
  };
}

test("24x7 menambah menit kalender tanpa jeda malam", () => {
  const due = sla.computeDue(
    wib(2026, 11, 1, 22, 0),
    "incident",
    "critical",
    policy({ calendar_mode: "24x7", response_minutes: 90, resolution_minutes: 240 }),
    []
  );

  assertWib(due.response, 2026, 11, 1, 23, 30, "respons");
  assertWib(due.resolution, 2026, 11, 2, 2, 0, "penyelesaian");
});

test("jam kerja menambah menit di hari yang sama", () => {
  const due = sla.computeDue(
    wib(2026, 11, 2, 9, 0),
    "incident",
    "normal",
    policy({ response_minutes: 120 }),
    []
  );

  assertWib(due.response, 2026, 11, 2, 11, 0);
});

test("jam kerja melewati malam dan akhir pekan", () => {
  const friday = sla.computeDue(
    wib(2026, 11, 6, 16, 0),
    "incident",
    "normal",
    policy({ response_minutes: 120 }),
    []
  );

  assertWib(friday.response, 2026, 11, 9, 9, 0, "Jumat 16:00 + 120 menit");

  const saturday = sla.computeDue(
    wib(2026, 11, 7, 10, 0),
    "incident",
    "normal",
    policy({ response_minutes: 60 }),
    []
  );

  assertWib(saturday.response, 2026, 11, 9, 9, 0, "Sabtu 10:00 + 60 menit");
});

test("hari libur dilewati dan dihitung dari jam buka berikutnya", () => {
  const holidays = [{ date: "2026-11-02 00:00:00.000Z" }];
  const due = sla.computeDue(
    wib(2026, 11, 2, 9, 0),
    "incident",
    "normal",
    policy({ response_minutes: 60 }),
    holidays
  );

  assertWib(due.response, 2026, 11, 3, 9, 0);
});

test("durasi nol menghasilkan tenggat kosong", () => {
  const due = sla.computeDue(
    wib(2026, 11, 2, 9, 0),
    "incident",
    "normal",
    policy({ approval_minutes: 0 }),
    []
  );

  assert.equal(due.approval, null);
  assert.ok(due.response instanceof Date);
});

test("snapshot merekam policy dan kalender yang dipakai", () => {
  const due = sla.computeDue(
    wib(2026, 11, 2, 9, 0),
    "service_request",
    "high",
    policy(),
    []
  );

  assert.equal(due.snapshot.policy_id, "policy-uji");
  assert.equal(due.snapshot.version, 3);
  assert.equal(due.snapshot.fallback, false);
  assert.equal(due.snapshot.calendar_mode, "business_hours");
  assert.deepEqual(due.snapshot.business_days, [1, 2, 3, 4, 5]);
  assert.equal(due.snapshot.response_minutes, 120);
  assert.ok(!Number.isNaN(Date.parse(due.snapshot.computed_at)));
});

test("policy hilang memakai fallback sesuai tipe dan prioritas", () => {
  const critical = sla.computeDue(wib(2026, 11, 2, 9, 0), "incident", "critical", null, []);
  const normal = sla.computeDue(wib(2026, 11, 2, 9, 0), "incident", "normal", null, []);

  assert.equal(critical.snapshot.fallback, true);
  assert.equal(critical.snapshot.calendar_mode, "24x7");
  assertWib(critical.response, 2026, 11, 2, 9, 15, "kritis 15 menit");

  assert.equal(normal.snapshot.calendar_mode, "business_hours");
  assertWib(normal.response, 2026, 11, 2, 11, 0, "normal 120 menit");
});

test("pemetaan dampak klinis ke prioritas", () => {
  assert.equal(sla.priorityFromImpact("patient_safety"), "critical");
  assert.equal(sla.priorityFromImpact("clinical_workflow"), "high");
  assert.equal(sla.priorityFromImpact("operational"), "normal");
  assert.equal(sla.priorityFromImpact("convenience"), "low");
  assert.equal(sla.priorityFromImpact("tidak-dikenal"), "normal");
  assert.equal(sla.priorityFromImpact(undefined), "normal");
});

test("addBusinessMinutes tidak menggeser saat durasi nol", () => {
  const start = wib(2026, 11, 2, 9, 0).getTime();
  assert.equal(sla.addBusinessMinutes(start, 0, policy(), []), start);
});
