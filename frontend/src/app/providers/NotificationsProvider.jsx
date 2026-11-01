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
import { useAuth } from "./AuthProvider";

const NotificationsContext = createContext(null);

export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const refreshTimer = useRef(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setItems([]);
      setUnread(0);
      return;
    }

    setLoading(true);
    try {
      const [list, count] = await Promise.all([
        pb.collection("notifications").getList(1, 50, {
          sort: "-created",
          expand: "ticket",
          // Jangan biarkan auto-cancellation SDK membatalkan salah satu
          // request saat dua refresh berjalan berdekatan.
          requestKey: null,
        }),
        pb.collection("notifications").getList(1, 1, {
          filter: "is_read = false",
          requestKey: null,
        }),
      ]);

      setItems(list.items);
      setUnread(count.totalItems);
    } catch {
      // Notifikasi bukan alur kritis; biarkan UI tetap berjalan.
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Refresh ringan setelah event realtime; payload event sudah dimasukkan
  // optimistis sehingga badge berubah segera walau server belum selesai commit.
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      refresh();
    }, 600);
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return undefined;

    let disposed = false;
    let unsubscribe = null;

    pb.collection("notifications")
      .subscribe(
        "*",
        (data) => {
          if (disposed) return;

          const record = data.record;
          const isOwn = record && String(record.user) === String(user.id);

          if (data.action === "create" && isOwn) {
            setItems((current) => {
              if (current.some((item) => item.id === record.id)) return current;
              return [record, ...current].slice(0, 50);
            });
            setUnread((value) => value + 1);
          }

          scheduleRefresh();
        },
        { filter: `user = "${user.id}"` }
      )
      .then((fn) => {
        if (disposed) {
          fn();
          return;
        }
        unsubscribe = fn;
        // Tutup celah event yang terjadi sebelum langganan aktif.
        refresh();
      })
      .catch(() => {});

    return () => {
      disposed = true;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (unsubscribe) unsubscribe();
    };
  }, [user, scheduleRefresh, refresh]);

  // Fallback: segarkan saat tab kembali fokus/terlihat dan tiap 60 detik,
  // agar event yang terlewat saat koneksi putus tetap tersusul.
  useEffect(() => {
    function handleFocus() {
      refresh();
    }

    function handleVisibility() {
      if (!document.hidden) refresh();
    }

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    const interval = setInterval(refresh, 60000);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(interval);
    };
  }, [refresh]);

  const markRead = useCallback(
    async (id) => {
      setItems((current) =>
        current.map((item) =>
          item.id === id ? { ...item, is_read: true } : item
        )
      );
      setUnread((value) => Math.max(0, value - 1));

      try {
        await pb.collection("notifications").update(id, { is_read: true });
      } catch {
        refresh();
      }
    },
    [refresh]
  );

  const markAllRead = useCallback(async () => {
    const unreadItems = await pb
      .collection("notifications")
      .getFullList({ filter: "is_read = false", requestKey: null });

    await Promise.all(
      unreadItems.map((item) =>
        pb.collection("notifications").update(item.id, { is_read: true })
      )
    );

    await refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ items, unread, loading, refresh, markRead, markAllRead }),
    [items, unread, loading, refresh, markRead, markAllRead]
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error("useNotifications must be used inside NotificationsProvider");
  }
  return context;
}
