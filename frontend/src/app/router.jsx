import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./providers/AuthProvider";
import AppShell from "../components/layout/AppShell";
import EmptyState from "../components/ui/EmptyState";
import LoginPage from "../features/auth/LoginPage";
import DashboardPage from "../features/dashboard/pages/DashboardPage";
import AdminPage from "../features/admin/pages/AdminPage";
import NotificationsPage from "../features/notifications/pages/NotificationsPage";
import ReportsPage from "../features/reports/pages/ReportsPage";
import TicketListPage from "../features/tickets/pages/TicketListPage";
import TicketCreatePage from "../features/tickets/pages/TicketCreatePage";
import TicketDetailPage from "../features/tickets/pages/TicketDetailPage";
import { isLead, isStaff } from "../lib/permissions";

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
  const { ready, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!ready) return <FullPageLoader />;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

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
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<HomeRedirect />} />
        <Route
          path="/dashboard"
          element={
            <RequireStaff>
              <DashboardPage />
            </RequireStaff>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireLead>
              <AdminPage />
            </RequireLead>
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
        <Route path="/tickets" element={<TicketListPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/tickets/new" element={<TicketCreatePage />} />
        <Route path="/tickets/:id" element={<TicketDetailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
