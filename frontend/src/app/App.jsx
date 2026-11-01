import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./providers/AuthProvider";
import { TenantProvider } from "./providers/TenantProvider";
import { NotificationsProvider } from "./providers/NotificationsProvider";
import AppRoutes from "./router";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TenantProvider>
          <NotificationsProvider>
            <AppRoutes />
          </NotificationsProvider>
        </TenantProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
