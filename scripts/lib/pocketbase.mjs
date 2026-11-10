import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);
export const backendDir = path.join(rootDir, "backend");
// `PB_DATA_DIR` memungkinkan instance terpisah (mis. pengambilan screenshot
// panduan) memakai direktori data sendiri, sehingga instalasi rumah sakit di
// `backend/pb_data` tidak pernah tersentuh.
export const dataDir = process.env.PB_DATA_DIR
  ? path.resolve(rootDir, process.env.PB_DATA_DIR)
  : path.join(backendDir, "pb_data");
export const migrationsDir = path.join(backendDir, "pb_migrations");
export const hooksDir = path.join(backendDir, "pb_hooks");
export const binDir = path.join(backendDir, ".bin");
// Basis data zona IANA (TZif) yang dibundel. Go membacanya lewat `ZONEINFO`,
// sehingga perhitungan SLA tidak bergantung pada paket `tzdata` sistem — di
// Windows jalur sistem itu tidak ada, dan tanpa ini semua zona non-UTC akan
// diam-diam menjadi UTC.
export const zoneinfoPath = path.join(backendDir, "zoneinfo.zip");

const DEFAULT_PB_VERSION = "0.40.5";
const HEALTH_PATH = "/api/health";

function readDotEnv() {
  const file = path.join(rootDir, ".env");
  const values = {};

  if (!existsSync(file)) return values;

  try {
    for (const rawLine of readFileSync(file, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) continue;

      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      values[match[1]] = value;
    }
  } catch {
    // A broken/unreadable .env should not block local development.
  }

  return values;
}

const dotEnv = readDotEnv();

export const pbVersion =
  process.env.PB_VERSION || dotEnv.PB_VERSION || DEFAULT_PB_VERSION;

function platformAsset(version = pbVersion) {
  const osName = { win32: "windows", darwin: "darwin", linux: "linux" }[
    process.platform
  ];
  const arch = { x64: "amd64", arm64: "arm64", ia32: "386", arm: "armv7" }[
    process.arch
  ];

  if (!osName || !arch) {
    throw new Error(
      `Platform ${process.platform}/${process.arch} belum didukung oleh PocketBase. ` +
        `Unduh manual lalu taruh binary di ${binDir}.`
    );
  }

  const name = `pocketbase_${version}_${osName}_${arch}.zip`;

  return {
    name,
    url: `https://github.com/pocketbase/pocketbase/releases/download/v${version}/${name}`,
    checksumsUrl: `https://github.com/pocketbase/pocketbase/releases/download/v${version}/checksums.txt`,
  };
}

export function binaryPath() {
  return path.join(
    binDir,
    process.platform === "win32" ? "pocketbase.exe" : "pocketbase"
  );
}

