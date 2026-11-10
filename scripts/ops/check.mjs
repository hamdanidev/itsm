// Pemeriksaan operasional ringan untuk S0-3/S0-6.
//
// Memeriksa health endpoint, kesegaran backup ZIP terakhir, dan ruang disk.
// Cocok dijalankan cron di host, sebagai probe Uptime Kuma, atau sebelum
// maintenance. Exit code 1 bila ada kegagalan; warning tidak menggagalkan.
//
// Contoh:
//   npm run ops:check
//   node scripts/ops/check.mjs --url https://itsm.rs.example.com \
//     --backup-dir /srv/backups --data-dir /var/lib/docker/volumes/.../_data
//   node scripts/ops/check.mjs --json
import { statfs, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOUR_MS = 60 * 60 * 1000;

function parseArgs(argv) {
  const args = {
    url: process.env.OPS_URL || "http://127.0.0.1:8090",
    backupDir: process.env.OPS_BACKUP_DIR || "backups",
    dataDir: process.env.OPS_DATA_DIR || "backend/pb_data",
    maxBackupAgeHours: Number(process.env.OPS_MAX_BACKUP_AGE_HOURS || 26),
    diskWarn: Number(process.env.OPS_DISK_WARN || 80),
    diskCritical: Number(process.env.OPS_DISK_CRITICAL || 90),
    pushUrl: process.env.OPS_PUSH_URL || "",
    timeoutMs: 5000,
    json: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    const next = () => argv[++index];

    if (flag === "--url") args.url = next();
    else if (flag === "--backup-dir") args.backupDir = next();
    else if (flag === "--data-dir") args.dataDir = next();
    else if (flag === "--max-backup-age-hours") args.maxBackupAgeHours = Number(next());
    else if (flag === "--disk-warn") args.diskWarn = Number(next());
    else if (flag === "--disk-critical") args.diskCritical = Number(next());
    else if (flag === "--push-url") args.pushUrl = next();
    else if (flag === "--timeout") args.timeoutMs = Number(next());
    else if (flag === "--json") args.json = true;
    else if (flag === "--help") args.help = true;
  }

  return args;
}

// Fungsi murni agar bisa diuji tanpa filesystem/jaringan.
export function evaluateBackup({ files, now, maxAgeHours }) {
  const zips = (files || []).filter((file) => /\.zip$/i.test(file.name));

  if (zips.length === 0) {
    return {
      ok: false,
      level: "fail",
      message: "Tidak ada berkas backup .zip",
      ageHours: null,
      name: "",
      bytes: 0,
    };
  }

  const latest = zips.slice().sort((left, right) => right.mtimeMs - left.mtimeMs)[0];
  const ageHours = (now - latest.mtimeMs) / HOUR_MS;

  if (!latest.size) {
    return {
      ok: false,
      level: "fail",
      message: "Backup terbaru berukuran 0 byte",
      ageHours,
      name: latest.name,
      bytes: 0,
    };
  }

  if (ageHours > maxAgeHours) {
    return {
      ok: false,
      level: "fail",
      message: `Backup terbaru berumur ${ageHours.toFixed(1)} jam (batas ${maxAgeHours} jam)`,
      ageHours,
      name: latest.name,
      bytes: latest.size,
    };
  }

  return {
    ok: true,
    level: "ok",
    message: `Backup terbaru ${latest.name} (${ageHours.toFixed(1)} jam lalu)`,
    ageHours,
    name: latest.name,
    bytes: latest.size,
  };
}

export function evaluateDisk({ totalBytes, freeBytes, warnPct, criticalPct }) {
  if (!totalBytes || totalBytes <= 0) {
    return {
      ok: false,
      level: "warn",
      message: "Ukuran disk tidak terbaca",
      usedPct: null,
      freeBytes: 0,
      totalBytes: 0,
    };
  }

  const usedPct = ((totalBytes - freeBytes) / totalBytes) * 100;

  if (usedPct >= criticalPct) {
    return {
      ok: false,
      level: "fail",
      message: `Disk terpakai ${usedPct.toFixed(1)}% (critical ≥${criticalPct}%)`,
      usedPct,
      freeBytes,
      totalBytes,
    };
  }

  if (usedPct >= warnPct) {
    return {
      ok: false,
      level: "warn",
      message: `Disk terpakai ${usedPct.toFixed(1)}% (warning ≥${warnPct}%)`,
      usedPct,
      freeBytes,
      totalBytes,
    };
  }

  return {
    ok: true,
    level: "ok",
    message: `Disk terpakai ${usedPct.toFixed(1)}%`,
    usedPct,
    freeBytes,
    totalBytes,
  };
}

async function checkHealth(args) {
  const started = Date.now();

  try {
    const response = await fetch(`${args.url.replace(/\/+$/, "")}/api/health`, {
      signal: AbortSignal.timeout(args.timeoutMs),
    });
    const latencyMs = Date.now() - started;

    if (!response.ok) {
      return {
        ok: false,
        level: "fail",
        message: `Health ${response.status}`,
        latencyMs,
      };
    }

    return {
      ok: true,
      level: "ok",
      message: `Health 200 (${latencyMs} ms)`,
      latencyMs,
    };
  } catch (error) {
    return {
      ok: false,
      level: "fail",
      message: `Health tidak dapat dihubungi: ${error.message}`,
      latencyMs: Date.now() - started,
    };
  }
}

async function checkBackup(args) {
  try {
    const names = await readdir(args.backupDir);
    const files = [];

    for (const name of names) {
      const info = await stat(path.join(args.backupDir, name));
      if (info.isFile()) {
        files.push({ name, size: info.size, mtimeMs: info.mtimeMs });
      }
    }

    return evaluateBackup({
      files,
      now: Date.now(),
      maxAgeHours: args.maxBackupAgeHours,
    });
  } catch (error) {
    return {
      ok: false,
      level: "fail",
      message: `Direktori backup tidak terbaca: ${error.message}`,
      ageHours: null,
      name: "",
      bytes: 0,
    };
  }
}

async function checkDisk(args) {
  try {
    const info = await statfs(args.dataDir);
    return evaluateDisk({
      totalBytes: info.blocks * info.bsize,
      freeBytes: info.bavail * info.bsize,
      warnPct: args.diskWarn,
      criticalPct: args.diskCritical,
    });
  } catch (error) {
    return {
      ok: false,
      level: "warn",
      message: `Disk tidak dapat diperiksa: ${error.message}`,
      usedPct: null,
      freeBytes: 0,
      totalBytes: 0,
    };
  }
}

// URL heartbeat untuk Uptime Kuma "Push" monitor. Token ada di path dan tidak
// boleh dicetak ke log.
export function buildPushUrl(baseUrl, { status, message, ping }) {
  const url = new URL(baseUrl);

  url.searchParams.set(
    "status",
    status === "down" || status === "fail" ? "down" : "up"
  );
  url.searchParams.set("msg", String(message || "").slice(0, 500));
  if (Number.isFinite(Number(ping))) {
    url.searchParams.set("ping", String(Math.max(0, Math.round(Number(ping)))));
  }

  return url.toString();
}

export async function pushHeartbeat(baseUrl, report, timeoutMs = 5000) {
  if (!baseUrl) {
    return { ok: true, level: "ok", skipped: true, message: "Push URL tidak diatur" };
  }

  const parts = [];
  for (const [name, result] of Object.entries({
    health: report.health,
    backup: report.backup,
    disk: report.disk,
  })) {
    if (!result || result.level === "ok") continue;
    parts.push(`${name}: ${result.message}`);
  }

  const message =
    parts.length > 0
      ? parts.join(" | ")
      : "health, backup, dan disk normal";
  const status = report.status === "fail" ? "down" : "up";
  let url;

  try {
    url = buildPushUrl(baseUrl, {
      status,
      message,
      ping: report.health?.latencyMs,
    });
  } catch (error) {
    return {
      ok: false,
      level: "fail",
      message: `Push URL tidak valid: ${error.message}`,
      status,
    };
  }

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });

    if (!response.ok) {
      return {
        ok: false,
        level: "fail",
        message: `Push heartbeat gagal (${response.status})`,
        status,
      };
    }

    return {
      ok: true,
      level: "ok",
      message: `Push heartbeat terkirim (${status})`,
      status,
    };
  } catch (error) {
    return {
      ok: false,
      level: "fail",
      message: `Push heartbeat gagal: ${error.message}`,
      status,
    };
  }
}

