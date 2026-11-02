import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../app/providers/AuthProvider";
import { useNotifications } from "../../app/providers/NotificationsProvider";
import { useTenant } from "../../app/providers/TenantProvider";
import { formatRelative, initials } from "../../lib/format";
import { isLead, isPlatformStaff, isStaff, roleLabel } from "../../lib/permissions";
import { notificationIcon } from "../../features/notifications/notificationMeta";
import BrandMark from "../ui/BrandMark";
import Avatar from "../ui/Avatar";
import TenantSwitcher from "./TenantSwitcher";

function navClass({ isActive }) {
  return `sidebar-link${isActive ? " is-active" : ""}`;
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const { tenant } = useTenant();
  const {
    items: notifications,
    unread,
    markRead,
    markAllRead,
  } = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();
  const menuRef = useRef(null);
  const notifRef = useRef(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const ticketDetailActive =
    /^\/tickets\/[^/]+$/.test(location.pathname) &&
    location.pathname !== "/tickets/new";

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    setNotifOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setNotifOpen(false);
        setNavOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen && !notifOpen) return undefined;

    function handlePointerDown(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setNotifOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [menuOpen, notifOpen]);

  async function handleNotification(item) {
    setNotifOpen(false);

    if (!item.is_read) {
      await markRead(item.id);
    }

    if (item.ticket) {
      navigate(`/tickets/${item.ticket}`);
    }
  }

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  const tenantName = isPlatformStaff(user)
    ? tenant?.name || "Pilih rumah sakit"
    : tenant?.name || "Service Desk";
  const tenantMeta = isPlatformStaff(user)
    ? tenant?.code
      ? `Kode ${tenant.code} · Vendor`
      : "Pilih rumah sakit untuk mulai bekerja"
    : tenant?.code
      ? `Kode ${tenant.code} · Layanan TI`
      : "Layanan TI rumah sakit";

  return (
    <>
      <header className="topbar">
        <button
          className="icon-button nav-toggle"
          type="button"
          onClick={() => setNavOpen((value) => !value)}
          aria-label="Buka navigasi"
          aria-expanded={navOpen}
        >
          <i className={`bi ${navOpen ? "bi-x-lg" : "bi-list"}`} />
        </button>

        <Link className="topbar-brand" to="/tickets">
          <BrandMark size={24} />
          <span className="brand-name">
            Healthcare <span>ITSM</span>
          </span>
        </Link>

        <div className="topbar-spacer" />

        <div className="topbar-actions">
          <TenantSwitcher />

          {!isPlatformStaff(user) && (
            <Link
              className="btn btn-primary topbar-create"
              to="/tickets/new"
              aria-label="Buat tiket"
            >
              <i className="bi bi-plus-lg" aria-hidden="true" />
              <span>Buat tiket</span>
            </Link>
          )}

          <div className="notif-wrap" ref={notifRef}>
            <button
              className="icon-button notif-trigger"
              type="button"
              onClick={() => setNotifOpen((value) => !value)}
              aria-haspopup="menu"
              aria-expanded={notifOpen}
              aria-label={
                unread
                  ? `Notifikasi, ${unread} belum dibaca`
                  : "Notifikasi"
              }
            >
              <i className="bi bi-bell" aria-hidden="true" />
              {unread > 0 && (
                <span className="notif-badge" aria-hidden="true">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="notif-menu" role="menu">
                <div className="notif-head">
                  <span className="notif-title">Notifikasi</span>
                  {unread > 0 && (
                    <button
                      className="notif-markall"
                      type="button"
                      onClick={markAllRead}
                    >
                      Tandai semua dibaca
                    </button>
                  )}
                </div>

                {notifications.length === 0 ? (
                  <div className="notif-empty">Belum ada notifikasi.</div>
                ) : (
                  <ul className="notif-list">
                    {notifications.slice(0, 8).map((item) => (
                      <li key={item.id}>
                        <button
                          className={`notif-item${
                            item.is_read ? "" : " is-unread"
                          }`}
                          type="button"
                          role="menuitem"
                          onClick={() => handleNotification(item)}
                        >
                          <span
                            className={`notif-icon is-${item.type}`}
                            aria-hidden="true"
                          >
                            <i
                              className={`bi ${notificationIcon(item.type)}`}
                            />
                          </span>
                          <span className="notif-copy">
                            <span className="notif-item-title">
                              {item.title}
                            </span>
                            <span className="notif-item-body">
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

                <div className="notif-foot">
                  <Link to="/notifications" onClick={() => setNotifOpen(false)}>
                    Lihat semua notifikasi
                  </Link>
                </div>
              </div>
            )}
          </div>

          <div className="user-menu" ref={menuRef}>
            <button
              className="user-trigger"
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <Avatar user={user} size={24} />
              <span className="user-copy">
                <span className="user-name">{user?.name}</span>
                <span className="user-role">{roleLabel(user)}</span>
              </span>
              <i
                className={`bi ${menuOpen ? "bi-chevron-up" : "bi-chevron-down"}`}
                aria-hidden="true"
              />
            </button>

            {menuOpen && (
              <div className="menu" role="menu">
                <div className="menu-header">
                  <div className="menu-email">{user?.email}</div>
                </div>
                <Link
                  className="menu-item"
                  to="/profile"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                >
                  <i className="bi bi-person-gear" aria-hidden="true" />
                  Profil saya
                </Link>
                <button
                  className="menu-item is-danger"
                  type="button"
                  role="menuitem"
                  onClick={handleLogout}
                >
                  <i className="bi bi-box-arrow-right" aria-hidden="true" />
                  Keluar
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="app-body">
        <aside
          id="app-sidebar"
          className={`sidebar${navOpen ? " is-open" : ""}`}
        >
          <div className="project-summary">
            <span className="project-avatar" aria-hidden="true">
              {initials(tenantName)}
            </span>
            <div className="project-copy">
              <div className="project-name" title={tenantName}>
                {tenantName}
              </div>
              <div className="project-meta" title={tenantMeta}>
                {tenantMeta}
              </div>
            </div>
          </div>

          <nav aria-label="Navigasi utama">
            <div className="sidebar-heading">
              {isPlatformStaff(user) ? "Vendor" : "Ruang kerja"}
            </div>

            {isPlatformStaff(user) && (
              <NavLink className={navClass} to="/platform">
                <i className="bi bi-buildings" aria-hidden="true" />
                Konsol Vendor
              </NavLink>
            )}

            {isPlatformStaff(user) && (
              <NavLink
                className={({ isActive }) =>
                  `sidebar-link${isActive || ticketDetailActive ? " is-active" : ""}`
                }
                to="/tickets"
                end
              >
                <i className="bi bi-ticket-detailed" aria-hidden="true" />
                Tiket
              </NavLink>
            )}

            {isPlatformStaff(user) && (
              <NavLink className={navClass} to="/notifications">
                <i className="bi bi-bell" aria-hidden="true" />
                Notifikasi
                {unread > 0 && (
                  <span className="sidebar-badge is-count">{unread}</span>
                )}
              </NavLink>
            )}

            {isPlatformStaff(user) && isLead(user) && (
              <NavLink className={navClass} to="/reports">
                <i className="bi bi-bar-chart-line" aria-hidden="true" />
                Laporan
              </NavLink>
            )}

            {!isPlatformStaff(user) && isStaff(user) && (
              <NavLink className={navClass} to="/dashboard">
                <i className="bi bi-grid-1x2" aria-hidden="true" />
                Ringkasan
              </NavLink>
            )}

            {!isPlatformStaff(user) && (
              <NavLink
                className={({ isActive }) =>
                  `sidebar-link${isActive || ticketDetailActive ? " is-active" : ""}`
                }
                to="/tickets"
                end
              >
                <i className="bi bi-ticket-detailed" aria-hidden="true" />
                Tiket
              </NavLink>
            )}

            {!isPlatformStaff(user) && (
              <NavLink className={navClass} to="/notifications">
                <i className="bi bi-bell" aria-hidden="true" />
                Notifikasi
                {unread > 0 && (
                  <span className="sidebar-badge is-count">{unread}</span>
                )}
              </NavLink>
            )}

            {!isPlatformStaff(user) && isLead(user) && (
              <NavLink className={navClass} to="/reports">
                <i className="bi bi-bar-chart-line" aria-hidden="true" />
                Laporan
              </NavLink>
            )}

            {!isPlatformStaff(user) && isLead(user) && (
              <NavLink className={navClass} to="/admin">
                <i className="bi bi-sliders" aria-hidden="true" />
                Pengaturan
              </NavLink>
            )}
          </nav>

          <div className="sidebar-footer">
            <div className="privacy-note">
              <i className="bi bi-shield-check" aria-hidden="true" />
              <span>
                {isPlatformStaff(user)
                  ? "Akun vendor dapat mengelola data semua rumah sakit. Setiap tindakan tercatat di audit log."
                  : "Jangan menuliskan nama, NIK, atau nomor rekam medis pasien di tiket."}
              </span>
            </div>
          </div>
        </aside>

        {navOpen && (
          <button
            type="button"
            className="nav-backdrop"
            aria-label="Tutup navigasi"
            onClick={() => setNavOpen(false)}
          />
        )}

        <main className="main">
          <div className="page">
            <Outlet />
          </div>
        </main>
      </div>
    </>
  );
}
