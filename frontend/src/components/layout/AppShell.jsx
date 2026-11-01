import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../app/providers/AuthProvider";
import { initials } from "../../lib/format";
import { isLead, isStaff, roleLabel } from "../../lib/permissions";
import BrandMark from "../ui/BrandMark";

function navClass({ isActive }) {
  return `sidebar-link${isActive ? " is-active" : ""}`;
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const menuRef = useRef(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const ticketDetailActive =
    /^\/tickets\/[^/]+$/.test(location.pathname) &&
    location.pathname !== "/tickets/new";

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setNavOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;

    function handlePointerDown(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [menuOpen]);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

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

        <span className="topbar-divider" aria-hidden="true" />
        <span className="topbar-context">Service desk</span>

        <div className="topbar-spacer" />

        <div className="topbar-actions">
          <Link
            className="btn btn-primary topbar-create"
            to="/tickets/new"
            aria-label="Buat tiket"
          >
            <i className="bi bi-plus-lg" aria-hidden="true" />
            <span>Buat</span>
          </Link>

          <div className="user-menu" ref={menuRef}>
            <button
              className="user-trigger"
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <span className="avatar">{initials(user?.name)}</span>
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
              SD
            </span>
            <div>
              <div className="project-name">Service Desk</div>
              <div className="project-meta">Layanan TI rumah sakit</div>
            </div>
          </div>

          <nav aria-label="Navigasi utama">
            <div className="sidebar-heading">Ruang kerja</div>

            {isStaff(user) && (
              <NavLink className={navClass} to="/dashboard">
                <i className="bi bi-grid-1x2" aria-hidden="true" />
                Ringkasan
              </NavLink>
            )}

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

            <NavLink className={navClass} to="/tickets/new">
              <i className="bi bi-plus-square" aria-hidden="true" />
              Buat tiket
            </NavLink>

            {isLead(user) && (
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
                Jangan menuliskan nama, NIK, atau nomor rekam medis pasien di
                tiket.
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