function printResult(name, result, useJson) {
  if (useJson) return;

  const tag =
    result.level === "fail" ? "FAIL" : result.level === "warn" ? "WARN" : "OK";
  console.log(`[${tag}] ${name}: ${result.message}`);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(
      "Usage: node scripts/ops/check.mjs [--url URL] [--backup-dir DIR] " +
        "[--data-dir DIR] [--max-backup-age-hours N] [--disk-warn PCT] " +
        "[--disk-critical PCT] [--push-url URL] [--json]"
    );
    return;
  }

  const health = await checkHealth(args);
  const backup = await checkBackup(args);
  const disk = await checkDisk(args);
  const checksFailed = [health, backup, disk].some(
    (result) => result.level === "fail"
  );
  const warned = [health, backup, disk].some(
    (result) => result.level === "warn"
  );
  const report = {
    checked_at: new Date().toISOString(),
    url: args.url,
    backup_dir: args.backupDir,
    data_dir: args.dataDir,
    status: checksFailed ? "fail" : warned ? "warn" : "ok",
    health,
    backup,
    disk,
  };

  report.push = await pushHeartbeat(args.pushUrl, report);
  const failed = checksFailed || report.push.level === "fail";
  report.status = failed ? "fail" : warned ? "warn" : "ok";

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printResult("health", health, false);
    printResult("backup", backup, false);
    printResult("disk", disk, false);
    if (!report.push.skipped) printResult("push", report.push, false);
  }

  if (failed) process.exitCode = 1;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  run().catch((error) => {
    console.error(`[ops:check] GAGAL: ${error.message}`);
    process.exitCode = 1;
  });
}
