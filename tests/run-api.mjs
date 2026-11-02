// Boot PocketBase terisolasi, jalankan seluruh test API, lalu bersihkan.
import { spawn } from "node:child_process";
import { startPocketBase } from "./lib/pocketbase-server.mjs";

// Suite API berjalan pada mode vendor supaya route /api/itsm/platform/* aktif.
// Perilaku mode standalone diuji terpisah dengan instance PocketBase sendiri.
process.env.TENANCY_MODE = process.env.TENANCY_MODE || "vendor";

const server = await startPocketBase();
console.log(`[test:api] PocketBase siap di ${server.url}`);

const extraArgs = process.argv.slice(2);
const child = spawn(
  process.execPath,
  ["--test", "--test-reporter=spec", "tests/api/*.test.mjs", ...extraArgs],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      PB_URL: server.url,
      PB_ADMIN_EMAIL: server.superuser.email,
      PB_ADMIN_PASSWORD: server.superuser.password,
    },
  }
);

let shuttingDown = false;

async function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;

  if (child.exitCode === null) child.kill();

  await server.stop().catch((error) => {
    console.error("[test:api] gagal membersihkan PocketBase:", error.message);
  });

  process.exit(code);
}

process.on("SIGINT", () => void shutdown(130));
process.on("SIGTERM", () => void shutdown(143));

child.on("exit", (code, signal) => {
  if (signal) console.error(`[test:api] test berhenti karena sinyal ${signal}`);
  void shutdown(code ?? 1);
});
