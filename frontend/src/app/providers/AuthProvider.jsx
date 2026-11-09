import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { pb } from "../../lib/pocketbase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(pb.authStore.record || null);
  const [ready, setReady] = useState(false);
  const refreshing = useRef(false);

  useEffect(() => {
    const unsubscribe = pb.authStore.onChange((_token, record) => {
      setUser(record || null);
    });

    async function restoreSession() {
      if (!pb.authStore.isValid) {
        setReady(true);
        return;
      }

      // React StrictMode menjalankan effect dua kali. Tanpa penjaga ini dua
      // `authRefresh` berjalan bersamaan, SDK membatalkan salah satunya, dan
      // request yang dibatalkan dulu dianggap sesi tidak berlaku.
      if (refreshing.current) return;
      refreshing.current = true;

      try {
        const auth = await pb.collection("users").authRefresh();
        setUser(auth.record);
      } catch (err) {
        // Hanya 401/403 yang berarti token benar-benar tidak berlaku. Error
        // lain (request dibatalkan, jaringan putus sesaat) tidak boleh
        // mengeluarkan pengguna dari sesinya.
        const status = Number(err && err.status) || 0;

        if (status === 401 || status === 403) {
          pb.authStore.clear();
          setUser(null);
        }
      } finally {
        refreshing.current = false;
        setReady(true);
      }
    }

    restoreSession();

    return unsubscribe;
  }, []);

  const login = useCallback(async (email, password) => {
    const auth = await pb
      .collection("users")
      .authWithPassword(email.trim(), password);
    setUser(auth.record);
    return auth.record;
  }, []);

  const logout = useCallback(() => {
    pb.authStore.clear();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      ready,
      isAuthenticated: Boolean(user),
      isPlatformStaff: Boolean(user?.is_platform_staff),
      login,
      logout,
    }),
    [user, ready, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
