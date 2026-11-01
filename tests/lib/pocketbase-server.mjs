// Menjalankan PocketBase terisolasi untuk pengujian: data dir sementara,
// migrasi + seed dari backend/pb_migrations, dan superuser sendiri.
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import {
  ensurePocketBase,
  hooksDir,
  migrationsDir,
  rootDir,
} from "../../scripts/lib/pocketbase.mjs";

export const SUPERUSER = {
  email: "admin@uji.local",
  password: "RahasiaUji123!",
};

export async function freePort() {
  const server = net.createServer();

  return new Promise((resolve, reject) => {
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function createSuperuser(binary, dataDir) {
  const result = spawnSync(
    binary,
    [
      "superuser",
      "upsert",
      SUPERUSER.email,
      SUPERUSER.password,
      `--dir=${dataDir}`,
      `--migrationsDir=${migrationsDir}`,
      `--hooksDir=${hooksDir}`,
    ],
    { cwd: rootDir, encoding: "utf8" }
  );

  if (result.status !== 0) {
    throw new Error(
      `Gagal membuat superuser uji (exit ${result.status}):\n` +
        `${result.stdout || ""}\n${result.stderr || ""}`
    );
  }
}

async function waitForHealth(url, timeoutMs, readLogs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/health`, {
        signal: AbortSignal.timeout(1500),
      });
      if (response.ok) return true;
    } catch {
      // Masih boot.
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(
    `PocketBase tidak siap dalam ${timeoutMs} ms.\n${readLogs().slice(-4000)}`
  );
}

async function stopChild(child) {
  if (child.exitCode !== null) return;

  child.kill();

  const timeout = new Promise((resolve) => setTimeout(resolve, 5000));
  await Promise.race([once(child, "exit"), timeout]);

  if (child.exitCode === null) child.kill("SIGKILL");
}

export async function startPocketBase({ dataDir, port, timeoutMs = 60_000 } = {}) {
  const binary = await ensurePocketBase();
  const dir = dataDir || (await mkdtemp(path.join(os.tmpdir(), "itsm-pb-")));
  const listenPort = port || (await freePort());

  createSuperuser(binary, dir);

  const child = spawn(
    binary,
    [
      "serve",
      `--http=127.0.0.1:${listenPort}`,
      `--dir=${dir}`,
      `--migrationsDir=${migrationsDir}`,
      `--hooksDir=${hooksDir}`,
      "--automigrate=true",
      // Instance uji memakai origin bebas: request tetap melewati proxy Vite,
      // dan port web e2e dipilih acak agar tidak bentrok dengan dev server.
      "--origins=*",
    ],
    { cwd: rootDir, stdio: ["ignore", "pipe", "pipe"] }
  );

  const logs = [];
  const collect = (chunk) => {
    logs.push(String(chunk));
    if (!process.env.TEST_VERBOSE && logs.length > 400) logs.shift();
  };

  child.stdout.on("data", collect);
  child.stderr.on("data", collect);

  const url = `http://127.0.0.1:${listenPort}`;
  const readLogs = () => logs.join("");

  try {
    await waitForHealth(url, timeoutMs, readLogs);
  } catch (error) {
    await stopChild(child);
    throw error;
  }

  return {
    url,
    dataDir: dir,
    port: listenPort,
    superuser: { ...SUPERUSER },
    logs: readLogs,
    async stop() {
      await stopChild(child);

      if (process.env.TEST_KEEP_DATA !== "1") {
        await rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    },
  };
}
