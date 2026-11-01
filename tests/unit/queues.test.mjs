// Unit test helper antrean dashboard: status aktif, breach, prioritas tenggat,
// dan agregasi unit/usia. Semua fungsi murni sehingga tidak butuh PocketBase.
import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVE_STATUSES,
  isActive,
  isBreached,
  isDueSoon,
  isWorking,
  nextDueOf,
  compareDue,
  compareUrgency,
  groupByUnit,
  groupByAge,
  ageInDays,
} from "../../frontend/src/features/tickets/lib/queues.js";

test("status kerja dan status aktif dibedakan", () => {
  assert.deepEqual(ACTIVE_STATUSES, [
    "open",
    "assigned",
    "in_progress",
    "reopened",
    "waiting",
  ]);

  assert.equal(isWorking({ status: "waiting" }), false);
  assert.equal(isActive({ status: "waiting" }), true);
  assert.equal(isActive({ status: "closed" }), false);
  assert.equal(isActive(null), false);
});

test("breach terdeteksi dari salah satu field SLA", () => {
  assert.equal(isBreached({ response_breach_at: "2026-11-01T00:00:00Z" }), true);
  assert.equal(isBreached({ approval_breach_at: "2026-11-01T00:00:00Z" }), true);
  assert.equal(isBreached({ resolution_breach_at: "2026-11-01T00:00:00Z" }), true);
  assert.equal(isBreached({}), false);
  assert.equal(isBreached(null), false);
});

test("nextDueOf memakai SLA gate yang berlaku", () => {
  assert.equal(
    nextDueOf({
      next_due_at: "2026-11-02T02:00:00Z",
      resolution_due_at: "2026-11-03T02:00:00Z",
      approval_due_at: "2026-11-02T01:00:00Z",
    }),
    "2026-11-02T02:00:00Z"
  );

  assert.equal(
    nextDueOf({ resolution_due_at: "2026-11-03T02:00:00Z" }),
    "2026-11-03T02:00:00Z"
  );

  assert.equal(nextDueOf({}), "");
});

test("tiket jatuh tempo dalam 24 jam terdeteksi, yang breach tidak", () => {
  const soon = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

  assert.equal(isDueSoon({ next_due_at: soon }), true);
  assert.equal(
    isDueSoon({ next_due_at: soon, response_breach_at: "2026-11-01T00:00:00Z" }),
    false
  );
  assert.equal(isDueSoon({ next_due_at: "" }), false);
});

test("compareDue mengurutkan yang belum punya tenggat paling akhir", () => {
  const early = { next_due_at: "2026-11-02T01:00:00Z" };
  const late = { next_due_at: "2026-11-02T05:00:00Z" };
  const none = {};

  const sorted = [none, late, early].sort(compareDue);
  assert.deepEqual(sorted, [early, late, none]);
});

test("compareUrgency mendahulukan breach, lalu tenggat, lalu prioritas", () => {
  const breached = { priority: "low", resolution_breach_at: "2026-11-01T00:00:00Z" };
  const dueSoon = { priority: "low", next_due_at: "2026-11-02T01:00:00Z" };
  const dueLater = { priority: "critical", next_due_at: "2026-11-02T05:00:00Z" };
  const sameDueLow = { priority: "low", next_due_at: "2026-11-02T05:00:00Z" };

  const sorted = [dueLater, sameDueLow, dueSoon, breached].sort(compareUrgency);

  assert.deepEqual(sorted, [breached, dueSoon, dueLater, sameDueLow]);
});

test("agregasi unit memakai expand dan mengurutkan terbanyak", () => {
  const rows = groupByUnit([
    { expand: { unit: { name: "IGD" } } },
    { expand: { unit: { name: "IGD" } } },
    { expand: { unit: { name: "Farmasi" } } },
    {},
  ]);

  assert.deepEqual(rows, [
    { name: "IGD", count: 2 },
    { name: "Farmasi", count: 1 },
    { name: "Tanpa unit", count: 1 },
  ]);
});

test("agregasi usia memakai bucket hari", () => {
  const now = Date.now();
  const daysAgo = (days) => new Date(now - days * 86400000).toISOString();

  const buckets = groupByAge([
    { created: daysAgo(0.5) },
    { created: daysAgo(2) },
    { created: daysAgo(5) },
    { created: daysAgo(10) },
  ]);

  assert.deepEqual(
    buckets.map((bucket) => bucket.count),
    [1, 1, 1, 1]
  );

  assert.ok(ageInDays({ created: daysAgo(2) }) >= 1.9);
  assert.equal(ageInDays({}), 0);
});
