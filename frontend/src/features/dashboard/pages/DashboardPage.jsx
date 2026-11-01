import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../../../components/ui/PageHeader";
import EmptyState from "../../../components/ui/EmptyState";
import { pb } from "../../../lib/pocketbase";
import { getErrorMessage } from "../../../lib/api";
import {
  formatDateTime,
  formatDayMonth,
  initials,
} from "../../../lib/format";
import { useAuth } from "../../../app/providers/AuthProvider";
import { isLead, roleLabel } from "../../../lib/permissions";
import {
  Priority,
  StatusLozenge,
  TypeIcon,
} from "../../tickets/components/Badges";
import {
  ACTIVE_FILTER,
  compareUrgency,
  groupByAge,
  groupByUnit,
  isActive,
  isBreached,
  isDueSoon,
  isWorking,
  nextDueOf,
} from "../../tickets/lib/queues";

const TICKET_FIELDS = [
  "id",
  "ticket_no",
  "title",
  "type",
  "status",
  "priority",
  "approval_status",
  "assignee",
  "created",
  "resolved_at",
  "next_due_at",
  "response_due_at",
  "approval_due_at",
  "resolution_due_at",
  "response_breach_at",
  "approval_breach_at",
  "resolution_breach_at",
  "expand.assignee.id",
  "expand.assignee.name",
  "expand.unit.name",
].join(",");

