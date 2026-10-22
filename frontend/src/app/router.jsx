import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./providers/AuthProvider";
import AppShell from "../components/layout/AppShell";
import LoginPage from "../features/auth/LoginPage";
import TicketListPage from "../features/tickets/pages/TicketListPage";
import TicketCreatePage from "../features/tickets/pages/TicketCreatePage";
import TicketDetailPage from "../features/tickets/pages/TicketDetailPage";

function FullPageLoader() {
  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center bg-itsm">
      <div className="text-center">
        <div className="spinner-border text-primary mb-3" role="status" />
        <div className="text-secondary small">Memuat sesi...</div>
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

function NotFoundPage() {
  return (
    <div className="container py-5 text-center">
      <div className="display-4 fw-bold text-primary">404</div>
      <h1 className="h4 mt-2">Halaman tidak ditemukan</h1>
      <p className="text-secondary">
        Tautan yang Anda buka tidak tersedia atau sudah dipindahkan.
      </p>
      <a className="btn btn-primary" href="/tickets">
        Kembali ke daftar tiket
      </a>
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
        <Route index element={<Navigate to="/tickets" replace />} />
        <Route path="/tickets" element={<TicketListPage />} />
        <Route path="/tickets/new" element={<TicketCreatePage />} />
        <Route path="/tickets/:id" element={<TicketDetailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
