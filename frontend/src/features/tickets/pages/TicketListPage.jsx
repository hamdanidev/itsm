import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import PageHeader from "../../../components/ui/PageHeader";
import EmptyState from "../../../components/ui/EmptyState";
import { TableSkeleton } from "../../../components/ui/Skeleton";
import { pb } from "../../../lib/pocketbase";
import {
  assignTicket,
  escapeFilterValue,
  getErrorMessage,
  transitionTicket,
} from "../../../lib/api";
import { formatRelative, initials, isOpen } from "../../../lib/format";
import { useAuth } from "../../../app/providers/AuthProvider";
import { useTenant } from "../../../app/providers/TenantProvider";
import { isLead, isResolver, isStaff } from "../../../lib/permissions";
import { teamLabel } from "../../../lib/teams";
import { ACTIVE_FILTER, isBreached, nextDueOf } from "../lib/queues";
import TicketBoard from "../components/TicketBoard";
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

// Tampilan tersimpan = preset filter yang sering dipakai tim IT. Nilai yang
// tidak ada di preset dihapus saat preset dipilih agar hasilnya dapat diprediksi.
const savedViews = [
  { key: "active", label: "Aktif", icon: "bi-inbox", params: { scope: "active" } },
  {
    key: "mine",
    label: "Tiket saya",
    icon: "bi-person-check",
    params: { scope: "active", assignee: "mine" },
  },
  {
    key: "unassigned",
    label: "Belum di-assign",
    icon: "bi-people",
    params: { scope: "active", assignee: "unassigned" },
  },
  {
    key: "breached",
    label: "SLA lewat",
    icon: "bi-exclamation-triangle",
    params: { scope: "active", sla: "breached" },
  },
  {
    key: "approval",
    label: "Menunggu approval",
    icon: "bi-hourglass-split",
    params: { scope: "active", approval: "pending" },
  },
];

const viewFilterKeys = [
  "scope",
  "assignee",
  "sla",
  "approval",
  "status",
  "priority",
  "q",
];

const DENSITY_KEY = "ticket-list-density";

const startableStatuses = ["open", "assigned", "reopened", "waiting"];

