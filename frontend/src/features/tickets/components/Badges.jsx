import {
  formatDateTime,
  formatDayMonth,
  priorityLabel,
  statusLabel,
} from "../../../lib/format";

const TYPES = {
  incident: { icon: "bi-bug-fill", label: "Incident" },
  service_request: { icon: "bi-headset", label: "Service Request" },
  change_request: { icon: "bi-arrow-repeat", label: "Change Request" },
};

const PRIORITY_ICONS = {
  critical: "bi-chevron-double-up",
  high: "bi-chevron-up",
  normal: "bi-dash-lg",
  low: "bi-chevron-down",
};

const APPROVAL_LABELS = {
  not_required: "Tidak perlu",
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
};

const APPROVAL_TONES = {
  not_required: "lozenge--neutral",
  pending: "status-in_progress",
  approved: "status-resolved",
  rejected: "status-reopened",
};

export function TypeIcon({ type, large = false }) {
  const meta = TYPES[type] || { icon: "bi-ticket", label: "Tiket" };

  return (
    <span
      className={`type-tile type-${type}${large ? " type-tile--lg" : ""}`}
      title={meta.label}
      aria-label={meta.label}
    >
      <i className={`bi ${meta.icon}`} aria-hidden="true" />
    </span>
  );
}

export function StatusLozenge({ status }) {
  return (
    <span className={`lozenge status-${status || "open"}`}>
      {statusLabel(status)}
    </span>
  );
}

export function Priority({ priority, showLabel = true }) {
  const value = priority || "normal";

  return (
    <span
      className={`priority priority--${value}`}
      title={`Prioritas ${priorityLabel(value)}`}
    >
      <i
        className={`bi ${PRIORITY_ICONS[value] || "bi-dash-lg"}`}
        aria-hidden="true"
      />
      {showLabel && <span>{priorityLabel(value)}</span>}
    </span>
  );
}

export function ApprovalLozenge({ status }) {
  return (
    <span
      className={`lozenge ${APPROVAL_TONES[status] || "lozenge--neutral"}`}
    >
      {APPROVAL_LABELS[status] || "—"}
    </span>
  );
}

export function SlaChip({
  label,
  dueAt,
  breached,
  active = true,
  compact = false,
  paused = false,
}) {
  if (paused) {
    return (
      <span
        className="sla is-paused"
        title={`${label}: dijeda selama tiket menunggu requester`}
      >
        <i className="bi bi-pause-circle" aria-hidden="true" />
        {label}: dijeda
      </span>
    );
  }

  if (!dueAt && !breached) {
    return (
      <span className="sla is-muted">
        <i className="bi bi-dash-circle" aria-hidden="true" />
        {label}: —
      </span>
    );
  }

  const overdue =
    Boolean(breached) || (active && dueAt && new Date(dueAt) < new Date());
  const tone = overdue ? " is-late" : active ? " is-ok" : "";
  const display = compact ? formatDayMonth(dueAt) : formatDateTime(dueAt);

  return (
    <span
      className={`sla${tone}`}
      title={`${label}: ${formatDateTime(dueAt)}${overdue ? " (lewat)" : ""}`}
    >
      <i
        className={`bi ${overdue ? "bi-exclamation-triangle" : "bi-clock"}`}
        aria-hidden="true"
      />
      {label} {compact ? display : `: ${display}`}
      {overdue && !compact && <span className="sla-flag">lewat</span>}
    </span>
  );
}
