import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// PB_TARGET dipakai test e2e agar dev server menunjuk PocketBase sementara,
// bukan instance dev di 127.0.0.1:8090.
const pbTarget = process.env.PB_TARGET || "http://127.0.0.1:8090";
const devPort = Number(process.env.VITE_DEV_PORT || 5173);

export default defineConfig({
  plugins: [react()],
  server: {
    port: devPort,
    strictPort: true,
    proxy: {
      "/api": {
        target: pbTarget,
        changeOrigin: true,
      },
      "/_": {
        target: pbTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
  },
});
