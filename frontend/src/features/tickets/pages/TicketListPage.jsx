import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import PageHeader from "../../../components/ui/PageHeader";
import EmptyState from "../../../components/ui/EmptyState";
import { pb } from "../../../lib/pocketbase";
import { escapeFilterValue, getErrorMessage } from "../../../lib/api";
import { formatRelative, initials, isOpen } from "../../../lib/format";
import { useAuth } from "../../../app/providers/AuthProvider";
import { isStaff } from "../../../lib/permissions";
import { ACTIVE_FILTER } from "../lib/queues";
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
  { value: "waiting", label: "Menunggu" },
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

const assigneeOptions = [
  ["", "Semua assignee"],
  ["mine", "Tiket saya"],
  ["unassigned", "Belum di-assign"],
];

const sortOptions = [
  ["created", "Terbaru"],
  ["updated", "Terakhir diperbarui"],
  ["due", "SLA terdekat"],
  ["created_asc", "Terlama"],
];

const sortMap = {
  created: "-created",
  updated: "-last_activity_at",
  due: "next_due_at",
  created_asc: "created",
};

const pageSizes = [25, 50, 100];

function TableSkeleton({ rows = 6 }) {
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
          {Array.from({ length: rows }).map((_, index) => (
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

function FilterChip({ label, onRemove }) {
  return (
    <span className="filter-chip">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Hapus filter ${label}`}
      >
        <i className="bi bi-x" aria-hidden="true" />
      </button>
    </span>
  );
}

export default function TicketListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const status = params.get("status") || "";
  const priority = params.get("priority") || "";
  const assignee = params.get("assignee") || "";
  const sla = params.get("sla") || "";
  const approval = params.get("approval") || "";
  const scope = params.get("scope") || "";
  const sortKey = sortMap[params.get("sort")] ? params.get("sort") : "created";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const q = params.get("q") || "";

  const [search, setSearch] = useState(q);
  const [perPage, setPerPage] = useState(25);
  const [tickets, setTickets] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Tiket · Healthcare ITSM";
  }, []);

  const updateParams = useCallback(
    (patch) => {
      const next = new URLSearchParams(params);

      for (const [key, value] of Object.entries(patch)) {
        if (value === "" || value === null || value === undefined) {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
      }

      next.delete("page");
      setParams(next, { replace: true });
    },
    [params, setParams]
  );

  // Pencarian di-debounce agar tidak memicu request per ketikan. Blur dan
  // Enter tetap langsung menerapkan nilai terakhir.
  useEffect(() => {
    const term = search.trim();
    if (term === q) return undefined;

    const timer = setTimeout(() => updateParams({ q: term }), 350);
    return () => clearTimeout(timer);
  }, [q, search, updateParams]);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError("");

    const filters = [];

    if (scope === "active") filters.push(ACTIVE_FILTER);
    if (status) filters.push(`status = "${status}"`);
    if (priority) filters.push(`priority = "${priority}"`);
    if (approval) filters.push(`approval_status = "${approval}"`);

    if (assignee === "mine" && user?.id) {
      filters.push(`assignee = "${user.id}"`);
    } else if (assignee === "unassigned") {
      filters.push('assignee = ""');
    }

    if (sla === "breached") {
      filters.push(
        '(response_breach_at != "" || approval_breach_at != "" || resolution_breach_at != "")'
      );
    }

    const term = escapeFilterValue(q);
    if (term) {
      filters.push(`(ticket_no ~ "${term}" || title ~ "${term}")`);
    }

    try {
      const result = await pb.collection("tickets").getList(page, perPage, {
        filter: filters.join(" && "),
        sort: sortMap[sortKey] || "-created",
        expand: "requester,assignee,unit",
      });

      setTickets(result.items);
      setTotal(result.totalItems);
      setTotalPages(result.totalPages);
    } catch (err) {
      setError(getErrorMessage(err));
      setTickets([]);
      setTotal(0);
      setTotalPages(0);
    } finally {
      setLoading(false);
    }
  }, [
    approval,
    assignee,
    page,
    perPage,
    priority,
    q,
    scope,
    sla,
    sortKey,
    status,
    user?.id,
  ]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  // Filter yang berubah lewat kontrol mana pun harus kembali ke halaman 1.
  function apply(patch) {
    updateParams(patch);
  }

  function toggleSla() {
    apply({ sla: sla === "breached" ? "" : "breached" });
  }

  function resetFilters() {
    setSearch("");
    setParams({}, { replace: true });
  }

  function goToPage(nextPage) {
    const next = new URLSearchParams(params);
    next.set("page", String(nextPage));
    setParams(next, { replace: true });
  }

  function changePageSize(value) {
    setPerPage(value);
    goToPage(1);
  }

  const filtersActive = Boolean(
    status || priority || assignee || sla || approval || scope || q
  );

  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  const chips = useMemo(() => {
    const items = [];

    if (scope === "active") {
      items.push({ key: "scope", label: "Tiket aktif" });
    }
    if (assignee === "mine") items.push({ key: "assignee", label: "Tiket saya" });
    if (assignee === "unassigned") {
      items.push({ key: "assignee", label: "Belum di-assign" });
    }
    if (sla === "breached") items.push({ key: "sla", label: "SLA lewat" });
    if (approval === "pending") {
      items.push({ key: "approval", label: "Menunggu approval" });
    }

    return items;
  }, [scope, assignee, sla, approval]);

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
            onClick={() => apply({ status: tab.value })}
          >
            {tab.label}
          </button>
        ))}
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
            onBlur={() => {
              const term = search.trim();
              if (term !== q) updateParams({ q: term });
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              const term = search.trim();
              if (term !== q) updateParams({ q: term });
            }}
          />
        </div>

        <select
          className="select toolbar-select"
          aria-label="Filter prioritas"
          value={priority}
          onChange={(event) => apply({ priority: event.target.value })}
        >
          {priorityOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        {isStaff(user) && (
          <select
            className="select toolbar-select"
            aria-label="Filter assignee"
            value={assignee}
            onChange={(event) => apply({ assignee: event.target.value })}
          >
            {assigneeOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        )}

        <select
          className="select toolbar-select"
          aria-label="Urutkan"
          value={sortKey}
          onChange={(event) => apply({ sort: event.target.value })}
        >
          {sortOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <button
          className={`btn btn-sm ${
            sla === "breached" ? "btn-outline-danger" : "btn-subtle"
          }`}
          type="button"
          aria-pressed={sla === "breached"}
          onClick={toggleSla}
        >
          <i className="bi bi-exclamation-triangle" aria-hidden="true" />
          SLA lewat
        </button>

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
          {loading ? "Memuat..." : `${total} tiket`}
        </span>
      </div>

      {chips.length > 0 && (
        <div className="filter-chips">
          <span className="filter-chips-label">Filter aktif</span>
          {chips.map((chip) => (
            <FilterChip
              key={chip.label}
              label={chip.label}
              onRemove={() => apply({ [chip.key]: "" })}
            />
          ))}
        </div>
      )}

      {error && (
        <div className="alert alert--error" role="alert">
          <i className="bi bi-exclamation-triangle" aria-hidden="true" />
          <div>
            {error}{" "}
            <button
              className="btn btn-subtle btn-sm"
              type="button"
              onClick={loadTickets}
            >
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
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={resetFilters}
                >
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
          <>
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
                    const assigneeUser = ticket.expand?.assignee;

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
                          {assigneeUser ? (
                            <span className="user-cell">
                              <span className="avatar avatar--sm">
                                {initials(assigneeUser.name)}
                              </span>
                              <span>{assigneeUser.name}</span>
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
                              paused={ticket.status === "waiting"}
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

            <div className="pagination">
              <span className="pagination-info">
                Menampilkan {from}–{to} dari {total} tiket
              </span>

              <div className="pagination-controls">
                <select
                  className="select select-sm"
                  aria-label="Tiket per halaman"
                  value={perPage}
                  onChange={(event) => changePageSize(Number(event.target.value))}
                >
                  {pageSizes.map((size) => (
                    <option key={size} value={size}>
                      {size} / halaman
                    </option>
                  ))}
                </select>

                <button
                  className="page-btn"
                  type="button"
                  disabled={page <= 1}
                  onClick={() => goToPage(page - 1)}
                  aria-label="Halaman sebelumnya"
                >
                  <i className="bi bi-chevron-left" aria-hidden="true" />
                </button>
                <span className="pagination-page">
                  Halaman {page} / {Math.max(totalPages, 1)}
                </span>
                <button
                  className="page-btn"
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => goToPage(page + 1)}
                  aria-label="Halaman berikutnya"
                >
                  <i className="bi bi-chevron-right" aria-hidden="true" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