function DashboardSkeleton() {
  return (
    <>
      <div className="kpi-grid" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="kpi-card" key={index}>
            <span className="skeleton" style={{ width: "40%", height: 10 }} />
            <span
              className="skeleton"
              style={{ width: 56, height: 28, marginTop: 12 }}
            />
            <span
              className="skeleton"
              style={{ width: "65%", height: 10, marginTop: 12 }}
            />
          </div>
        ))}
      </div>

      <div className="dash-grid" aria-hidden="true">
        {[0, 1].map((panel) => (
          <section className="panel" key={panel}>
            <div className="panel-head">
              <span className="skeleton" style={{ width: 140, height: 12 }} />
            </div>
            <div className="panel-body">
              {Array.from({ length: 4 }).map((_, index) => (
                <div className="queue-row-skeleton" key={index}>
                  <span className="skeleton" style={{ width: 90 }} />
                  <span className="skeleton" style={{ width: "55%" }} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function KpiCard({ to, icon, label, value, hint, tone = "" }) {
  return (
    <Link className={`kpi-card${tone ? ` is-${tone}` : ""}`} to={to}>
      <span className="kpi-head">
        <i className={`bi ${icon}`} aria-hidden="true" />
        {label}
      </span>
      <span className="kpi-value">{value}</span>
      <span className="kpi-hint">{hint}</span>
    </Link>
  );
}

function SlaBadge({ ticket }) {
  if (isBreached(ticket)) {
    return <span className="lozenge status-reopened">SLA lewat</span>;
  }
  if (isDueSoon(ticket)) {
    return <span className="lozenge status-in_progress">≤ 24 jam</span>;
  }

  const due = nextDueOf(ticket);
  if (!due) return <span className="queue-due is-muted">—</span>;

  return (
    <span className="queue-due" title={formatDateTime(due)}>
      {formatDayMonth(due)}
    </span>
  );
}

function QueueItem({ ticket, showAssignee = false }) {
  const unit = ticket.expand?.unit?.name;
  const assignee = ticket.expand?.assignee;

  return (
    <li>
      <Link className="queue-row" to={`/tickets/${ticket.id}`}>
        <TypeIcon type={ticket.type} />
        <span className="queue-row-main">
          <span className="queue-row-title">
            <span className="queue-row-key">{ticket.ticket_no}</span>
            <span className="queue-row-text">{ticket.title}</span>
          </span>
          <span className="queue-row-meta">
            <StatusLozenge status={ticket.status} />
            <Priority priority={ticket.priority} showLabel={false} />
            <span>{unit || "Tanpa unit"}</span>
            {ticket.approval_status === "pending" && (
              <span className="queue-flag">Butuh approval</span>
            )}
            {Number(ticket.escalation_level) >= 2 && (
              <span className="queue-flag is-danger">
                Eskalasi L{ticket.escalation_level}
              </span>
            )}
            {showAssignee && (
              <span className="queue-assignee">
                {assignee ? (
                  <>
                    <span className="avatar avatar--sm">
                      {initials(assignee.name)}
                    </span>
                    {assignee.name}
                  </>
                ) : (
                  "Belum di-assign"
                )}
              </span>
            )}
          </span>
        </span>
        <SlaBadge ticket={ticket} />
      </Link>
    </li>
  );
}

function QueuePanel({ title, icon, tickets, empty, to, showAssignee }) {
  return (
    <section className="panel dash-panel">
      <div className="panel-head">
        <span className="panel-title">
          <i className={`bi ${icon}`} aria-hidden="true" />
          {title}
          <span className="panel-count">{tickets.length}</span>
        </span>
        {to && (
          <Link className="panel-link" to={to}>
            Lihat semua
          </Link>
        )}
      </div>
      {tickets.length === 0 ? (
        <div className="queue-empty">
          <i className="bi bi-check2-circle" aria-hidden="true" />
          <span>{empty}</span>
        </div>
      ) : (
        <ul className="queue-list">
          {tickets.map((ticket) => (
            <QueueItem
              key={ticket.id}
              ticket={ticket}
              showAssignee={showAssignee}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function BarList({ items, total, empty }) {
  if (items.length === 0) {
    return <p className="dash-note">{empty}</p>;
  }

  const max = Math.max(...items.map((item) => item.count), 1);

  return (
    <ul className="bar-list">
      {items.map((item) => (
        <li className="bar-row" key={item.name}>
          <span className="bar-label" title={item.name}>
            {item.name}
          </span>
          <span className="bar-track">
            <span
              className="bar-fill"
              style={{ width: `${Math.round((item.count / max) * 100)}%` }}
            />
          </span>
          <span className="bar-value">
            {item.count}
            <span className="bar-share">
              {total ? `${Math.round((item.count / total) * 100)}%` : "0%"}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [resolvedCount, setResolvedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      // Hanya tiket aktif yang diambil penuh; tiket resolved bisa menumpuk
      // bertahun-tahun sehingga cukup dihitung lewat totalItems.
      const [records, resolved] = await Promise.all([
        pb.collection("tickets").getFullList({
          filter: ACTIVE_FILTER,
          sort: "-created",
          expand: "assignee,unit",
          fields: TICKET_FIELDS,
        }),
        pb
          .collection("tickets")
          .getList(1, 1, { filter: 'status = "resolved"', fields: "id" })
          .then((result) => result.totalItems)
          .catch(() => 0),
      ]);

      setTickets(records);
      setResolvedCount(resolved);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = "Ringkasan · Healthcare ITSM";
    load();
  }, [load]);

  const model = useMemo(() => {
    const active = tickets.filter(isActive);
    const working = active.filter(isWorking);
    const waiting = active.filter((ticket) => ticket.status === "waiting");
    const mine = working
      .filter((ticket) => ticket.assignee === user?.id)
      .sort(compareUrgency)
      .slice(0, 6);
    const unassigned = working
      .filter((ticket) => !ticket.assignee)
      .sort(compareUrgency)
      .slice(0, 6);
    const attention = working
      .filter((ticket) => isBreached(ticket) || isDueSoon(ticket))
      .sort(compareUrgency)
      .slice(0, 6);
    return {
      active,
      working,
      waiting,
      mine,
      unassigned,
      attention,
      counts: {
        active: active.length,
        critical: working.filter((ticket) => ticket.priority === "critical")
          .length,
        breached: working.filter(isBreached).length,
        unassigned: working.filter((ticket) => !ticket.assignee).length,
        waiting: waiting.length,
        escalation: active.filter(
          (ticket) => Number(ticket.escalation_level) >= 2
        ).length,
        waitingApproval: working.filter(
          (ticket) => ticket.approval_status === "pending"
        ).length,
        waitingClose: resolvedCount,
      },
    };
  }, [tickets, resolvedCount, user?.id]);

  const units = useMemo(
    () => groupByUnit(model.active).slice(0, 6),
    [model.active]
  );
  const ages = useMemo(() => groupByAge(model.active), [model.active]);
  const unitTotal = model.active.length;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Service desk" }, { label: "Ringkasan" }]}
        title={`Selamat bekerja, ${
          String(user?.name || "").split(" ")[0] || "Tim"
        }`}
        description={`Antrean ${roleLabel(
          user
        )} pada tenant ini. Angka dihitung dari tiket yang belum ditutup.`}
      />

      {error && (
        <div className="alert alert--error" role="alert">
          <i className="bi bi-exclamation-triangle" aria-hidden="true" />
          <div>
            {error}{" "}
            <button className="btn btn-subtle btn-sm" type="button" onClick={load}>
              Coba lagi
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="kpi-grid">
            <KpiCard
              to="/tickets?scope=active"
              icon="bi-collection"
              label="Tiket aktif"
              value={model.counts.active}
              hint={
                [
                  model.counts.waitingClose
                    ? `${model.counts.waitingClose} menunggu ditutup`
                    : "",
                  model.counts.waiting
                    ? `${model.counts.waiting} menunggu requester`
                    : "",
                ]
                  .filter(Boolean)
                  .join(" · ") || "Tidak ada yang menunggu"
              }
            />
            <KpiCard
              to="/tickets?scope=active&priority=critical"
              icon="bi-chevron-double-up"
              label="Kritis"
              value={model.counts.critical}
              hint={
                model.counts.critical
                  ? "Prioritas patient safety"
                  : "Tidak ada tiket kritis"
              }
              tone={model.counts.critical ? "danger" : ""}
            />
            <KpiCard
              to="/tickets?scope=active&sla=breached"
              icon="bi-exclamation-triangle"
              label="SLA lewat"
              value={model.counts.breached}
              hint={
                model.counts.breached
                  ? "Perlu eskalasi ke IT Lead"
                  : "Tidak ada SLA yang lewat"
              }
              tone={model.counts.breached ? "warning" : ""}
            />
            <KpiCard
              to="/tickets?scope=active&assignee=unassigned"
              icon="bi-person-dash"
              label="Belum di-assign"
              value={model.counts.unassigned}
              hint="Ambil dari antrean"
            />
            <KpiCard
              to="/tickets?scope=active&approval=pending"
              icon="bi-patch-check"
              label="Menunggu approval"
              value={model.counts.waitingApproval}
              hint={isLead(user) ? "Menunggu keputusan Anda" : "Menunggu IT Lead"}
            />
          </div>

          <div className="dash-grid">
            <QueuePanel
              title="Antrean saya"
              icon="bi-person-check"
              tickets={model.mine}
              empty="Tidak ada tiket yang ditugaskan ke Anda."
              to="/tickets?scope=active&assignee=mine"
            />
            <QueuePanel
              title="Belum di-assign"
              icon="bi-inbox"
              tickets={model.unassigned}
              empty="Semua tiket aktif sudah punya penanggung jawab."
              to="/tickets?scope=active&assignee=unassigned"
            />
          </div>

          <QueuePanel
            title="Perlu perhatian"
            icon="bi-alarm"
            tickets={model.attention}
            empty="Tidak ada tiket yang breach atau jatuh tempo dalam 24 jam."
            to="/tickets?scope=active&sort=due"
            showAssignee
          />

          <div className="dash-grid">
            <section className="panel">
              <div className="panel-head">
                <span className="panel-title">
                  <i className="bi bi-diagram-3" aria-hidden="true" />
                  Beban per unit
                  <span className="panel-count">{unitTotal} tiket aktif</span>
                </span>
              </div>
              <div className="panel-body">
                <BarList
                  items={units}
                  total={unitTotal}
                  empty="Belum ada tiket aktif."
                />
                {unitTotal > 0 && units.length === 6 && (
                  <p className="dash-note">Menampilkan 6 unit dengan tiket terbanyak.</p>
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <span className="panel-title">
                  <i className="bi bi-hourglass-split" aria-hidden="true" />
                  Usia tiket aktif
                </span>
              </div>
              <div className="panel-body">
                <BarList
                  items={ages.map((bucket) => ({
                    name: bucket.label,
                    count: bucket.count,
                  }))}
                  total={unitTotal}
                  empty="Belum ada tiket aktif."
                />
                <p className="dash-note">
                  Dihitung dari waktu dibuat; tiket yang lebih tua menandakan
                  antrean perlu ditambah.
                </p>
              </div>
            </section>
          </div>

          {tickets.length === 0 && resolvedCount === 0 && (
            <EmptyState
              icon="bi-check2-circle"
              title="Semua bersih"
              description="Tidak ada tiket aktif saat ini. Tiket baru akan muncul di sini."
              action={
                <Link className="btn btn-primary" to="/tickets/new">
                  <i className="bi bi-plus-lg" aria-hidden="true" />
                  Buat tiket
                </Link>
              }
            />
          )}
        </>
      )}
    </>
  );
}
