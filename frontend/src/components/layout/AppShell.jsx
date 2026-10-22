import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../app/providers/AuthProvider";
import { initials } from "../../lib/format";
import { isStaff, roleLabel } from "../../lib/permissions";

function navClass({ isActive }) {
  return `nav-link app-nav-link${isActive ? " active" : ""}`;
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-vh-100 bg-itsm d-flex flex-column">
      <nav className="navbar navbar-expand-lg app-navbar sticky-top">
        <div className="container-xxl">
          <Link className="navbar-brand app-brand" to="/tickets">
            <span className="app-brand-mark">
              <i className="bi bi-plus-lg" aria-hidden="true" />
            </span>
            <span>
              Healthcare <strong>ITSM</strong>
            </span>
          </Link>

          <button
            className="navbar-toggler border-0 shadow-none"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#mainNav"
            aria-controls="mainNav"
            aria-expanded="false"
            aria-label="Buka navigasi"
          >
            <i className="bi bi-list fs-3 text-white" />
          </button>

          <div className="collapse navbar-collapse" id="mainNav">
            <ul className="navbar-nav me-auto mb-2 mb-lg-0 ms-lg-4 gap-lg-1">
              <li className="nav-item">
                <NavLink className={navClass} to="/tickets" end>
                  <i className="bi bi-ticket-detailed me-1" />
                  Tiket
                </NavLink>
              </li>
              <li className="nav-item">
                <NavLink className={navClass} to="/tickets/new">
                  <i className="bi bi-plus-circle me-1" />
                  Tiket Baru
                </NavLink>
              </li>
              {isStaff(user) && (
                <li className="nav-item">
                  <span className="nav-link app-nav-link disabled">
                    <i className="bi bi-grid me-1" />
                    Dashboard
                    <span className="badge text-bg-light ms-2">soon</span>
                  </span>
                </li>
              )}
            </ul>

            <div className="dropdown">
              <button
                className="btn btn-user dropdown-toggle d-flex align-items-center gap-2"
                type="button"
                data-bs-toggle="dropdown"
                aria-expanded="false"
              >
                <span className="avatar-circle">{initials(user?.name)}</span>
                <span className="text-start d-none d-sm-block">
                  <span className="d-block small fw-semibold lh-1">
                    {user?.name}
                  </span>
                  <span className="d-block app-user-role">
                    {roleLabel(user)}
                  </span>
                </span>
              </button>
              <ul className="dropdown-menu dropdown-menu-end shadow border-0 mt-2">
                <li>
                  <span className="dropdown-item-text small text-secondary">
                    {user?.email}
                  </span>
                </li>
                <li>
                  <hr className="dropdown-divider" />
                </li>
                <li>
                  <button
                    className="dropdown-item text-danger"
                    type="button"
                    onClick={handleLogout}
                  >
                    <i className="bi bi-box-arrow-right me-2" />
                    Keluar
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </nav>

      <main className="container-xxl py-4 flex-grow-1">
        <Outlet />
      </main>

      <footer className="app-footer">
        <div className="container-xxl d-flex flex-wrap justify-content-between gap-2 py-3">
          <span>Healthcare ITSM · Tata kelola layanan TI rumah sakit</span>
          <span className="text-secondary">
            Jangan memasukkan identitas atau data pasien ke dalam tiket.
          </span>
        </div>
      </footer>
    </div>
  );
}
