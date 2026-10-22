import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PageHeader from "../../../components/ui/PageHeader";
import EmptyState from "../../../components/ui/EmptyState";
import { pb } from "../../../lib/pocketbase";
import { escapeFilterValue, getErrorMessage } from "../../../lib/api";
import {
  formatDateTime,
  isOpen,
  typeLabel,
} from "../../../lib/format";
import { useAuth } from "../../../app/providers/AuthProvider";
import { isStaff } from "../../../lib/permissions";
import {
  PriorityBadge,
  SlaPill,
  StatusBadge,
  TypeBadge,
} from "../components/Badges";

const statusOptions = [
  ["", "Semua status"],
  ["open", "Open"],
  ["assigned", "Assigned"],
  ["in_progress", "In Progress"],
  ["resolved", "Resolved"],
  ["closed", "Closed"],
  ["reopened", "Reopened"],
];

const priorityOptions = [
  ["", "Semua prioritas"],
  ["critical", "Kritis"],
  ["high", "Tinggi"],
  ["normal", "Normal"],
  ["low", "Rendah"],
];

function StatCard({ icon, label, value, tone = "primary", hint }) {
  return (
    <div className="col-6 col-xl-3">
      <div className="card stat-card h-100 border-0">
        <div className="card-body d-flex gap-3 align-items-start">
          <div className={`stat-icon stat-icon-${tone}`}>
            <i className={`bi ${icon}`} />
          </div>
          <div>
            <div className="stat-value">{value}</div>
            <div className="stat-label">{label}</div>
            {hint && <div className="stat-hint">{hint}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TicketListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError("");

    const filters = [];
    if (status) filters.push(`status = "${status}"`);
    if (priority) filters.push(`priority = "${priority}"`);

    const term = escapeFilterValue(appliedSearch.trim());
    if (term) {
      filters.push(`(ticket_no ~ "${term}" || title ~ "${term}")`);
    }

    try {
      const result = await pb.collection("tickets").getList(1, 100, {
        filter: filters.join(" && "),
        sort: "-created",
        expand: "requester,assignee,unit",
      });
      setTickets(result.items);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [status, priority, appliedSearch]);

  useEffect(() => {
    document.title = "Tiket · Healthcare ITSM";
    loadTickets();
  }, [loadTickets]);

  const stats = useMemo(() => {
    const open = tickets.filter(isOpen);
    return {
      open: open.length,
      critical: open.filter((ticket) => ticket.priority === "critical").length,
      breached: open.filter(
        (ticket) =>
          ticket.response_breach_at || ticket.resolution_breach_at
      ).length,
      unassigned: open.filter((ticket) => !ticket.assignee).length,
    };
  }, [tickets]);

  function handleFilterSubmit(event) {
    event.preventDefault();
    setAppliedSearch(search);
  }

  function resetFilters() {
    setStatus("");
    setPriority("");
    setSearch("");
    setAppliedSearch("");
  }

  return (
    <>
      <PageHeader
        eyebrow="Service desk"
        title={isStaff(user) ? "Semua tiket" : "Tiket saya"}
        description={
          isStaff(user)
            ? "Pantau antrean insiden, permintaan layanan, dan perubahan SIMRS."
            : "Lihat status dan riwayat tiket yang Anda laporkan."
        }
        actions={
          <Link className="btn btn-primary" to="/tickets/new">
            <i className="bi bi-plus-lg me-2" />
            Buat tiket
          </Link>
        }
      />

      <div className="row g-3 mb-4">
        <StatCard
          icon="bi-inbox"
          label="Tiket aktif"
          value={stats.open}
          tone="primary"
          hint="Belum resolved/closed"
        />
        <StatCard
          icon="bi-exclamation-octagon"
          label="Kritis aktif"
          value={stats.critical}
          tone="danger"
          hint="Perlu perhatian"
        />
        <StatCard
          icon="bi-stopwatch"
          label="SLA lewat"
          value={stats.breached}
          tone="warning"
          hint="Response atau resolution"
        />
        <StatCard
          icon="bi-person-dash"
          label="Belum di-assign"
          value={stats.unassigned}
          tone="info"
          hint="Menunggu triage"
        />
      </div>

      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body">
          <form
            className="row g-2 align-items-end"
            onSubmit={handleFilterSubmit}
          >
            <div className="col-12 col-lg-5">
              <label className="form-label small fw-semibold" htmlFor="search">
                Cari tiket
              </label>
              <div className="input-group">
                <span className="input-group-text bg-white">
                  <i className="bi bi-search text-secondary" />
                </span>
                <input
                  id="search"
                  className="form-control"
                  placeholder="Nomor tiket atau judul..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>
            <div className="col-6 col-lg-2">
              <label className="form-label small fw-semibold" htmlFor="status">
                Status
              </label>
              <select
                id="status"
                className="form-select"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                {statusOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-6 col-lg-2">
              <label className="form-label small fw-semibold" htmlFor="priority">
                Prioritas
              </label>
              <select
                id="priority"
                className="form-select"
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
              >
                {priorityOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-12 col-lg-3 d-flex gap-2">
              <button className="btn btn-dark flex-grow-1" type="submit">
                <i className="bi bi-funnel me-1" />
                Terapkan
              </button>
              <button
                className="btn btn-outline-secondary"
                type="button"
                onClick={resetFilters}
                title="Reset filter"
              >
                <i className="bi bi-arrow-counterclockwise" />
              </button>
            </div>
          </form>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger d-flex gap-2">
          <i className="bi bi-exclamation-triangle-fill" />
          <div>{error}</div>
        </div>
      )}

      <div className="card border-0 shadow-sm overflow-hidden">
        <div className="card-header bg-white border-0 py-3 d-flex justify-content-between align-items-center">
          <div className="fw-semibold">
            <i className="bi bi-list-ul me-2 text-primary" />
            Daftar tiket
          </div>
          <span className="text-secondary small">
            {loading ? "Memuat..." : `${tickets.length} tiket`}
          </span>
        </div>

        {loading ? (
          <div className="p-5 text-center">
            <div className="spinner-border text-primary" role="status" />
            <div className="small text-secondary mt-2">Memuat tiket...</div>
          </div>
        ) : tickets.length === 0 ? (
          <EmptyState
            icon="bi-ticket-detailed"
            title="Belum ada tiket"
            description={
              appliedSearch || status || priority
                ? "Tidak ada tiket yang cocok dengan filter. Coba ubah filter atau reset."
                : "Tiket yang Anda buat akan tampil di sini."
            }
            action={
              <Link className="btn btn-primary" to="/tickets/new">
                <i className="bi bi-plus-lg me-2" />
                Buat tiket pertama
              </Link>
            }
          />
        ) : (
          <div className="table-responsive">
            <table className="table app-table align-middle mb-0">
              <thead>
                <tr>
                  <th>Tiket</th>
                  <th>Klasifikasi</th>
                  <th>Status</th>
                  <th>Unit</th>
                  <th>Assignee</th>
                  <th>SLA</th>
                  <th>Dibuat</th>
                  <th aria-label="Aksi" />
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    className="app-table-row"
                    onClick={() => navigate(`/tickets/${ticket.id}`)}
                  >
                    <td>
                      <Link
                        className="ticket-no"
                        to={`/tickets/${ticket.id}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {ticket.ticket_no}
                      </Link>
                      <div className="ticket-title">{ticket.title}</div>
                      <div className="small text-secondary d-lg-none">
                        {typeLabel(ticket.type)}
                      </div>
                    </td>
                    <td>
                      <div className="d-flex flex-column gap-1 align-items-start">
                        <TypeBadge type={ticket.type} />
                        <PriorityBadge priority={ticket.priority} compact />
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={ticket.status} />
                      {ticket.approval_status === "pending" && (
                        <div className="small text-warning-emphasis mt-1">
                          <i className="bi bi-hourglass-split me-1" />
                          Menunggu approval
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="small fw-medium">
                        {ticket.expand?.unit?.name || "—"}
                      </div>
                      <div className="small text-secondary">
                        {ticket.expand?.requester?.name || "—"}
                      </div>
                    </td>
                    <td>
                      {ticket.expand?.assignee?.name ? (
                        <div className="small">
                          <i className="bi bi-person-check me-1 text-success" />
                          {ticket.expand.assignee.name}
                        </div>
                      ) : (
                        <span className="small text-secondary">Belum</span>
                      )}
                    </td>
                    <td>
                      <div className="d-flex flex-column gap-1">
                        <SlaPill
                          label="Respon"
                          dueAt={ticket.response_due_at}
                          breached={ticket.response_breach_at}
                          active={isOpen(ticket)}
                        />
                        <SlaPill
                          label="Selesai"
                          dueAt={ticket.resolution_due_at}
                          breached={ticket.resolution_breach_at}
                          active={isOpen(ticket)}
                        />
                      </div>
                    </td>
                    <td>
                      <div className="small">{formatDateTime(ticket.created)}</div>
                    </td>
                    <td className="text-end">
                      <Link
                        className="btn btn-sm btn-outline-secondary"
                        to={`/tickets/${ticket.id}`}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`Buka ${ticket.ticket_no}`}
                      >
                        <i className="bi bi-chevron-right" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
