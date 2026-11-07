import { useCallback, useEffect, useMemo, useState } from "react";
import { pb } from "../../../lib/pocketbase";
import { getErrorMessage, transitionTicket } from "../../../lib/api";
import { initials, isOpen } from "../../../lib/format";
import { isLead, isResolver, isStaff } from "../../../lib/permissions";
import { compareUrgency, isBreached, nextDueOf } from "../lib/queues";
import ResolveTicketModal from "./ResolveTicketModal";
import { Priority, SlaChip, TypeIcon } from "./Badges";

// Papan kerja (Kanban) sekunder. Kolom mengikuti status yang benar-benar
// dikerjakan; `closed` tidak ditampilkan. Perpindahan kartu tetap memanggil
// endpoint transisi sehingga aturan role, approval, dan SLA tetap di server.
const COLUMNS = [
  {
    key: "new",
    label: "Baru",
    hint: "Belum ditangani",
    filter: '(status = "open" || status = "reopened")',
    sort: "-created",
  },
  {
    key: "doing",
    label: "Dikerjakan",
    hint: "Assigned / in progress",
    filter: '(status = "assigned" || status = "in_progress")',
    sort: "next_due_at",
  },
  {
    key: "waiting",
    label: "Menunggu pelapor",
    hint: "SLA dijeda",
    filter: 'status = "waiting"',
    sort: "next_due_at",
  },
  {
    key: "done",
    label: "Selesai",
    hint: "Menunggu verifikasi / tutup",
    filter: 'status = "resolved"',
    sort: "next_due_at",
  },
];

const COLUMN_LABELS = Object.fromEntries(
  COLUMNS.map((column) => [column.key, column.label])
);

const MARKS = {
  new: "new",
  doing: "doing",
  waiting: "waiting",
  done: "done",
};

function relatedUsers(ticket) {
  return ticket.expand?.assignee;
}

