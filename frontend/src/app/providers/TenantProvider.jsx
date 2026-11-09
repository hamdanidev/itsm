import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { pb } from "../../lib/pocketbase";
import { fetchPlatformTenants } from "../../lib/api";
import { configureFormatting } from "../../lib/format";
import { useAuth } from "./AuthProvider";

const STORAGE_KEY = "itsm.vendor.activeTenant";

const TenantContext = createContext({
  tenant: null,
  tenants: [],
  activeTenantId: "",
  setActiveTenant: () => {},
  reloadTenants: () => {},
  isPlatformScope: false,
  loading: false,
});

// Identitas tenant dipakai untuk branding sidebar dan menjadi konteks kerja
// (rumah sakit mana yang sedang ditangani).
//
// Akun rumah sakit: tenant tetap miliknya sendiri.
// Akun vendor (scope platform): tidak punya tenant, jadi daftar rumah sakit
// diambil dari Konsol Vendor dan satu dipilih sebagai konteks aktif. Pilihan
// disimpan di localStorage agar tidak berubah setiap refresh.
export function TenantProvider({ children }) {
  const { user, ready } = useAuth();
  const isPlatformScope = Boolean(user?.is_platform_staff);
  const userId = user?.id || "";
  const userTenant = user?.tenant || "";

  const [tenant, setTenant] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [activeTenantId, setActiveTenantId] = useState("");
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    if (!ready) return undefined;

    if (!userId) {
      setTenant(null);
      setTenants([]);
      setActiveTenantId("");
      setLoading(false);
      return undefined;
    }

    setLoading(true);

    if (!isPlatformScope) {
      setTenants([]);
      setActiveTenantId(String(userTenant));

      if (!userTenant) {
        setTenant(null);
        setLoading(false);
        return undefined;
      }

      pb.collection("tenants")
        .getOne(userTenant)
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
    }

    fetchPlatformTenants()
      .then((payload) => {
        if (!active) return;

        // Hanya rumah sakit aktif yang bisa dipakai bekerja.
        const list = (payload.items || []).filter((item) => item.is_active);
        const stored = localStorage.getItem(STORAGE_KEY) || "";
        const next = list.some((item) => item.id === stored)
          ? stored
          : list[0]?.id || "";

        setTenants(list);
        setActiveTenantId(next);
        setTenant(list.find((item) => item.id === next) || null);
      })
      .catch(() => {
        if (!active) return;
        setTenants([]);
        setActiveTenantId("");
        setTenant(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [ready, userId, userTenant, isPlatformScope, reloadKey]);

  const setActiveTenant = useCallback(
    (id) => {
      const next = String(id || "");

      setActiveTenantId(next);
      setTenant(tenants.find((item) => item.id === next) || null);

      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // localStorage bisa diblokir; pilihan tetap berlaku untuk sesi ini.
      }
    },
    [tenants]
  );

  const reloadTenants = useCallback(() => {
    setReloadKey((value) => value + 1);
  }, []);

  const value = useMemo(
    () => ({
      tenant,
      tenants,
      activeTenantId,
      setActiveTenant,
      reloadTenants,
      isPlatformScope,
      loading,
    }),
    [
      tenant,
      tenants,
      activeTenantId,
      setActiveTenant,
      reloadTenants,
      isPlatformScope,
      loading,
    ]
  );

  // Format tanggal di seluruh UI mengikuti zona rumah sakit yang sedang
  // dilihat, bukan zona perangkat. Hanya dijalankan saat tenant sudah ada:
  // halaman publik (tanpa TenantProvider) mengatur zonanya sendiri dari
  // payload branding, dan jangan sampai tertimpa nilai default.
  if (tenant?.timezone) configureFormatting({ timeZone: tenant.timezone });

  return (
    <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
