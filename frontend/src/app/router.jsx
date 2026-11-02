import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./providers/AuthProvider";
import AppShell from "../components/layout/AppShell";
import EmptyState from "../components/ui/EmptyState";
import LoginPage from "../features/auth/LoginPage";
import ChangePasswordPage from "../features/auth/ChangePasswordPage";
import DashboardPage from "../features/dashboard/pages/DashboardPage";
import AdminPage from "../features/admin/pages/AdminPage";
import NotificationsPage from "../features/notifications/pages/NotificationsPage";
import ReportsPage from "../features/reports/pages/ReportsPage";
import ProfilePage from "../features/profile/pages/ProfilePage";
import PlatformPage from "../features/platform/pages/PlatformPage";
import MasterDataPage from "../features/platform/pages/MasterDataPage";
import AuditPage from "../features/audit/pages/AuditPage";
import TicketListPage from "../features/tickets/pages/TicketListPage";
import TicketCreatePage from "../features/tickets/pages/TicketCreatePage";
import TicketDetailPage from "../features/tickets/pages/TicketDetailPage";
import { isLead, isPlatformStaff, isStaff } from "../lib/permissions";

function FullPageLoader() {
  return (
    <div className="centered-page">
      <div className="centered-box">
        <span className="spinner spinner--dark spinner--lg" role="status" />
        <div className="centered-text">Memuat sesi...</div>
      </div>
    </div>
  );
}

function RequireAuth({ children }) {
  const { ready, isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!ready) return <FullPageLoader />;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Akun dengan password awal wajib mengganti password sebelum masuk ke
  // ruang kerja. Gerbang server juga menolak route ITSM sampai flag turun.
  if (
    user?.must_change_password &&
    location.pathname !== "/change-password"
  ) {
    return <Navigate to="/change-password" replace />;
  }

  return children;
}

// Akun vendor bekerja di Konsol Vendor, bukan di ruang kerja satu rumah sakit.
// Penjagaan ini hanya UX; otorisasi sebenarnya ada di API rule dan route server.
function RequireTenantUser({ children }) {
  const { user } = useAuth();

  if (isPlatformStaff(user)) return <Navigate to="/platform" replace />;

  return children;
}

function RequirePlatformStaff({ children }) {
  const { user } = useAuth();

  if (!isPlatformStaff(user)) return <Navigate to="/tickets" replace />;

  return children;
}

function RequireStaff({ children }) {
  const { user } = useAuth();

  if (!isStaff(user)) return <Navigate to="/tickets" replace />;

  return children;
}

function RequireLead({ children }) {
  const { user } = useAuth();

  if (!isLead(user)) return <Navigate to="/tickets" replace />;

  return children;
}

function HomeRedirect() {
  const { user } = useAuth();

  if (isPlatformStaff(user)) return <Navigate to="/platform" replace />;

  return <Navigate to={isStaff(user) ? "/dashboard" : "/tickets"} replace />;
}

function NotFoundPage() {
  return (
    <div className="list-panel">
      <EmptyState
        icon="bi-compass"
        title="Halaman tidak ditemukan"
        description="Tautan yang Anda buka tidak tersedia atau sudah dipindahkan."
        action={
          <Link className="btn btn-primary" to="/tickets">
            Kembali ke daftar tiket
          </Link>
        }
      />
    </div>
  );
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/change-password"
        element={
          <RequireAuth>
            <ChangePasswordPage />
          </RequireAuth>
        }
      />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<HomeRedirect />} />
        <Route
          path="/platform"
          element={
            <RequirePlatformStaff>
              <PlatformPage />
            </RequirePlatformStaff>
          }
        />
        <Route
          path="/audit"
          element={
            <RequirePlatformStaff>
              <AuditPage />
            </RequirePlatformStaff>
          }
        />
        <Route
          path="/platform/tenants/:id"
          element={
            <RequirePlatformStaff>
              <MasterDataPage />
            </RequirePlatformStaff>
          }
        />
        <Route
          path="/dashboard"
          element={
            <RequireTenantUser>
              <RequireStaff>
                <DashboardPage />
              </RequireStaff>
            </RequireTenantUser>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireTenantUser>
              <RequireLead>
                <AdminPage />
              </RequireLead>
            </RequireTenantUser>
          }
        />
        <Route
          path="/reports"
          element={
            <RequireLead>
              <ReportsPage />
            </RequireLead>
          }
        />
        {/* Vendor boleh membuka tiket & notifikasi; halaman lain tetap khusus
            akun rumah sakit. */}
        <Route path="/tickets" element={<TicketListPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route
          path="/tickets/new"
          element={
            <RequireTenantUser>
              <TicketCreatePage />
            </RequireTenantUser>
          }
        />
        <Route path="/tickets/:id" element={<TicketDetailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
