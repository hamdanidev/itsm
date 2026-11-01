import { createContext, useContext, useEffect, useState } from "react";
import { pb } from "../../lib/pocketbase";
import { useAuth } from "./AuthProvider";

const TenantContext = createContext({ tenant: null, loading: false });

// Identitas tenant dipakai untuk branding di sidebar. Gagal memuat tenant
// tidak boleh memblokir aplikasi; UI memakai fallback.
export function TenantProvider({ children }) {
  const { user } = useAuth();
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    if (!user?.tenant) {
      setTenant(null);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    pb.collection("tenants")
      .getOne(user.tenant)
      .then((record) => {
        if (active) setTenant(record);
      })
      .catch(() => {
        if (active) setTenant(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user?.tenant]);

  return (
    <TenantContext.Provider value={{ tenant, loading }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