export default function TicketBoard({
  baseFilter,
  user,
  canAct,
  onOpenTicket,
  onChanged,
}) {
  const [columns, setColumns] = useState(() =>
    Object.fromEntries(
      COLUMNS.map((column) => [
        column.key,
        { items: [], total: 0, loading: true },
      ])
    )
  );
  const [limits, setLimits] = useState(() =>
    Object.fromEntries(COLUMNS.map((column) => [column.key, 25]))
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const [draggingId, setDraggingId] = useState("");
  const [dragOver, setDragOver] = useState("");
  const [menuId, setMenuId] = useState("");
  const [resolveTicket, setResolveTicket] = useState(null);

  const staff = isStaff(user);
  const lead = isLead(user);
  const resolver = isResolver(user);

  const load = useCallback(async () => {
    setError("");

    const results = await Promise.all(
      COLUMNS.map(async (column) => {
        const filter = [baseFilter, column.filter]
          .filter(Boolean)
          .join(" && ");
        const limit = limits[column.key];

        try {
          const result = await pb.collection("tickets").getList(1, limit, {
            filter,
            sort: column.sort,
            expand: "assignee,requester,unit",
          });

          const items =
            column.key === "new"
              ? result.items
              : [...result.items].sort(compareUrgency);

          return [column.key, { items, total: result.totalItems, loading: false }];
        } catch (err) {
          return [
            column.key,
            { items: [], total: 0, loading: false, error: getErrorMessage(err) },
          ];
        }
      })
    );

    setColumns(Object.fromEntries(results));

    const failed = results.find(([, value]) => value.error);
    if (failed) setError(failed[1].error);
  }, [baseFilter, limits]);

  useEffect(() => {
    let active = true;

    // Tandai loading saat filter berubah tanpa mengosongkan kartu lama.
    setColumns((current) =>
      Object.fromEntries(
        Object.entries(current).map(([key, value]) => [
          key,
          { ...value, loading: true },
        ])
      )
    );

    load().catch((err) => {
      if (active) setError(getErrorMessage(err));
    });

    return () => {
      active = false;
    };
  }, [load]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const allowedTargets = useMemo(() => {
    function check(ticket, columnKey) {
      const status = String(ticket.status || "");
      const approvalReady =
        ticket.type === "incident" ||
        ticket.approval_mode === "none" ||
        ticket.approval_status === "approved" ||
        ticket.approval_status === "not_required";
      const assignee = String(ticket.assignee || "");
      const mine = assignee === user?.id;

      if (columnKey === "doing") {
        if (!["open", "reopened", "waiting"].includes(status)) return false;
        if (!approvalReady) return false;
        if (resolver) {
          return mine || (!assignee && ticket.team === user?.team);
        }
        return lead || !assignee || mine;
      }

      if (columnKey === "waiting" || columnKey === "done") {
        if (!["assigned", "in_progress"].includes(status)) return false;
        if (!approvalReady) return false;
        return lead || mine;
      }

      return false;
    }

    return check;
  }, [lead, resolver, user?.id, user?.team]);

  function dropMessage(ticket, columnKey) {
    const status = String(ticket.status || "");
    const approvalReady =
      ticket.type === "incident" ||
      ticket.approval_mode === "none" ||
      ticket.approval_status === "approved" ||
      ticket.approval_status === "not_required";

    if (status === "resolved") {
      return "Tiket sudah selesai. Buka kembali dari detail tiket bila perlu dikerjakan lagi.";
    }

    if (columnKey === "doing") {
      if (status === "assigned" || status === "in_progress") {
        return "Tiket sudah ada di kolom Dikerjakan.";
      }
      if (!approvalReady) {
        return "Approval belum disetujui; tiket belum bisa dikerjakan.";
      }
      return "Tiket ini bukan milik Anda atau bukan bagian antrean tim Anda.";
    }

    if (columnKey === "waiting") {
      if (status === "open" || status === "reopened") {
        return "Mulai kerjakan tiket terlebih dahulu sebelum menunggu pelapor.";
      }
      if (!approvalReady) {
        return "Approval belum disetujui; tiket belum bisa dijeda.";
      }
      return "Hanya assignee atau Kepala IT yang dapat menjeda tiket ini.";
    }

    if (columnKey === "done") {
      if (status === "open" || status === "reopened") {
        return "Mulai kerjakan tiket terlebih dahulu sebelum diselesaikan.";
      }
      if (!approvalReady) {
        return "Approval belum disetujui; tiket belum bisa diselesaikan.";
      }
      return "Hanya assignee atau Kepala IT yang dapat menyelesaikan tiket ini.";
    }

    return "Perpindahan ini tidak tersedia.";
  }

  async function moveTicket(ticket, columnKey) {
    if (!canAct || busyId) return;

    const columnStatuses = {
      new: ["open", "reopened"],
      doing: ["assigned", "in_progress"],
      waiting: ["waiting"],
      done: ["resolved"],
    }[columnKey];

    if (columnStatuses?.includes(ticket.status)) {
      setError(`Tiket sudah ada di kolom ${COLUMN_LABELS[columnKey]}.`);
      return;
    }

    if (columnKey === "done") {
      if (!allowedTargets(ticket, "done")) {
        setError(dropMessage(ticket, "done"));
        return;
      }
      setResolveTicket(ticket);
      return;
    }

    if (!allowedTargets(ticket, columnKey)) {
      setError(dropMessage(ticket, columnKey));
      return;
    }

    setBusyId(ticket.id);
    setError("");

    try {
      await transitionTicket(ticket.id, {
        status: columnKey === "doing" ? "in_progress" : "waiting",
      });
      setNotice(
        `${ticket.ticket_no} dipindahkan ke ${
          COLUMN_LABELS[columnKey] || columnKey
        }.`
      );
      setMenuId("");
      await load();
      if (onChanged) onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId("");
    }
  }

  function handleDragStart(event, ticket) {
    if (!canAct) return;

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", ticket.id);
    setDraggingId(ticket.id);
    setMenuId("");
  }

  function handleDrop(event, columnKey) {
    event.preventDefault();
    setDragOver("");

    const ticketId = event.dataTransfer.getData("text/plain") || draggingId;
    setDraggingId("");
    if (!ticketId) return;

    const ticket = Object.values(columns)
      .flatMap((column) => column.items)
      .find((item) => item.id === ticketId);

    if (ticket) moveTicket(ticket, columnKey);
  }

  function cardMenuItems(ticket) {
    return COLUMNS.filter((column) => column.key !== MARKS.new).map(
      (column) => ({
        key: column.key,
        label: column.label,
        allowed: allowedTargets(ticket, column.key),
        run: () => moveTicket(ticket, column.key),
      })
    );
  }

  return (
    <div className="board">
      <div className="board-toolbar">
        <span className="board-hint">
          <i className="bi bi-hand-index" aria-hidden="true" />
          Seret kartu untuk memindahkan, atau buka menu kartu.
        </span>

        <button
          className="btn btn-subtle btn-sm"
          type="button"
          onClick={() => {
            setColumns((current) =>
              Object.fromEntries(
                Object.entries(current).map(([key, value]) => [
                  key,
                  { ...value, loading: true },
                ])
              )
            );
            load().catch((err) => setError(getErrorMessage(err)));
          }}
        >
          <i className="bi bi-arrow-clockwise" aria-hidden="true" />
          Muat ulang
        </button>
      </div>

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
              onClick={() => setError("")}
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      <div className="board-columns">
        {COLUMNS.map((column) => {
          const state = columns[column.key];
          const isTarget = dragOver === column.key;

          return (
            <section
              key={column.key}
              className={`board-column is-${column.key}${
                isTarget ? " is-dragover" : ""
              }`}
              aria-label={`${column.label} (${state.total})`}
              onDragOver={(event) => {
                if (!canAct) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragOver(column.key);
              }}
              onDragLeave={() => {
                if (dragOver === column.key) setDragOver("");
              }}
              onDrop={(event) => handleDrop(event, column.key)}
            >
              <header className="board-column-head">
                <div>
                  <h2 className="board-column-title">{column.label}</h2>
                  <span className="board-column-hint">{column.hint}</span>
                </div>
                <span className="board-column-count">{state.total}</span>
              </header>

              <div className="board-column-body">
                {state.loading && state.items.length === 0 ? (
                  <div className="board-skeleton">
                    {[0, 1, 2].map((index) => (
                      <div key={index} className="board-skeleton-card" />
                    ))}
                  </div>
                ) : state.items.length === 0 ? (
                  <div className="board-empty">Tidak ada tiket.</div>
                ) : (
                  state.items.map((ticket) => {
                    const assigneeUser = relatedUsers(ticket);
                    const isBusy = busyId === ticket.id;
                    const isDragging = draggingId === ticket.id;
                    const menuOpen = menuId === ticket.id;

                    return (
                      <article
                        key={ticket.id}
                        className={`board-card${isBusy ? " is-busy" : ""}${
                          isDragging ? " is-dragging" : ""
                        }`}
                        draggable={canAct && !isBusy}
                        onDragStart={(event) => handleDragStart(event, ticket)}
                        onDragEnd={() => {
                          setDraggingId("");
                          setDragOver("");
                        }}
                        onClick={() => onOpenTicket(ticket)}
                        tabIndex={0}
                        role="button"
                        aria-label={`${ticket.ticket_no} · ${ticket.title}`}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") onOpenTicket(ticket);
                        }}
                      >
                        <div className="board-card-top">
                          <TypeIcon type={ticket.type} />
                          <span className="board-card-key">
                            {ticket.ticket_no}
                          </span>
                          {canAct && (
                            <button
                              className="board-card-menu"
                              type="button"
                              aria-label={`Pindahkan ${ticket.ticket_no}`}
                              aria-expanded={menuOpen}
                              onClick={(event) => {
                                event.stopPropagation();
                                setMenuId(menuOpen ? "" : ticket.id);
                              }}
                            >
                              <i className="bi bi-three-dots" aria-hidden="true" />
                            </button>
                          )}
                        </div>

                        <div className="board-card-title">{ticket.title}</div>

                        <div className="board-card-badges">
                          <Priority priority={ticket.priority} />
                          {ticket.approval_status === "pending" && (
                            <span className="lozenge lozenge--neutral">
                              Approval
                            </span>
                          )}
                          {ticket.status === "reopened" && (
                            <span className="lozenge status-reopened">
                              Dibuka kembali
                            </span>
                          )}
                          {Number(ticket.escalation_level) >= 2 && (
                            <span className="lozenge status-reopened">
                              Eskalasi L{ticket.escalation_level}
                            </span>
                          )}
                        </div>

                        <div className="board-card-foot">
                          <span className="board-card-assignee">
                            {assigneeUser ? (
                              <>
                                <span className="avatar avatar--sm">
                                  {initials(assigneeUser.name)}
                                </span>
                                <span>{assigneeUser.name}</span>
                              </>
                            ) : (
                              <span className="muted">Belum di-assign</span>
                            )}
                          </span>

                          <SlaChip
                            label="SLA"
                            dueAt={nextDueOf(ticket)}
                            breached={isBreached(ticket)}
                            active={isOpen(ticket)}
                            paused={ticket.status === "waiting"}
                            compact
                          />
                        </div>

                        {menuOpen && (
                          <div
                            className="board-card-actions"
                            role="menu"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {cardMenuItems(ticket).map((item) => (
                              <button
                                key={item.key}
                                type="button"
                                role="menuitem"
                                disabled={!item.allowed || isBusy}
                                title={
                                  item.allowed
                                    ? `Pindahkan ke ${item.label}`
                                    : dropMessage(ticket, item.key)
                                }
                                onClick={item.run}
                              >
                                <i
                                  className={`bi ${
                                    item.key === "done"
                                      ? "bi-check2-circle"
                                      : item.key === "waiting"
                                        ? "bi-pause-circle"
                                        : "bi-play-circle"
                                  }`}
                                  aria-hidden="true"
                                />
                                {item.key === "done"
                                  ? "Selesaikan"
                                  : item.key === "waiting"
                                    ? "Menunggu pelapor"
                                    : "Kerjakan"}
                              </button>
                            ))}
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setMenuId("");
                                onOpenTicket(ticket);
                              }}
                            >
                              <i className="bi bi-box-arrow-up-right" aria-hidden="true" />
                              Buka detail
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })
                )}

                {state.total > state.items.length && (
                  <button
                    className="board-more"
                    type="button"
                    onClick={() =>
                      setLimits((current) => ({
                        ...current,
                        [column.key]: current[column.key] + 25,
                      }))
                    }
                  >
                    Muat {Math.min(25, state.total - state.items.length)} lagi
                    <span className="muted">
                      {" "}
                      ({state.items.length}/{state.total})
                    </span>
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <ResolveTicketModal
        open={Boolean(resolveTicket)}
        ticket={resolveTicket}
        onClose={() => setResolveTicket(null)}
        onResolved={async () => {
          const ticketNo = resolveTicket?.ticket_no;
          setResolveTicket(null);
          setNotice(`${ticketNo} ditandai selesai.`);
          await load();
          if (onChanged) onChanged();
        }}
      />
    </div>
  );
}
