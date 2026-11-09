// Format tanggal/angka di UI.
//
// Zona waktu dan locale berasal dari rumah sakit yang sedang dilihat, bukan
// dari perangkat pengguna: staf yang login dari luar negeri tetap membaca jam
// dinding rumah sakitnya. `configureFormatting()` dipanggil TenantProvider
// setiap kali tenant aktif berubah, dan halaman publik memanggilnya dari
// payload branding.
//
// Bahasa masih `id-ID` (P1 i18n); yang diperbaiki di sini adalah kebenaran
// waktu.

const DEFAULT_TIME_ZONE = "Asia/Jakarta";
const DEFAULT_LOCALE = "id-ID";

let currentTimeZone = DEFAULT_TIME_ZONE;
let currentLocale = DEFAULT_LOCALE;
let formatters = null;

function safeTimeZone(value) {
  const zone = String(value || "").trim();
  if (!zone) return DEFAULT_TIME_ZONE;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date());
    return zone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

function getFormatters() {
  if (formatters) return formatters;

  const timeZone = currentTimeZone;
  const options = { timeZone };

  formatters = {
    dateTime: new Intl.DateTimeFormat(currentLocale, {
      dateStyle: "medium",
      timeStyle: "short",
      ...options,
    }),
    date: new Intl.DateTimeFormat(currentLocale, {
      dateStyle: "medium",
      ...options,
    }),
    dayMonth: new Intl.DateTimeFormat(currentLocale, {
      day: "numeric",
      month: "short",
      ...options,
    }),
    time: new Intl.DateTimeFormat(currentLocale, {
      hour: "2-digit",
      minute: "2-digit",
      ...options,
    }),
  };

  return formatters;
}

export function configureFormatting({ timeZone, locale } = {}) {
  const nextZone = safeTimeZone(timeZone);
  const nextLocale = String(locale || "").trim() || DEFAULT_LOCALE;

  if (nextZone === currentTimeZone && nextLocale === currentLocale) return;

  currentTimeZone = nextZone;
  currentLocale = nextLocale;
  formatters = null;
}

export function getFormatTimeZone() {
  return currentTimeZone;
}

export function getFormatLocale() {
  return currentLocale;
}

export function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return getFormatters().dateTime.format(date);
}

export function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return getFormatters().date.format(date);
}

export function formatDayMonth(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return getFormatters().dayMonth.format(date);
}

export function formatTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return getFormatters().time.format(date);
}

export function formatRelative(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60000);

  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days} hari lalu`;

  return formatDate(value);
}

export function isOpen(ticket) {
  return ticket && !["resolved", "closed"].includes(ticket.status);
}

export function statusLabel(status) {
  return {
    open: "Open",
    assigned: "Assigned",
    in_progress: "In Progress",
    waiting: "Menunggu",
    resolved: "Resolved",
    closed: "Closed",
    reopened: "Reopened",
  }[status] || status || "—";
}

export function priorityLabel(priority) {
  return {
    critical: "Kritis",
    high: "Tinggi",
    normal: "Normal",
    low: "Rendah",
  }[priority] || priority || "—";
}

export function typeLabel(type) {
  return {
    incident: "Incident",
    service_request: "Service Request",
    change_request: "Change Request",
  }[type] || type || "—";
}

export function impactLabel(impact) {
  return {
    patient_safety: "Keselamatan pasien",
    clinical_workflow: "Alur kerja klinis",
    operational: "Operasional",
    convenience: "Kenyamanan",
  }[impact] || impact || "—";
}

export function approvalLabel(status) {
  return {
    not_required: "Tidak perlu approval",
    pending: "Menunggu approval",
    approved: "Disetujui",
    rejected: "Ditolak",
  }[status] || status || "—";
}

export function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}
