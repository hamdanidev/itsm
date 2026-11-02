import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./providers/AuthProvider";
import { MetaProvider } from "./providers/MetaProvider";
import { TenantProvider } from "./providers/TenantProvider";
import { NotificationsProvider } from "./providers/NotificationsProvider";
import AppRoutes from "./router";

export default function App() {
  return (
    <BrowserRouter>
      <MetaProvider>
        <AuthProvider>
          <TenantProvider>
            <NotificationsProvider>
              <AppRoutes />
            </NotificationsProvider>
          </TenantProvider>
        </AuthProvider>
      </MetaProvider>
    </BrowserRouter>
  );
}
