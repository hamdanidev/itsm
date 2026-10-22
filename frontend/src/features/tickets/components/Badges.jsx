import {
  formatDateTime,
  priorityClass,
  priorityLabel,
  statusClass,
  statusLabel,
  typeLabel,
} from "../../../lib/format";

export function StatusBadge({ status }) {
  return (
    <span className={`badge itsm-status-badge ${statusClass(status)}`}>
      <span className="itsm-status-dot" />
      {statusLabel(status)}
    </span>
  );
}

export function PriorityBadge({ priority, compact = false }) {
  return (
    <span className={`badge itsm-priority-badge ${priorityClass(priority)}`}>
      {priority === "critical" && <i className="bi bi-exclamation-octagon me-1" />}
      {compact ? priorityLabel(priority) : `Prioritas ${priorityLabel(priority)}`}
    </span>
  );
}

export function TypeBadge({ type }) {
  const icon = {
    incident: "bi-bug",
    service_request: "bi-person-check",
    change_request: "bi-arrow-repeat",
  }[type];

  return (
    <span className="badge itsm-type-badge">
      <i className={`bi ${icon || "bi-ticket"} me-1`} />
      {typeLabel(type)}
    </span>
  );
}

export function SlaPill({ label, dueAt, breached, active = true }) {
  if (!dueAt && !breached) {
    return (
      <span className="sla-pill sla-pill-muted">
        <i className="bi bi-dash-circle me-1" />
        {label}: —
      </span>
    );
  }

  const overdue = breached || (active && dueAt && new Date(dueAt) < new Date());
  const tone = overdue ? "danger" : active ? "ok" : "muted";

  return (
    <span className={`sla-pill sla-pill-${tone}`}>
      <i
        className={`bi ${
          overdue ? "bi-exclamation-triangle" : "bi-clock"
        } me-1`}
      />
      {label}: {formatDateTime(dueAt)}
      {overdue && <span className="ms-1 fw-semibold">(lewat)</span>}
    </span>
  );
}
