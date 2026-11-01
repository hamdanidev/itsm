import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PageHeader from "../../../components/ui/PageHeader";
import EmptyState from "../../../components/ui/EmptyState";
import { pb } from "../../../lib/pocketbase";
import { escapeFilterValue, getErrorMessage } from "../../../lib/api";
import { formatRelative, initials, isOpen } from "../../../lib/format";
import { useAuth } from "../../../app/providers/AuthProvider";
import { isStaff } from "../../../lib/permissions";
import {
  Priority,
  SlaChip,
  StatusLozenge,
  TypeIcon,
} from "../components/Badges";

const statusTabs = [
  { value: "", label: "Semua" },
  { value: "open", label: "Open" },
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
  { value: "reopened", label: "Reopened" },
];

const priorityOptions = [
  ["", "Semua prioritas"],
  ["critical", "Kritis"],
  ["high", "Tinggi"],
  ["normal", "Normal"],
  ["low", "Rendah"],
];

function TableSkeleton() {
  return (
    <div className="issue-table-wrap">
      <table className="issue-table" aria-hidden="true">
        <thead>
          <tr>
            <th className="col-type" />
            <th className="col-key">Tiket</th>
            <th>Ringkasan</th>
            <th className="col-status">Status</th>
            <th className="col-priority">Prioritas</th>
            <th className="col-assignee">Assignee</th>
            <th className="col-sla">SLA</th>
            <th className="col-created">Dibuat</th>
            <th className="col-action" />
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 6 }).map((_, index) => (
            <tr key={index}>
              <td className="col-type">
                <span className="skeleton" style={{ width: 16, height: 16 }} />
              </td>
              <td className="col-key">
                <span className="skeleton" style={{ width: 92 }} />
              </td>
              <td>
                <span className="skeleton" style={{ width: "70%" }} />
                <span
                  className="skeleton"
                  style={{ width: "35%", marginTop: 8, height: 10 }}
                />
              </td>
              <td className="col-status">
                <span className="skeleton" style={{ width: 64 }} />
              </td>
              <td className="col-priority">
                <span className="skeleton" style={{ width: 54 }} />
              </td>
              <td className="col-assignee">
                <span className="skeleton" style={{ width: 96 }} />
              </td>
              <td className="col-sla">
                <span className="skeleton" style={{ width: 104 }} />
              </td>
              <td className="col-created">
                <span className="skeleton" style={{ width: 64 }} />
              </td>
              <td className="col-action" />
            </tr>
          ))}
        </tbody>
      </table>
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

  useEffect(() => {
    const timer = setTimeout(() => setAppliedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError("");

    const filters = [];
    if (status) filters.push(`status = "${status}"`);
    if (priority) filters.push(`priority = "${priority}"`);

    const term = escapeFilterValue(appliedSearch);
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
        (ticket) => ticket.response_breach_at || ticket.resolution_breach_at
      ).length,
      unassigned: open.filter((ticket) => !ticket.assignee).length,
    };
  }, [tickets]);

  function resetFilters() {
    setStatus("");
    setPriority("");
    setSearch("");
    setAppliedSearch("");
  }

  const filtersActive = Boolean(status || priority || appliedSearch);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Service desk" }, { label: "Tiket" }]}
        title={isStaff(user) ? "Tiket" : "Tiket saya"}
        description={
          isStaff(user)
            ? "Antrean insiden, permintaan layanan, dan perubahan SIMRS."
            : "Status dan riwayat tiket yang Anda laporkan."
        }
      />

      <div className="tabs" role="tablist" aria-label="Filter status">
        {statusTabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={status === tab.value}
            className={`tab${status === tab.value ? " is-active" : ""}`}
            onClick={() => setStatus(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="queue-stats">
        <span className="queue-stat">
          <strong>{stats.open}</strong> tiket aktif
        </span>
        <span className={`queue-stat${stats.critical ? " is-danger" : ""}`}>
          <strong>{stats.critical}</strong> kritis
        </span>
        <span className={`queue-stat${stats.breached ? " is-warning" : ""}`}>
          <strong>{stats.breached}</strong> SLA lewat
        </span>
        <span className="queue-stat">
          <strong>{stats.unassigned}</strong> belum di-assign
        </span>
      </div>

      <div className="list-toolbar">
        <div className="search-box">
          <i className="bi bi-search" aria-hidden="true" />
          <input
            className="input"
            type="search"
            placeholder="Cari nomor tiket atau judul"
            aria-label="Cari tiket"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <select
          className="select toolbar-select"
          aria-label="Filter prioritas"
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
        >
          {priorityOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        {filtersActive && (
          <button
            className="btn btn-subtle btn-sm"
            type="button"
            onClick={resetFilters}
          >
            <i className="bi bi-x-lg" aria-hidden="true" />
            Reset
          </button>
        )}

        <span className="list-count">
          {loading ? "Memuat..." : `${tickets.length} tiket`}
        </span>
      </div>

      {error && (
        <div className="alert alert--error" role="alert">
          <i className="bi bi-exclamation-triangle" aria-hidden="true" />
          <div>
            {error}{" "}
            <button className="btn btn-subtle btn-sm" type="button" onClick={loadTickets}>
              Coba lagi
            </button>
          </div>
        </div>
      )}

      <div className="list-panel">
        {loading ? (
          <TableSkeleton />
        ) : tickets.length === 0 ? (
          <EmptyState
            icon="bi-ticket-detailed"
            title="Belum ada tiket"
            description={
              filtersActive
                ? "Tidak ada tiket yang cocok dengan filter. Ubah filter atau reset untuk melihat semuanya."
                : "Tiket yang Anda buat akan tampil di sini."
            }
            action={
              filtersActive ? (
                <button className="btn btn-outline" type="button" onClick={resetFilters}>
                  Reset filter
                </button>
              ) : (
                <Link className="btn btn-primary" to="/tickets/new">
                  <i className="bi bi-plus-lg" aria-hidden="true" />
                  Buat tiket
                </Link>
              )
            }
          />
        ) : (
          <div className="issue-table-wrap">
            <table className="issue-table">
              <thead>
                <tr>
                  <th className="col-type" aria-label="Jenis" />
                  <th className="col-key">Tiket</th>
                  <th>Ringkasan</th>
                  <th className="col-status">Status</th>
                  <th className="col-priority">Prioritas</th>
                  <th className="col-assignee">Assignee</th>
                  <th className="col-sla">SLA</th>
                  <th className="col-created">Dibuat</th>
                  <th className="col-action" aria-label="Aksi" />
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => {
                  const assignee = ticket.expand?.assignee;

                  return (
                    <tr
                      key={ticket.id}
                      onClick={() => navigate(`/tickets/${ticket.id}`)}
                    >
                      <td className="col-type">
                        <TypeIcon type={ticket.type} />
                      </td>
                      <td className="col-key">
                        <Link
                          className="issue-key"
                          to={`/tickets/${ticket.id}`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          {ticket.ticket_no}
                        </Link>
                      </td>
                      <td>
                        <Link
                          className="issue-key issue-key-inline"
                          to={`/tickets/${ticket.id}`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          {ticket.ticket_no}
                        </Link>
                        <div className="issue-summary" title={ticket.title}>
                          {ticket.title}
                        </div>
                        <div className="issue-meta">
                          {ticket.expand?.unit?.name || "Tanpa unit"}
                          {ticket.expand?.requester?.name
                            ? ` · ${ticket.expand.requester.name}`
                            : ""}
                        </div>
                      </td>
                      <td>
                        <StatusLozenge status={ticket.status} />
                        {ticket.approval_status === "pending" && (
                          <div className="issue-meta is-warning">
                            Menunggu approval
                          </div>
                        )}
                      </td>
                      <td className="col-priority">
                        <Priority priority={ticket.priority} />
                      </td>
                      <td className="col-assignee">
                        {assignee ? (
                          <span className="user-cell">
                            <span className="avatar avatar--sm">
                              {initials(assignee.name)}
                            </span>
                            <span>{assignee.name}</span>
                          </span>
                        ) : (
                          <span className="muted">Belum di-assign</span>
                        )}
                      </td>
                      <td className="col-sla">
                        <div className="sla-stack">
                          <SlaChip
                            label="Respon"
                            dueAt={ticket.response_due_at}
                            breached={ticket.response_breach_at}
                            active={isOpen(ticket)}
                            compact
                          />
                          <SlaChip
                            label="Selesai"
                            dueAt={ticket.resolution_due_at}
                            breached={ticket.resolution_breach_at}
                            active={isOpen(ticket)}
                            compact
                          />
                        </div>
                      </td>
                      <td className="col-created muted nowrap">
                        {formatRelative(ticket.created)}
                      </td>
                      <td className="col-action">
                        <Link
                          className="row-action"
                          to={`/tickets/${ticket.id}`}
                          onClick={(event) => event.stopPropagation()}
                          aria-label={`Buka ${ticket.ticket_no}`}
                        >
                          <i className="bi bi-chevron-right" aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
