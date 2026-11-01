const dateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeZone: "Asia/Jakarta",
});

const dayMonthFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Jakarta",
});

export function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return dateTimeFormatter.format(date);
}

export function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return dateFormatter.format(date);
}

export function formatDayMonth(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return dayMonthFormatter.format(date);
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
