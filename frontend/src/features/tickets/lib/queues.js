// Definisi antrean kerja dipakai bersama oleh dashboard dan daftar tiket.
// Semua tanggal memakai field `next_due_at` (SLA gate aktif) yang diisi hook
// tickets.pb.js dan dipindahkan ke resolution/implementasi saat approval.

export const ACTIVE_STATUSES = ["open", "assigned", "in_progress", "reopened"];

// Filter PocketBase untuk tiket yang masih butuh pekerjaan (resolved belum
// ditutup, closed selesai).
export const ACTIVE_FILTER = 'status != "closed" && status != "resolved"';

const PRIORITY_RANK = { critical: 0, high: 1, normal: 2, low: 3 };

export function isActive(ticket) {
  return Boolean(ticket) && ACTIVE_STATUSES.indexOf(ticket.status) >= 0;
}

export function isBreached(ticket) {
  return Boolean(
    ticket &&
      (ticket.response_breach_at ||
        ticket.approval_breach_at ||
        ticket.resolution_breach_at)
  );
}

export function nextDueOf(ticket) {
  return (
    ticket?.next_due_at ||
    ticket?.resolution_due_at ||
    ticket?.approval_due_at ||
    ticket?.response_due_at ||
    ""
  );
}

export function priorityRank(priority) {
  const rank = PRIORITY_RANK[priority];
  return rank == null ? 2 : rank;
}

export function isDueSoon(ticket, hours = 24) {
  if (!ticket || isBreached(ticket)) return false;
  const due = nextDueOf(ticket);
  if (!due) return false;
  const dueMs = new Date(due).getTime();
  if (Number.isNaN(dueMs)) return false;
  const now = Date.now();
  return dueMs >= now && dueMs - now <= hours * 60 * 60 * 1000;
}

export function compareDue(a, b) {
  const left = nextDueOf(a);
  const right = nextDueOf(b);
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return new Date(left).getTime() - new Date(right).getTime();
}

// Paling mendesak lebih dulu: yang sudah breach, lalu tenggat terdekat,
// lalu prioritas.
export function compareUrgency(a, b) {
  const breach = Number(isBreached(b)) - Number(isBreached(a));
  if (breach !== 0) return breach;

  const due = compareDue(a, b);
  if (due !== 0) return due;

  return priorityRank(a.priority) - priorityRank(b.priority);
}

export function ageInDays(ticket) {
  const created = new Date(ticket?.created || 0).getTime();
  if (!created) return 0;
  return Math.max(0, (Date.now() - created) / (24 * 60 * 60 * 1000));
}

export function groupByUnit(tickets) {
  const counts = new Map();

  for (const ticket of tickets) {
    const name = ticket.expand?.unit?.name || "Tanpa unit";
    counts.set(name, (counts.get(name) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

const AGE_BUCKETS = [
  { label: "< 1 hari", max: 1 },
  { label: "1–3 hari", max: 3 },
  { label: "3–7 hari", max: 7 },
  { label: "> 7 hari", max: Infinity },
];

export function groupByAge(tickets) {
  const buckets = AGE_BUCKETS.map((bucket) => ({ ...bucket, count: 0 }));

  for (const ticket of tickets) {
    const age = ageInDays(ticket);
    const index = buckets.findIndex((bucket) => age < bucket.max);
    buckets[index === -1 ? buckets.length - 1 : index].count += 1;
  }

  return buckets;
}
