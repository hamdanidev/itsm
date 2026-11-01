import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
        }),
        pb
          .collection("notifications")
          .getList(1, 1, { filter: "is_read = false" }),
      ]);

      setItems(list.items);
      setUnread(count.totalItems);
    } catch {
      // Notifikasi bukan alur kritis; biarkan UI tetap berjalan.
    } finally {
      setLoading(false);
    }
  }, [user]);

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
        () => {
          if (!disposed) refresh();
        },
        { filter: `user = "${user.id}"` }
      )
      .then((fn) => {
        if (disposed) fn();
        else unsubscribe = fn;
      })
      .catch(() => {});

    return () => {
      disposed = true;
      if (unsubscribe) unsubscribe();
    };
  }, [user, refresh]);

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
      .getFullList({ filter: "is_read = false" });

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
