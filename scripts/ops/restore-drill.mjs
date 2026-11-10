// Latihan restore lokal (S0-3).
//
// Alur: nyalakan PocketBase sementara -> buat data contoh (tenant, unit,
// pengguna, tiket, lampiran) -> buat backup ZIP -> hentikan server -> ekstrak
// ZIP ke direktori data baru -> nyalakan PocketBase dari hasil restore ->
// verifikasi health, login, jumlah record, tiket, dan lampiran.
//
// Ini BUKAN pengganti uji restore produksi: data yang dipakai sintetis dan
// berjalan di mesin operator. Gunakan prosedur yang sama di staging dengan
// backup produksi sebelum pilot, lalu catat hasilnya di docs/restore-tests/.
//
// Jalankan: npm run ops:restore-drill
import { spawnSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { ApiClient } from "../../tests/lib/api-client.mjs";
import { startPocketBase } from "../../tests/lib/pocketbase-server.mjs";

const PASSWORD = "LatihanRestore123!";
const DRILL_EMAIL = `restore.drill.${Date.now()}@uji.local`;
const TICKET_TITLE = "Tiket latihan restore";
const workRoot = await mkdtemp(path.join(os.tmpdir(), "itsm-restore-drill-"));

function log(step, message) {
  console.log(`[restore-drill] ${step}: ${message}`);
}

function extractZip(zip, destination) {
  const commands =
    process.platform === "win32"
      ? [["tar", ["-xf", zip, "-C", destination]]]
      : [
          ["unzip", ["-q", zip, "-d", destination]],
          ["tar", ["-xf", zip, "-C", destination]],
        ];
  const errors = [];

  for (const [command, args] of commands) {
    const result = spawnSync(command, args, { encoding: "utf8" });

    if (result.status === 0) return;

    errors.push(
      `${command}: ${String(result.stderr || result.error || "gagal").trim()}`
    );
  }

  throw new Error(`Tidak dapat mengekstrak backup ZIP:\n${errors.join("\n")}`);
}

async function count(admin, collection, filter) {
  const page = await admin.list(collection, { filter, perPage: 1 });
  return page.totalItems;
}

async function latestBackup(admin) {
  const backups = await admin.json("GET", "/api/backups");

  if (!Array.isArray(backups) || backups.length === 0) {
    throw new Error("PocketBase tidak membuat berkas backup");
  }

  return backups.sort((left, right) =>
    String(left.key).localeCompare(String(right.key))
  )[backups.length - 1];
}

async function main() {
  const startedAt = new Date();
  const timings = {};
  const sourceDir = path.join(workRoot, "source");
  const targetDir = path.join(workRoot, "target");
  let backupPath = "";
  let backupSize = 0;
  let source;
  let target;

  try {
    log("1/7", "menyalakan PocketBase sumber dengan data sintetis");
    const sourceStart = performance.now();
    source = await startPocketBase({ dataDir: sourceDir });
    timings.source_start_ms = Math.round(performance.now() - sourceStart);

    const sourceAdmin = new ApiClient(source.url);
    await sourceAdmin.loginSuperuser(
      source.superuser.email,
      source.superuser.password
    );

    const tenant = await sourceAdmin.create("tenants", {
      name: "RS Latihan Restore",
      code: "DRILL-RS",
      timezone: "Asia/Jakarta",
      is_active: true,
    });

    const unit = await sourceAdmin.create("units", {
      tenant: tenant.id,
      name: "IT",
      code: "IT",
      kind: "support",
      is_active: true,
    });

    await sourceAdmin.create("users", {
      email: DRILL_EMAIL,
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      emailVisibility: true,
      verified: true,
      name: "Pengguna Latihan Restore",
      role: "requester",
      tenant: tenant.id,
      unit: unit.id,
      is_active: true,
    });

    const userClient = new ApiClient(source.url);
    await userClient.login(DRILL_EMAIL, PASSWORD);

    const ticket = await userClient.json("POST", "/api/itsm/tickets", {
      body: {
        type: "incident",
        title: TICKET_TITLE,
        description:
          "Tiket ini dibuat oleh skrip ops:restore-drill untuk membuktikan data ikut pulih.",
        impact: "operational",
        patient_data_confirmed: true,
      },
    });

    const form = new FormData();
    form.append(
      "file",
      new Blob(["bukti lampiran restore\n"], { type: "text/plain" }),
      "bukti-restore.txt"
    );
    form.append("visibility", "public");
    await userClient.request(
      "POST",
      `/api/itsm/tickets/${ticket.id}/attachments`,
      { form }
    );

    const before = {
      tenants: await count(sourceAdmin, "tenants"),
      users: await count(sourceAdmin, "users"),
      tickets: await count(sourceAdmin, "tickets"),
      attachments: await count(sourceAdmin, "ticket_attachments"),
      audit_logs: await count(sourceAdmin, "audit_logs"),
      ticket_title: TICKET_TITLE,
    };

    log("2/7", "membuat backup ZIP");
    const backupStart = performance.now();
    await sourceAdmin.json("POST", "/api/backups", { body: {} });
    const backup = await latestBackup(sourceAdmin);
    timings.backup_create_ms = Math.round(performance.now() - backupStart);

    backupPath = path.join(workRoot, "backup.zip");
    const sourceBackup = path.join(source.dataDir, "backups", backup.key);
    await copyFile(sourceBackup, backupPath);
    backupSize = (await stat(backupPath)).size;

    log("3/7", `menghentikan sumber (${(backupSize / 1024).toFixed(0)} KB)`);
    await source.stop();
    source = null;

    log("4/7", "mengekstrak backup ke direktori data baru");
    await mkdir(targetDir, { recursive: true });
    const extractStart = performance.now();
    extractZip(backupPath, targetDir);
    timings.extract_ms = Math.round(performance.now() - extractStart);

    const extracted = await readdir(targetDir);
    if (!extracted.includes("data.db")) {
      throw new Error("Hasil ekstrak tidak memiliki data.db");
    }

    log("5/7", "menyalakan PocketBase dari hasil restore");
    const restoreStart = performance.now();
    target = await startPocketBase({ dataDir: targetDir });
    timings.restore_start_ms = Math.round(performance.now() - restoreStart);

    const targetAdmin = new ApiClient(target.url);
    await targetAdmin.loginSuperuser(
      target.superuser.email,
      target.superuser.password
    );

    const health = await fetch(`${target.url}/api/health`);
    if (!health.ok) throw new Error(`Health hasil restore ${health.status}`);

    // Hitung record sebelum login pengguna: login menambah satu baris audit.
    const afterCounts = {
      tenants: await count(targetAdmin, "tenants"),
      users: await count(targetAdmin, "users"),
      tickets: await count(targetAdmin, "tickets"),
      attachments: await count(targetAdmin, "ticket_attachments"),
      audit_logs: await count(targetAdmin, "audit_logs"),
    };

    const targetClient = new ApiClient(target.url);
    await targetClient.login(DRILL_EMAIL, PASSWORD);
    const profile = await targetClient.json("GET", "/api/itsm/profile");

    const restoredTicket = await targetAdmin.json(
      "GET",
      `/api/collections/tickets/records/${ticket.id}`
    );

    const after = {
      ...afterCounts,
      ticket_title: restoredTicket.title,
      login_name: profile.name,
    };

    const checks = {
      health_ok: health.ok,
      login_ok: profile.email === DRILL_EMAIL,
      ticket_restored: restoredTicket.title === TICKET_TITLE,
      counts_match:
        before.tenants === after.tenants &&
        before.users === after.users &&
        before.tickets === after.tickets &&
        before.attachments === after.attachments &&
        before.audit_logs === after.audit_logs,
    };

    log("6/7", "memverifikasi");
    console.log(
      JSON.stringify(
        {
          date: startedAt.toISOString(),
          pocketbase: "0.40.5",
          environment: `${process.platform} ${os.release()}`,
          backup: {
            key: backup.key,
            bytes: backupSize,
          },
          before,
          after,
          checks,
          timings,
        },
        null,
        2
      )
    );

    if (Object.values(checks).some((value) => !value)) {
      throw new Error("Satu atau lebih pemeriksaan restore gagal");
    }

    log("7/7", "SELESAI — semua pemeriksaan lulus");
  } finally {
    if (target) await target.stop().catch(() => {});
    if (source) await source.stop().catch(() => {});
    await rm(workRoot, { recursive: true, force: true }).catch(() => {});
  }
}

// Dipanggil setelah semua helper didefinisikan.
main().catch((error) => {
  console.error(`[restore-drill] GAGAL: ${error.message}`);
  process.exitCode = 1;
});