async function downloadFile(url, destination) {
  const response = await fetch(url, { redirect: "follow" });

  if (!response.ok) {
    throw new Error(
      `Gagal mengunduh ${url} (HTTP ${response.status}). ` +
        "Periksa koneksi internet atau set PB_VERSION."
    );
  }

  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

async function verifyChecksum(zipPath, asset) {
  if (process.env.PB_SKIP_CHECKSUM === "1") {
    console.warn(
      "[pocketbase] Verifikasi checksum dilewati (PB_SKIP_CHECKSUM=1)."
    );
    return;
  }

  const response = await fetch(asset.checksumsUrl, { redirect: "follow" });

  if (!response.ok) {
    throw new Error(
      `Gagal mengunduh checksums.txt (HTTP ${response.status}). ` +
        "Set PB_SKIP_CHECKSUM=1 untuk melewati verifikasi."
    );
  }

  const line = (await response.text())
    .split(/\r?\n/)
    .find((entry) => entry.trim().endsWith(asset.name));

  if (!line) {
    throw new Error(`Checksum untuk ${asset.name} tidak ditemukan.`);
  }

  const expected = line.trim().split(/\s+/)[0].toLowerCase();
  const actual = createHash("sha256")
    .update(await readFile(zipPath))
    .digest("hex");

  if (actual !== expected) {
    throw new Error(
      `Checksum tidak cocok untuk ${asset.name}.\n` +
        `  expected: ${expected}\n  actual:   ${actual}`
    );
  }

  console.log(`[pocketbase] Checksum sha256 OK (${asset.name}).`);
}

function extractZip(zipPath, destination) {
  let result;

  if (process.platform === "win32") {
    const escapedZip = zipPath.replace(/'/g, "''");
    const escapedDest = destination.replace(/'/g, "''");
    result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Expand-Archive -LiteralPath '${escapedZip}' -DestinationPath '${escapedDest}' -Force`,
      ],
      { stdio: "inherit" }
    );
  } else {
    result = spawnSync("unzip", ["-o", "-q", zipPath, "-d", destination], {
      stdio: "inherit",
    });
  }

  if (result.error || result.status !== 0) {
    throw new Error(
      `Gagal mengekstrak ${zipPath}. ` +
        `Ekstrak manual lalu taruh binary di ${binDir}.`
    );
  }
}

export async function ensurePocketBase() {
  const binary = binaryPath();
  const versionFile = path.join(binDir, ".version");

  if (existsSync(binary)) {
    const installedVersion = existsSync(versionFile)
      ? (await readFile(versionFile, "utf8")).trim()
      : "";

    // No marker: the binary was placed there manually. Assume it is usable.
    if (!installedVersion) {
      await writeFile(versionFile, pbVersion);
      return binary;
    }

    if (installedVersion === pbVersion) return binary;

    console.log(
      `[pocketbase] Versi terpasang ${installedVersion}, beralih ke ${pbVersion}...`
    );
  }

  const asset = platformAsset();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pb-itsm-"));
  const zipPath = path.join(tempDir, asset.name);

  try {
    console.log(
      `[pocketbase] Mengunduh PocketBase v${pbVersion} ` +
        `(${process.platform}/${process.arch})...`
    );
    await downloadFile(asset.url, zipPath);
    await verifyChecksum(zipPath, asset);
    await mkdir(binDir, { recursive: true });
    extractZip(zipPath, binDir);

    if (!existsSync(binary)) {
      throw new Error(`Binary tidak ditemukan setelah ekstraksi ${zipPath}.`);
    }

    if (process.platform !== "win32") {
      await chmod(binary, 0o755);
    }

    await writeFile(versionFile, pbVersion);
    console.log(`[pocketbase] Siap: ${binary}`);
    return binary;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export function serveArgs(extraArgs = []) {
  const http = process.env.PB_HTTP || "127.0.0.1:8090";
  const origins =
    process.env.DEV_ORIGINS ||
    "http://localhost:5173,http://127.0.0.1:5173";

  return [
    "serve",
    `--http=${http}`,
    `--dir=${dataDir}`,
    `--migrationsDir=${migrationsDir}`,
    `--hooksDir=${hooksDir}`,
    "--automigrate=true",
    `--origins=${origins}`,
    ...(process.env.PB_DEBUG === "1" ? ["--dev"] : []),
    ...extraArgs,
  ];
}

export async function spawnPocketBase(extraArgs = []) {
  const binary = await ensurePocketBase();
  await mkdir(dataDir, { recursive: true });

  return spawn(binary, serveArgs(extraArgs), {
    cwd: rootDir,
    stdio: "inherit",
    // `.env` diteruskan juga ke PocketBase supaya `TENANCY_MODE` (dan setelan
    // lain) berlaku sama seperti instalasi Docker. Environment shell menang.
    env: {
      ...dotEnv,
      ...process.env,
      TZ: process.env.TZ || "Asia/Jakarta",
      ZONEINFO: process.env.ZONEINFO || zoneinfoPath,
      // Tautan email di dev harus mengarah ke Vite, bukan port PocketBase.
      APP_URL:
        process.env.APP_URL || dotEnv.APP_URL || "http://localhost:5173",
    },
  });
}

export function healthUrl() {
  const http = process.env.PB_HTTP || "127.0.0.1:8090";
  return `http://${http}${HEALTH_PATH}`;
}

export async function waitForPocketBase({ timeoutMs = 30_000 } = {}) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(healthUrl(), {
        signal: AbortSignal.timeout(1_500),
      });
      if (response.ok) return true;
    } catch {
      // PocketBase is still booting.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return false;
}

export async function runPocketBase(args, label = "pocketbase") {
  const binary = await ensurePocketBase();
  await mkdir(dataDir, { recursive: true });

  const child = spawn(binary, args, {
    cwd: rootDir,
    stdio: "inherit",
    env: {
      ...dotEnv,
      ...process.env,
      TZ: process.env.TZ || "Asia/Jakarta",
      ZONEINFO: process.env.ZONEINFO || zoneinfoPath,
    },
  });

  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} keluar dengan kode ${code}.`));
    });
  });
}

export async function fileExists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}
