import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./providers/AuthProvider";
import { useMeta } from "./providers/MetaProvider";
import AppShell from "../components/layout/AppShell";
import EmptyState from "../components/ui/EmptyState";
import LoginPage from "../features/auth/LoginPage";
import SetupPage from "../features/setup/pages/SetupPage";
import ForgotPasswordPage from "../features/auth/ForgotPasswordPage";
import ResetPasswordPage from "../features/auth/ResetPasswordPage";
import ChangePasswordPage from "../features/auth/ChangePasswordPage";
import PublicIntakePage from "../features/intake/pages/PublicIntakePage";
import DashboardPage from "../features/dashboard/pages/DashboardPage";
import CatalogPage from "../features/catalog/pages/CatalogPage";
import ProblemsPage from "../features/problems/pages/ProblemsPage";
import ProblemDetailPage from "../features/problems/pages/ProblemDetailPage";
import IncidentsPage from "../features/incidents/pages/IncidentsPage";
import IncidentDetailPage from "../features/incidents/pages/IncidentDetailPage";
import AssetsPage from "../features/assets/pages/AssetsPage";
import AssetDetailPage from "../features/assets/pages/AssetDetailPage";
import KnowledgePage from "../features/knowledge/pages/KnowledgePage";
import KnowledgeDetailPage from "../features/knowledge/pages/KnowledgeDetailPage";
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
import {
  canViewReports,
  isLead,
  isPlatformStaff,
  isStaff,
  isViewer,
} from "../lib/permissions";

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

function RequireReportReader({ children }) {
  const { user } = useAuth();

  if (!canViewReports(user)) return <Navigate to="/tickets" replace />;

  return children;
}

function RequireAuditReader({ children }) {
  const { user } = useAuth();

  if (isPlatformStaff(user) || canViewReports(user)) return children;

  return <Navigate to="/tickets" replace />;
}

// Pengamat hanya membaca laporan; halaman kerja lain dialihkan agar tidak
// menampilkan error 403 dari API.
function RequireNotViewer({ children }) {
  const { user } = useAuth();

  if (isViewer(user)) return <Navigate to="/reports" replace />;

  return children;
}

function HomeRedirect() {
  const { user } = useAuth();

  if (isPlatformStaff(user)) return <Navigate to="/platform" replace />;
  if (isViewer(user)) return <Navigate to="/reports" replace />;

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

// Instalasi baru belum punya akun sama sekali, jadi semua halaman dialihkan ke
// setup. Halaman publik (intake QR) dan halaman setup sendiri tetap terbuka.
export default function AppRoutes() {
  const { ready, setupRequired } = useMeta();
  const location = useLocation();
  const isExempt =
    location.pathname === "/setup" || location.pathname.startsWith("/i/");

  if (!ready) return <FullPageLoader />;
  if (setupRequired && !isExempt) return <Navigate to="/setup" replace />;

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/i/:token" element={<PublicIntakePage />} />
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
            <RequireAuditReader>
              <AuditPage />
            </RequireAuditReader>
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
          path="/catalog"
          element={
            <RequireTenantUser>
              <RequireNotViewer>
                <CatalogPage />
              </RequireNotViewer>
            </RequireTenantUser>
          }
        />
        <Route
          path="/problems"
          element={
            <RequireTenantUser>
              <RequireStaff>
                <ProblemsPage />
              </RequireStaff>
            </RequireTenantUser>
          }
        />
        <Route
          path="/incidents"
          element={
            <RequireStaff>
              <IncidentsPage />
            </RequireStaff>
          }
        />
        <Route
          path="/incidents/:id"
          element={
            <RequireStaff>
              <IncidentDetailPage />
            </RequireStaff>
          }
        />
        <Route
          path="/problems/:id"
          element={
            <RequireTenantUser>
              <RequireStaff>
                <ProblemDetailPage />
              </RequireStaff>
            </RequireTenantUser>
          }
        />
        <Route
          path="/knowledge"
          element={
            <RequireTenantUser>
              <RequireNotViewer>
                <KnowledgePage />
              </RequireNotViewer>
            </RequireTenantUser>
          }
        />
        <Route
          path="/knowledge/:id"
          element={
            <RequireTenantUser>
              <RequireNotViewer>
                <KnowledgeDetailPage />
              </RequireNotViewer>
            </RequireTenantUser>
          }
        />
        <Route
          path="/assets"
          element={
            <RequireTenantUser>
              <RequireStaff>
                <AssetsPage />
              </RequireStaff>
            </RequireTenantUser>
          }
        />
        <Route
          path="/assets/:id"
          element={
            <RequireTenantUser>
              <RequireStaff>
                <AssetDetailPage />
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
            <RequireReportReader>
              <ReportsPage />
            </RequireReportReader>
          }
        />
        {/* Vendor boleh membuka tiket & notifikasi; halaman lain tetap khusus
            akun rumah sakit. Pengamat hanya membaca laporan. */}
        <Route
          path="/tickets"
          element={
            <RequireNotViewer>
              <TicketListPage />
            </RequireNotViewer>
          }
        />
        <Route
          path="/notifications"
          element={
            <RequireNotViewer>
              <NotificationsPage />
            </RequireNotViewer>
          }
        />
        <Route path="/profile" element={<ProfilePage />} />
        <Route
          path="/tickets/new"
          element={
            <RequireTenantUser>
              <RequireNotViewer>
                <TicketCreatePage />
              </RequireNotViewer>
            </RequireTenantUser>
          }
        />
        <Route
          path="/tickets/:id"
          element={
            <RequireNotViewer>
              <TicketDetailPage />
            </RequireNotViewer>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