function SelectAllCheckbox({ checked, indeterminate, onChange, disabled }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      className="row-check"
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      aria-label="Pilih semua tiket di halaman ini"
    />
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
  const { isPlatformScope, activeTenantId, tenant } = useTenant();
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
  const paramsKey = params.toString();

  // Aksi cepat, aksi massal, dan papan kerja hanya untuk staf IT dan teknisi.
  const canBulkAct = isStaff(user) || isResolver(user);
  const view = canBulkAct && params.get("view") === "board" ? "board" : "list";

  const [search, setSearch] = useState(q);
  const [perPage, setPerPage] = useState(25);
  const [tickets, setTickets] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [managesUnit, setManagesUnit] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [density, setDensity] = useState("comfortable");

  useEffect(() => {
    document.title = "Tiket · Healthcare ITSM";
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(DENSITY_KEY);
    if (saved === "compact" || saved === "comfortable") setDensity(saved);
  }, []);

  // Pilihan baris tidak boleh bertahan saat filter/halaman berubah: aksi massal
  // harus selalu terlihat pada layar yang sedang dibaca.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [paramsKey]);

  useEffect(() => {
    if (!notice) return undefined;

    const timer = setTimeout(() => setNotice(""), 7000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!user?.id || isStaff(user)) {
      setManagesUnit(false);
      return undefined;
    }

    let active = true;

    pb.collection("units")
      .getList(1, 1, { filter: `manager = "${user.id}"` })
      .then((result) => {
        if (active) setManagesUnit(result.totalItems > 0);
      })
      .catch(() => {
        if (active) setManagesUnit(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

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
    // Papan punya query sendiri per kolom; daftar tidak perlu dimuat.
    if (view === "board") return;

    setLoading(true);
    setError("");

    const filters = [];

    // Vendor melihat semua tenant; daftar dibatasi ke rumah sakit yang sedang
    // aktif di pemilih tenant.
    if (isPlatformScope && activeTenantId) {
      filters.push(`tenant = "${escapeFilterValue(activeTenantId)}"`);
    }

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
    isPlatformScope,
    activeTenantId,
    view,
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

  function toggleDensity() {
    setDensity((current) => {
      const next = current === "compact" ? "comfortable" : "compact";
      localStorage.setItem(DENSITY_KEY, next);
      return next;
    });
  }

  function toggleRow(ticketId) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(ticketId)) next.delete(ticketId);
      else next.add(ticketId);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((current) => {
      const allSelected =
        tickets.length > 0 && tickets.every((ticket) => current.has(ticket.id));
      return allSelected ? new Set() : new Set(tickets.map((ticket) => ticket.id));
    });
  }

  function viewActive(view) {
    return viewFilterKeys.every((key) => {
      const expected = view.params[key] || "";
      return (params.get(key) || "") === expected;
    });
  }

  function applyView(view) {
    setSearch("");
    updateParams({
      status: "",
      priority: "",
      approval: "",
      sla: "",
      assignee: "",
      scope: "",
      q: "",
      ...view.params,
    });
  }

  // Pindah mode tampilan: papan mengabaikan filter status (kolom sudah
  // mewakili status) dan scope "aktif" agar kolom Selesai tetap terisi.
  function switchView(next) {
    setSelectedIds(new Set());
    updateParams(
      next === "board"
        ? { view: "board", status: "", scope: "" }
        : { view: "" }
    );
  }

  // Aksi cepat per baris mengikuti aturan server: tiket tanpa assignee boleh
  // diambil staf (atau teknisi pada antrean timnya), dan hanya tiket yang
  // approval-nya siap yang ditawari "Mulai".
  function quickActionFor(ticket) {
    if (!canBulkAct) return null;

    const assignee = String(ticket.assignee || "");
    const status = String(ticket.status || "");
    const staff = isStaff(user);
    const lead = isLead(user);
    const teamMatch = Boolean(user?.team) && ticket.team === user.team;

    const canClaim =
      !assignee &&
      (status === "open" || status === "reopened") &&
      (staff || (isResolver(user) && teamMatch));

    if (canClaim) {
      return {
        key: "claim",
        label: "Ambil",
        icon: "bi-hand-index",
        run: () => assignTicket(ticket.id, user.id),
        done: "di-assign kepada Anda.",
      };
    }

    const approvalReady =
      ticket.type === "incident" ||
      ticket.approval_mode === "none" ||
      ticket.approval_status === "approved" ||
      ticket.approval_status === "not_required";
    const ownershipOk = staff
      ? lead || !assignee || assignee === user?.id
      : assignee === user?.id || (!assignee && teamMatch);

    if (startableStatuses.includes(status) && approvalReady && ownershipOk) {
      const resuming = status === "waiting";

      return {
        key: "start",
        label: resuming ? "Lanjut" : "Mulai",
        icon: resuming ? "bi-play-circle" : "bi-play-fill",
        run: () => transitionTicket(ticket.id, { status: "in_progress" }),
        done: resuming ? "dilanjutkan." : "mulai dikerjakan.",
      };
    }

    return null;
  }

  async function runRowAction(ticket, action) {
    if (!action || rowBusy) return;

    setRowBusy(ticket.id);
    setError("");

    try {
      await action.run();
      setNotice(`${ticket.ticket_no} ${action.done}`);
      await loadTickets();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRowBusy("");
    }
  }

  async function runBulk(mode) {
    const items = tickets.filter((ticket) => selectedIds.has(ticket.id));
    if (!items.length || bulkBusy) return;

    setBulkBusy(true);
    setError("");

    let done = 0;
    const failures = [];

    for (const ticket of items) {
      try {
        if (mode === "assign") {
          await assignTicket(ticket.id, user.id);
        } else {
          await transitionTicket(ticket.id, { status: "in_progress" });
        }
        done += 1;
      } catch (err) {
        failures.push(`${ticket.ticket_no}: ${getErrorMessage(err)}`);
      }
    }

    setBulkBusy(false);
    setSelectedIds(new Set());
    await loadTickets();

    if (failures.length > 0) {
      setNotice("");
      setError(
        `${done} tiket diproses, ${failures.length} gagal — ${failures
          .slice(0, 2)
          .join("; ")}`
      );
    } else {
      setNotice(
        mode === "assign"
          ? `${done} tiket di-assign kepada Anda.`
          : `${done} tiket mulai dikerjakan.`
      );
    }
  }

  const filtersActive = Boolean(
    status || priority || assignee || sla || approval || scope || q
  );

  // Vendor tanpa rumah sakit aktif tidak punya konteks data. Early return ini
  // harus berada SETELAH semua hook (useMemo di bawah) agar urutan hook stabil.
  const noActiveTenant = isPlatformScope && !activeTenantId;

  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  const selectedCount = selectedIds.size;
  const allSelected =
    tickets.length > 0 && tickets.every((ticket) => selectedIds.has(ticket.id));
  const someSelected =
    !allSelected && tickets.some((ticket) => selectedIds.has(ticket.id));

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

  // Filter dasar papan: sama dengan daftar, tanpa status/scope karena kolom
  // papan sudah mewakili status.
  const boardBaseFilter = useMemo(() => {
    const filters = [];

    if (isPlatformScope && activeTenantId) {
      filters.push(`tenant = "${escapeFilterValue(activeTenantId)}"`);
    }

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

    return filters.join(" && ");
  }, [
    isPlatformScope,
    activeTenantId,
    priority,
    approval,
    assignee,
    sla,
    q,
    user?.id,
  ]);

  if (noActiveTenant) {
    return (
      <>
        <PageHeader
          breadcrumb={[{ label: "Vendor" }, { label: "Tiket" }]}
          title="Tiket"
          description="Pilih rumah sakit dulu untuk melihat antrean tiketnya."
        />
        <div className="list-panel">
          <EmptyState
            icon="bi-buildings"
            title="Belum ada rumah sakit aktif"
            description="Buat atau aktifkan rumah sakit di Konsol Vendor, lalu pilih salah satu lewat pemilih di kanan atas."
            action={
              <Link className="btn btn-primary" to="/platform">
                Buka Konsol Vendor
              </Link>
            }
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Service desk" }, { label: "Tiket" }]}
        title={
          isStaff(user) || managesUnit
            ? "Tiket"
            : isResolver(user)
              ? "Tiket & antrean tim"
              : "Tiket saya"
        }
        description={
          isStaff(user)
            ? "Antrean insiden, permintaan layanan, dan perubahan SIMRS."
            : isResolver(user)
              ? "Tiket tim Anda dan tiket yang ditugaskan kepada Anda."
              : managesUnit
                ? "Tiket yang Anda laporkan dan tiket unit yang Anda kelola."
                : "Status dan riwayat tiket yang Anda laporkan."
        }
      />

      {canBulkAct && (
        <div className="saved-views" role="group" aria-label="Tampilan tersimpan">
          {view === "list" && (
            <>
              <span className="saved-views-label">Tampilan</span>
              {savedViews.map((item) => {
                const active = viewActive(item);

                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`view-pill${active ? " is-active" : ""}`}
                    aria-pressed={active}
                    onClick={() => applyView(item)}
                  >
                    <i className={`bi ${item.icon}`} aria-hidden="true" />
                    {item.label}
                  </button>
                );
              })}
            </>
          )}

          <div className="view-switch" role="group" aria-label="Mode tampilan">
            <button
              type="button"
              className={view === "list" ? "is-active" : undefined}
              aria-pressed={view === "list"}
              onClick={() => switchView("list")}
            >
              <i className="bi bi-list-ul" aria-hidden="true" />
              Daftar
            </button>
            <button
              type="button"
              className={view === "board" ? "is-active" : undefined}
              aria-pressed={view === "board"}
              onClick={() => switchView("board")}
            >
              <i className="bi bi-kanban" aria-hidden="true" />
              Papan
            </button>
          </div>
        </div>
      )}

      {view !== "board" && (
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
      )}

      <div className="filter-bar">
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

        {(isStaff(user) || isResolver(user)) && (
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

        {view !== "board" && (
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
        )}

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

        {view !== "board" && (
          <button
            className="btn btn-subtle btn-sm"
            type="button"
            aria-pressed={density === "compact"}
            title={
              density === "compact"
                ? "Tampilkan baris lebih lega"
                : "Tampilkan lebih banyak tiket per layar"
            }
            onClick={toggleDensity}
          >
            <i
              className={`bi ${
                density === "compact" ? "bi-arrows-expand" : "bi-arrows-collapse"
              }`}
              aria-hidden="true"
            />
            {density === "compact" ? "Padat" : "Nyaman"}
          </button>
        )}

        {view !== "board" && (
          <span className="list-count">
            {loading ? "Memuat..." : `${total} tiket`}
          </span>
        )}
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

      {canBulkAct && selectedCount > 0 && (
        <div className="bulk-bar" role="region" aria-label="Aksi massal">
          <span>
            <strong>{selectedCount}</strong> tiket dipilih
          </span>
          <div className="bulk-bar-actions">
            <button
              className="btn btn-sm btn-outline"
              type="button"
              disabled={bulkBusy}
              onClick={() => runBulk("assign")}
            >
              <i className="bi bi-person-check" aria-hidden="true" />
              Assign ke saya
            </button>
            <button
              className="btn btn-sm btn-outline"
              type="button"
              disabled={bulkBusy}
              onClick={() => runBulk("start")}
            >
              <i className="bi bi-play-fill" aria-hidden="true" />
              Mulai
            </button>
            <button
              className="btn btn-sm btn-subtle"
              type="button"
              disabled={bulkBusy}
              onClick={() => setSelectedIds(new Set())}
            >
              Batal
            </button>
            {bulkBusy && <span className="muted">Memproses...</span>}
          </div>
        </div>
      )}

      {notice && (
        <div className="alert alert--success" role="status">
          <i className="bi bi-check2-circle" aria-hidden="true" />
          <div>
            {notice}{" "}
            <button
              className="btn btn-subtle btn-sm"
              type="button"
              onClick={() => setNotice("")}
            >
              Tutup
            </button>
          </div>
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

      {view === "board" ? (
        <TicketBoard
          baseFilter={boardBaseFilter}
          user={user}
          canAct={canBulkAct}
          onOpenTicket={(ticket) => navigate(`/tickets/${ticket.id}`)}
        />
      ) : (
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
              <table
                className={`issue-table${
                  density === "compact" ? " is-compact" : ""
                }`}
              >
                <thead>
                  <tr>
                    {canBulkAct && (
                      <th className="col-select">
                        <SelectAllCheckbox
                          checked={allSelected}
                          indeterminate={someSelected}
                          onChange={toggleAll}
                          disabled={tickets.length === 0}
                        />
                      </th>
                    )}
                    <th className="col-type" aria-label="Jenis" />
                    <th className="col-key">Tiket</th>
                    <th>Ringkasan</th>
                    <th className="col-status">Status</th>
                    <th className="col-priority">Prioritas</th>
                    <th className="col-assignee">Assignee</th>
                    <th className="col-team is-hide-sm">Tim</th>
                    <th className="col-sla">SLA</th>
                    <th className="col-action" aria-label="Aksi" />
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket) => {
                    const assigneeUser = ticket.expand?.assignee;
                    const quickAction = quickActionFor(ticket);
                    const selected = selectedIds.has(ticket.id);

                    return (
                      <tr
                        key={ticket.id}
                        className={selected ? "is-selected" : undefined}
                        onClick={() => navigate(`/tickets/${ticket.id}`)}
                      >
                        {canBulkAct && (
                          <td
                            className="col-select"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              className="row-check"
                              checked={selected}
                              onChange={() => toggleRow(ticket.id)}
                              aria-label={`Pilih ${ticket.ticket_no}`}
                            />
                          </td>
                        )}
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
                            {formatRelative(ticket.created)}
                            {` · ${ticket.expand?.unit?.name || "Tanpa unit"}`}
                            {ticket.team ? ` · ${teamLabel(ticket.team)}` : ""}
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
                        <td className="col-team is-hide-sm">
                          {ticket.team ? (
                            teamLabel(ticket.team)
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className="col-sla">
                          <SlaChip
                            label="SLA"
                            dueAt={nextDueOf(ticket)}
                            breached={isBreached(ticket)}
                            active={isOpen(ticket)}
                            paused={ticket.status === "waiting"}
                            compact
                          />
                        </td>
                        <td className="col-action">
                          <div className="row-actions">
                            {quickAction && (
                              <button
                                className="quick-action"
                                type="button"
                                disabled={rowBusy === ticket.id}
                                title={`${quickAction.label} ${ticket.ticket_no}`}
                                aria-label={`${quickAction.label} ${ticket.ticket_no}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  runRowAction(ticket, quickAction);
                                }}
                              >
                                <i
                                  className={`bi ${quickAction.icon}`}
                                  aria-hidden="true"
                                />
                                {quickAction.label}
                              </button>
                            )}
                            <Link
                              className="row-action"
                              to={`/tickets/${ticket.id}`}
                              onClick={(event) => event.stopPropagation()}
                              aria-label={`Buka ${ticket.ticket_no}`}
                            >
                              <i
                                className="bi bi-chevron-right"
                                aria-hidden="true"
                              />
                            </Link>
                          </div>
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
      )}
    </>
  );
}
