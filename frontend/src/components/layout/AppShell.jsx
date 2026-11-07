import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../app/providers/AuthProvider";
import { useNotifications } from "../../app/providers/NotificationsProvider";
import { useTenant } from "../../app/providers/TenantProvider";
import { useTheme } from "../../app/providers/ThemeProvider";
import { formatRelative, initials } from "../../lib/format";
import {
  canViewReports,
  isLead,
  isPlatformStaff,
  isStaff,
  isViewer,
  roleLabel,
} from "../../lib/permissions";
import { tenantLogoUrl } from "../../lib/branding";
import { notificationIcon } from "../../features/notifications/notificationMeta";
import BrandMark from "../ui/BrandMark";
import Avatar from "../ui/Avatar";
import ThemeToggle from "../ui/ThemeToggle";
import TenantSwitcher from "./TenantSwitcher";

// Pilihan lebar sidebar disimpan agar tidak berubah saat halaman di-refresh.
const SIDEBAR_STORAGE_KEY = "itsm.sidebar.collapsed";

const THEME_OPTIONS = [
  ["auto", "Sistem"],
  ["light", "Terang"],
  ["dark", "Gelap"],
];

function readSidebarCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function navClass({ isActive }, extraActive = false) {
  return `sidebar-link${isActive || extraActive ? " is-active" : ""}`;
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const { tenant } = useTenant();
  const { preference, resolved, setPreference } = useTheme();
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  // Label mengambang saat sidebar menyempit menjadi rail ikon.
  const [navTip, setNavTip] = useState(null);
  const ticketDetailActive =
    /^\/tickets\/[^/]+$/.test(location.pathname) &&
    location.pathname !== "/tickets/new";

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? "1" : "0");
    } catch {
      // localStorage bisa diblokir; pilihan tetap berlaku untuk sesi ini.
    }

    setNavTip(null);
  }, [sidebarCollapsed]);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    setNavTip(null);
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
        setNavTip(null);
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

  function toggleSidebar() {
    setSidebarCollapsed((value) => !value);
  }

  // Label mengambang hanya untuk rail ikon; teks asli tetap terbaca pembaca layar.
  function showNavTip(link) {
    // Breakpoint ini sama dengan media query sidebar ciut di app.css.
    if (!sidebarCollapsed) return;
    if (!window.matchMedia("(min-width: 1081px)").matches) return;

    const label = link.querySelector(".sidebar-label");

    if (!label) return;

    const rect = link.getBoundingClientRect();

    setNavTip({
      text: label.textContent,
      // Jaga tooltip tetap di dalam viewport saat daftar menu digulir.
      top: Math.min(
        Math.max(rect.top + rect.height / 2, 24),
        window.innerHeight - 24
      ),
      left: rect.right + 10,
    });
  }

  function clearNavTip() {
    setNavTip(null);
  }

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

  const sidebarToggleLabel = sidebarCollapsed
    ? "Tampilkan menu samping"
    : "Sembunyikan menu samping";
  const sidebarToggleIcon = sidebarCollapsed
    ? "bi-chevron-double-right"
    : "bi-chevron-double-left";

  // Satu daftar navigasi untuk kedua peran; urutan mengikuti tampilan sebelumnya.
  const navItems = [
    {
      key: "platform",
      to: "/platform",
      icon: "bi-buildings",
      label: "Konsol Vendor",
      visible: isPlatformStaff(user),
    },
    {
      key: "dashboard",
      to: "/dashboard",
      icon: "bi-grid-1x2",
      label: "Ringkasan",
      visible: !isPlatformStaff(user) && isStaff(user),
    },
    {
      key: "catalog",
      to: "/catalog",
      icon: "bi-grid",
      label: "Katalog Layanan",
      visible: !isPlatformStaff(user) && !isViewer(user),
    },
    {
      key: "tickets",
      to: "/tickets",
      icon: "bi-ticket-detailed",
      label: "Tiket",
      visible: !isViewer(user),
    },
    {
      key: "incidents",
      to: "/incidents",
      icon: "bi-exclamation-octagon",
      label: "Insiden mayor",
      visible: isStaff(user),
    },
    {
      key: "problems",
      to: "/problems",
      icon: "bi-diagram-3",
      label: "Problem",
      visible: !isPlatformStaff(user) && isStaff(user),
    },
    {
      key: "assets",
      to: "/assets",
      icon: "bi-hdd-stack",
      label: "Aset & CI",
      visible: !isPlatformStaff(user) && isStaff(user),
    },
    {
      key: "knowledge",
      to: "/knowledge",
      icon: "bi-journal-text",
      label: "Pengetahuan",
      visible: !isPlatformStaff(user) && !isViewer(user),
    },
    {
      key: "notifications",
      to: "/notifications",
      icon: "bi-bell",
      label: "Notifikasi",
      visible: !isViewer(user),
      badge: unread,
    },
    {
      key: "reports",
      to: "/reports",
      icon: "bi-bar-chart-line",
      label: "Laporan",
      visible: canViewReports(user),
    },
    {
      key: "audit",
      to: "/audit",
      icon: "bi-clipboard-data",
      label: "Audit",
      visible: isPlatformStaff(user) || canViewReports(user),
    },
    {
      key: "admin",
      to: "/admin",
      icon: "bi-sliders",
      label: "Pengaturan",
      visible: !isPlatformStaff(user) && isLead(user),
    },
  ].filter((item) => item.visible);

  return (
    <>
      <header className="topbar">
        <button
          className="icon-button sidebar-toggle"
          type="button"
          onClick={toggleSidebar}
          aria-label={sidebarToggleLabel}
          aria-expanded={!sidebarCollapsed}
          aria-controls="app-sidebar"
          title={sidebarToggleLabel}
        >
          <i className={`bi ${sidebarToggleIcon}`} aria-hidden="true" />
        </button>

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

          {!isPlatformStaff(user) && !isViewer(user) && (
            <Link
              className="btn btn-primary topbar-create"
              to="/tickets/new"
              aria-label="Buat tiket"
            >
              <i className="bi bi-plus-lg" aria-hidden="true" />
              <span>Buat tiket</span>
            </Link>
          )}

          <ThemeToggle className="icon-button theme-quick" />

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
                <span className="user-role">
                  {roleLabel(user)}
                  {user?.job_title ? ` · ${user.job_title}` : ""}
                </span>
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

                <div className="menu-section">
                  <span className="menu-section-label">
                    <i
                      className={`bi ${
                        resolved === "dark" ? "bi-moon-stars" : "bi-sun"
                      }`}
                      aria-hidden="true"
                    />
                    Tema
                  </span>
                  <div className="theme-switch" role="group" aria-label="Pilih tema">
                    {THEME_OPTIONS.map(([value, label]) => (
                      <button
                        key={value}
                        className={`theme-option${
                          preference === value ? " is-active" : ""
                        }`}
                        type="button"
                        aria-pressed={preference === value}
                        onClick={() => setPreference(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

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

      <div
        className={`app-body${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`}
      >
        <aside
          id="app-sidebar"
          className={`sidebar${navOpen ? " is-open" : ""}${
            sidebarCollapsed ? " is-collapsed" : ""
          }`}
          onScroll={clearNavTip}
        >
          <div
            className="project-summary"
            title={sidebarCollapsed ? tenantName : undefined}
          >
            <span
              className={`project-avatar${tenant?.logo ? " has-logo" : ""}`}
              aria-hidden="true"
            >
              {tenant?.logo ? (
                <img src={tenantLogoUrl(tenant, "96x96")} alt="" />
              ) : (
                initials(tenantName)
              )}
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

            {navItems.map((item) => (
              <NavLink
                key={item.key}
                to={item.to}
                end={item.key === "tickets"}
                className={({ isActive }) =>
                  navClass(
                    { isActive },
                    item.key === "tickets" && ticketDetailActive
                  )
                }
                onMouseEnter={(event) => showNavTip(event.currentTarget)}
                onMouseLeave={clearNavTip}
                onFocus={(event) => showNavTip(event.currentTarget)}
                onBlur={clearNavTip}
              >
                <i className={`bi ${item.icon}`} aria-hidden="true" />
                <span className="sidebar-label">{item.label}</span>
                {item.badge > 0 && (
                  <span className="sidebar-badge is-count">{item.badge}</span>
                )}
              </NavLink>
            ))}
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

      {navTip && (
        <div
          className="nav-tip"
          role="tooltip"
          style={{ top: navTip.top, left: navTip.left }}
        >
          {navTip.text}
        </div>
      )}
    </>
  );
}
