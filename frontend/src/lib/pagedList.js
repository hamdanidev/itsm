import { useCallback, useEffect, useRef, useState } from "react";
import { getErrorMessage } from "./api";
import { pb } from "./pocketbase";

// Hook daftar berhalaman untuk koleksi PocketBase. Menggantikan pola
// `getFullList` + filter di browser pada daftar yang bisa tumbuh besar.
//
//   const list = usePagedList({ collection: "assets", filter, sort: "-updated" });
//
// Semua parameter filter/sort/expand harus berupa string stabil (pakai useMemo)
// agar tidak memicu permintaan berulang.
export function usePagedList({
  collection,
  filter = "",
  sort = "-created",
  expand = "",
  perPage: initialPerPage = 25,
  enabled = true,
}) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [perPage, setPerPageState] = useState(initialPerPage);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);

  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (!enabled) {
      setItems([]);
      setTotalItems(0);
      setTotalPages(0);
      setLoading(false);
      return;
    }

    const id = ++requestId.current;
    setLoading(true);
    setError("");

    try {
      const result = await pb.collection(collection).getList(page, perPage, {
        filter,
        sort,
        expand,
      });

      if (id !== requestId.current) return;

      setItems(result.items);
      setTotalItems(result.totalItems);
      setTotalPages(result.totalPages);

      // Data menyusut (mis. filter berubah) sehingga halaman aktif melewati
      // batas; mundur ke halaman terakhir yang masih ada isinya.
      if (result.items.length === 0 && result.page > 1 && result.totalPages > 0) {
        setPage(result.totalPages);
      }
    } catch (err) {
      if (id === requestId.current) setError(getErrorMessage(err));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [collection, page, perPage, filter, sort, expand, enabled]);

  useEffect(() => {
    load();
  }, [load, nonce]);

  const setPerPage = useCallback((size) => {
    setPerPageState(size);
    setPage(1);
  }, []);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  return {
    items,
    page,
    perPage,
    totalItems,
    totalPages,
    loading,
    error,
    setPage,
    setPerPage,
    reload,
  };
}

// Versi hook untuk endpoint khusus (bukan collection PocketBase) yang sudah
// mengembalikan `{ items, totalItems, totalPages, page, perPage }`.
// `fetchPage` harus stabil (bungkus dengan useCallback) dan menerima
// `{ page, perPage, q }`.
export function usePagedEndpoint(fetchPage, query = "", { perPage: initialPerPage = 25 } = {}) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [perPage, setPerPageState] = useState(initialPerPage);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);

  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError("");

    try {
      const result = await fetchPage({ page, perPage, q: query });

      if (id !== requestId.current) return;

      const rows = result?.items || [];
      setItems(rows);
      setRaw(result || null);
      setTotalItems(result?.totalItems || 0);
      setTotalPages(result?.totalPages || 0);

      if (rows.length === 0 && page > 1 && (result?.totalPages || 0) > 0) {
        setPage(result.totalPages);
      }
    } catch (err) {
      if (id === requestId.current) setError(getErrorMessage(err));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [fetchPage, page, perPage, query]);

  useEffect(() => {
    load();
  }, [load, nonce]);

  const setPerPage = useCallback((size) => {
    setPerPageState(size);
    setPage(1);
  }, []);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  return {
    items,
    page,
    perPage,
    totalItems,
    totalPages,
    raw,
    loading,
    error,
    setPage,
    setPerPage,
    reload,
  };
}

// Nilai yang tertunda sesaat, dipakai untuk pencarian agar tidak memanggil
// server pada setiap ketukan tombol.
export function useDebouncedValue(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
