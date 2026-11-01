import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../../components/ui/PageHeader";
import EmptyState from "../../../components/ui/EmptyState";
import { useNotifications } from "../../../app/providers/NotificationsProvider";
import { formatDateTime, formatRelative } from "../../../lib/format";
import { notificationIcon } from "../notificationMeta";

const FILTERS = [
  { key: "all", label: "Semua" },
  { key: "unread", label: "Belum dibaca" },
];

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { items, unread, loading, markRead, markAllRead } = useNotifications();
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);

  const visible = useMemo(
    () => (filter === "unread" ? items.filter((item) => !item.is_read) : items),
    [items, filter]
  );

  async function openNotification(item) {
    if (!item.is_read) {
      await markRead(item.id);
    }
    if (item.ticket) {
      navigate(`/tickets/${item.ticket}`);
    }
  }

  async function handleMarkAll() {
    setBusy(true);
    try {
      await markAllRead();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Service desk" }, { label: "Notifikasi" }]}
        title="Notifikasi"
        description="Pemberitahuan penugasan, komentar, perubahan status, approval, dan eskalasi SLA."
        actions={
          <button
            className="btn btn-outline"
            type="button"
            onClick={handleMarkAll}
            disabled={busy || unread === 0}
          >
            <i className="bi bi-check2-all" aria-hidden="true" />
            Tandai semua dibaca
          </button>
        }
      />

      <div className="tabs" role="tablist" aria-label="Filter notifikasi">
        {FILTERS.map((item) => {
          const count =
            item.key === "unread" ? unread : items.length;

          return (
            <button
              key={item.key}
              className={`tab${filter === item.key ? " is-active" : ""}`}
              type="button"
              role="tab"
              aria-selected={filter === item.key}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
              <span className="tab-count">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="list-panel">
        {loading && items.length === 0 ? (
          <div className="admin-loading">
            <span className="spinner spinner--dark" role="status" />
            Memuat notifikasi...
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon="bi-bell-slash"
            title={
              filter === "unread"
                ? "Tidak ada notifikasi belum dibaca"
                : "Belum ada notifikasi"
            }
            description="Notifikasi muncul saat tiket ditugaskan, dikomentari, berubah status, atau terkena SLA."
          />
        ) : (
          <ul className="notif-page-list">
            {visible.map((item) => (
              <li key={item.id}>
                <button
                  className={`notif-page-item${
                    item.is_read ? "" : " is-unread"
                  }`}
                  type="button"
                  onClick={() => openNotification(item)}
                  title={formatDateTime(item.created)}
                >
                  <span
                    className={`notif-icon is-${item.type}`}
                    aria-hidden="true"
                  >
                    <i className={`bi ${notificationIcon(item.type)}`} />
                  </span>
                  <span className="notif-page-copy">
                    <span className="notif-page-title">{item.title}</span>
                    <span className="notif-page-body">
                      {item.body || "—"}
                    </span>
                    <span className="notif-item-time">
                      {formatRelative(item.created)}
                    </span>
                  </span>
                  {!item.is_read && (
                    <span className="notif-dot" aria-hidden="true" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
