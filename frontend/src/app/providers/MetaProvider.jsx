import { createContext, useContext, useEffect, useState } from "react";
import { pb } from "../../lib/pocketbase";

const MetaContext = createContext({
  mode: "standalone",
  isVendor: false,
  ready: false,
});

// Mode tenancy dibaca sekali saat aplikasi dimuat. Gagal memuat meta tidak boleh
// memblokir aplikasi: default ke standalone (tampilan paling terbatas).
export function MetaProvider({ children }) {
  const [meta, setMeta] = useState({
    mode: "standalone",
    isVendor: false,
    ready: false,
  });

  useEffect(() => {
    let active = true;

    pb.send("/api/itsm/app-meta")
      .then((payload) => {
        if (!active) return;
        setMeta({
          mode: payload?.mode === "vendor" ? "vendor" : "standalone",
          isVendor: payload?.mode === "vendor",
          ready: true,
        });
      })
      .catch(() => {
        if (active) setMeta({ mode: "standalone", isVendor: false, ready: true });
      });

    return () => {
      active = false;
    };
  }, []);

  return <MetaContext.Provider value={meta}>{children}</MetaContext.Provider>;
}

export function useMeta() {
  return useContext(MetaContext);
}
