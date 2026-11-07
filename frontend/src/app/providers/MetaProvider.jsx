import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { pb } from "../../lib/pocketbase";

const EMPTY = {
  mode: "standalone",
  isVendor: false,
  appName: "Healthcare ITSM",
  tenant: null,
  setupRequired: false,
  ready: false,
};

const MetaContext = createContext({ ...EMPTY, refresh: async () => {} });

// Mode tenancy + status setup dibaca sekali saat aplikasi dimuat. Gagal memuat
// meta tidak boleh memblokir aplikasi: default ke standalone tanpa memaksa
// redirect setup (bila server sedang error, operator tetap bisa mencoba login).
export function MetaProvider({ children }) {
  const [meta, setMeta] = useState(EMPTY);

  const refresh = useCallback(async () => {
    try {
      const payload = await pb.send("/api/itsm/app-meta");

      setMeta({
        mode: payload?.mode === "vendor" ? "vendor" : "standalone",
        isVendor: payload?.mode === "vendor",
        appName: payload?.app || "Healthcare ITSM",
        tenant: payload?.tenant || null,
        setupRequired: Boolean(payload?.setup_required),
        ready: true,
      });
    } catch {
      setMeta({ ...EMPTY, ready: true });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(() => ({ ...meta, refresh }), [meta, refresh]);

  return <MetaContext.Provider value={value}>{children}</MetaContext.Provider>;
}

export function useMeta() {
  return useContext(MetaContext);
}
