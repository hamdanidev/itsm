#!/usr/bin/env node
/**
 * Menjalankan PocketBase (native binary) + Vite sekaligus untuk development.
 * Tidak membutuhkan Docker.
 *
 *   npm run dev            PocketBase + frontend
 *   npm run dev:pb         PocketBase saja
 *   npm run dev:web        Frontend saja (butuh PocketBase terpisah)
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  dataDir,
  fileExists,
  healthUrl,
  rootDir,
  spawnPocketBase,
  waitForPocketBase,
} from "./lib/pocketbase.mjs";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Penggunaan: npm run dev -- [opsi]

  (tanpa opsi)   PocketBase + Vite
  --pb-only      PocketBase saja
  --web-only     Vite saja

PocketBase diunduh otomatis ke backend/.bin (pin v0.40.5, checksum diverifikasi).
Data lokal: backend/pb_data
`);
  process.exit(0);
}

const mode = args.includes("--pb-only")
  ? "pb"
  : args.includes("--web-only")
    ? "web"
    : "both";

const children = [];
let shuttingDown = false;

function label() {
  return "[dev]";
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
    return;
  }

  child.kill("SIGTERM");
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) killTree(child);

  setTimeout(() => process.exit(code), 250).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function startFrontend() {
  const frontendDir = path.join(rootDir, "frontend");
  const viteBin = path.join(frontendDir, "node_modules", "vite", "bin", "vite.js");

  if (!existsSync(viteBin)) {
    throw new Error(
      "Dependensi frontend belum terpasang. Jalankan: cd frontend && npm install"
    );
  }

  const child = spawn(process.execPath, [viteBin], {
    cwd: frontendDir,
    stdio: "inherit",
  });

  children.push(child);
  child.on("exit", (code) => {
    if (!shuttingDown) shutdown(code ?? 1);
  });

  return child;
}

async function main() {
  if (mode !== "web") {
    const firstRun = !(await fileExists(path.join(dataDir, "data.db")));
    const pocketbase = await spawnPocketBase();

    children.push(pocketbase);
    pocketbase.on("exit", (code) => {
      if (!shuttingDown) shutdown(code ?? 1);
    });

    console.log(`${label()} Menunggu PocketBase siap...`);

    if (!(await waitForPocketBase())) {
      throw new Error(
        `PocketBase tidak merespons di ${healthUrl()}. ` +
          "Port 8090 mungkin sedang dipakai proses lain; hentikan proses tersebut lalu ulangi."
      );
    }

    console.log(`${label()} PocketBase : http://127.0.0.1:8090/_/`);
    console.log(`${label()} Health     : ${healthUrl()}`);

    if (firstRun) {
      console.log(`
${label()} Database dev baru dibuat.
${label()} Buat superuser (sekali saja):

  npm run pb:superuser -- admin@itsm.local "PasswordKuat123!"

${label()} Lalu login di Admin UI untuk membuat akun staff.
`);
    }
  }

  if (mode !== "pb") {
    await startFrontend();
    console.log(`${label()} Frontend   : http://localhost:5173`);
    console.log(`${label()} Tekan Ctrl+C untuk menghentikan semuanya.`);
  }
}

main().catch((error) => {
  console.error(`${label()} ${error.message}`);
  shutdown(1);
});
