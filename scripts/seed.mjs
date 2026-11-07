#!/usr/bin/env node
/**
 * Seed data manual untuk Healthcare ITSM.
 *
 *   npm run seed                      # profil "small" di rumah sakit demo
 *   npm run seed -- --profile busy    # ±150 tiket dalam 3 bulan
 *   npm run seed -- --reset --yes     # bersihkan data demo lalu seed ulang
 *   npm run seed:tiny                 # 8 tiket, satu per status penting
 *
 * Jalankan PocketBase lebih dulu (`npm run dev`). Superuser dibutuhkan untuk
 * membuat akun demo dan memundurkan waktu record; lihat README bagian "Seed
 * data manual".
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ApiClient, ApiError, waitForServer } from "./lib/seed/api.mjs";
import {
  DEFAULTS,
  HOSPITALS,
  PROFILES,
} from "./lib/seed/content.mjs";
import {
  confirm,
  createLogger,
  createRandom,
  humanDate,
  parseArgs,
  color,
} from "./lib/seed/util.mjs";
import {
  ensurePlatformAdmin,
  prepareOrganisation,
  resolveTenant,
} from "./lib/seed/org.mjs";
import {
  buildAgingPlan,
  buildPlans,
  buildQrPlans,
  seedTickets,
} from "./lib/seed/tickets.mjs";
import {
  artifactAgingPlans,
  seedArticles,
  seedIncidents,
  seedProblems,
} from "./lib/seed/artifacts.mjs";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

const OPTION_SPEC = {
  defaults: {
    ...DEFAULTS,
    noAge: false,
    help: false,
    webUrl: process.env.WEB_URL || "",
  },
  options: {
    profile: {
      key: "profile",
      type: "string",
      choices: Object.keys(PROFILES),
    },
    tickets: { key: "tickets", type: "number" },
    days: { key: "days", type: "number" },
    reset: { key: "reset", type: "boolean" },
    yes: { key: "yes", type: "boolean" },
    "no-age": { key: "noAge", type: "boolean" },
    quiet: { key: "quiet", type: "boolean" },
    seed: { key: "seed", type: "number" },
    "base-url": { key: "baseUrl", type: "string" },
    "superuser-email": { key: "superuserEmail", type: "string" },
    "superuser-password": { key: "superuserPassword", type: "string" },
    password: { key: "password", type: "string" },
    "email-domain": { key: "emailDomain", type: "string" },
    "tenant-code": { key: "tenantCode", type: "string" },
    "tenant-name": { key: "tenantName", type: "string" },
    hospitals: { key: "hospitals", type: "number" },
    "setup-token": { key: "setupToken", type: "string" },
    "web-url": { key: "webUrl", type: "string" },
    help: { key: "help", type: "boolean" },
  },
};

function printHelp() {
  const profileLines = Object.values(PROFILES)
    .map((profile) => `  ${profile.key.padEnd(8)} ${profile.description}`)
    .join("\n");

  console.log(`Seed data manual Healthcare ITSM

Penggunaan:
  npm run seed                          Profil "small"
  npm run seed -- --profile busy        Dataset besar untuk uji laporan
  npm run seed -- --reset --yes         Hapus data demo lalu seed ulang
  npm run seed -- --tickets 40 --days 21

Profil:
${profileLines}

Opsi:
  --profile <nama>        tiny | small | medium | busy      (default: small)
  --tickets <n>           Jumlah tiket (menimpa profil)
  --days <n>              Rentang riwayat dalam hari (menimpa profil)
  --reset                 Hapus data transaksional rumah sakit demo dulu
  --yes                   Lewati konfirmasi --reset
  --no-age                Jangan mundurkan waktu (semua data "sekarang")
  --seed <n>              Seed RNG agar dataset bisa direproduksi
  --base-url <url>        URL PocketBase (default: $PB_URL atau 127.0.0.1:8090)
  --web-url <url>         URL frontend untuk tautan di ringkasan
  --superuser-email <e>   Email superuser PocketBase (default: admin@itsm.local)
  --superuser-password <p>
  --password <p>          Password seluruh akun demo (default: SeedDemo123!)
  --email-domain <d>      Domain email akun demo rumah sakit pertama
  --tenant-code <kode>    Kode rumah sakit demo (mode vendor, default DEMO01)
  --tenant-name <nama>    Nama rumah sakit demo (mode vendor)
  --hospitals <n>         Jumlah rumah sakit demo pada mode vendor
  --setup-token <kode>    Kode setup bila instalasi belum punya akun
  --quiet                 Hanya tampilkan ringkasan akhir
  --help

Catatan:
  • Instalasi vendored: seed membuat/memakai rumah sakit demo, bukan data
    rumah sakit lain. Gunakan --hospitals 2 atau 3 untuk uji konsol vendor.
  • --reset menghapus tiket, komentar, problem, artikel, insiden, aset, dan
    titik QR milik rumah sakit demo; akun demo dan data master dipertahankan.
  • Setelah seeding, masuk dengan akun demo yang tercetak di ringkasan.
`);
}

async function ensureSuperuser(ctx) {
  const { client, opts, log } = ctx;

  try {
    await client.loginSuperuser(opts.superuserEmail, opts.superuserPassword);
    log.detail(`Superuser: ${opts.superuserEmail}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) {
      throw new Error(
        `Superuser ${opts.superuserEmail} tidak bisa login.\n` +
          `Buat superuser sekali saja:\n\n` +
          `  npm run pb:superuser -- ${opts.superuserEmail} "${opts.superuserPassword}"\n\n` +
          `Atau setel PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD (atau --superuser-email/--superuser-password).`
      );
    }

    throw error;
  }
}

async function readSetupToken(opts) {
  if (opts.setupToken) return opts.setupToken;

  try {
    const token = (
      await readFile(path.join(rootDir, "backend", "pb_data", "setup_token"), "utf8")
    ).trim();
    if (token) return token;
  } catch {
    // remote / Docker: kode harus diberikan lewat --setup-token atau env.
  }

  throw new Error(
    "Instalasi belum disiapkan dan kode setup tidak ditemukan.\n" +
      "Isi --setup-token <kode> (atau environment SETUP_TOKEN). Kode juga " +
      "tercetak di log server saat PocketBase pertama kali dijalankan."
  );
}

async function ensureSetup(ctx, meta) {
  if (!meta.setup_required) return meta;

  const { client, opts, log } = ctx;
  const token = await readSetupToken(opts);
  const hospital = HOSPITALS[0];
  const domain = opts.emailDomain || hospital.domain;

  const body =
    meta.mode === "vendor"
      ? {
          token,
          account: {
            name: "Admin Vendor Seed",
            email: `vendor.seed@${domain}`,
            password: opts.password,
          },
        }
      : {
          token,
          hospital: {
            name: String(opts.tenantName || hospital.name).trim(),
            code: normalizeCode(opts.tenantCode || hospital.code),
            timezone: hospital.timezone,
          },
          account: {
            name: "Andi Pratama",
            email: `lead.it@${domain}`,
            password: opts.password,
          },
        };

  try {
    const result = await client.json("POST", "/api/itsm/setup", { body });
    log.success(
      `Setup awal selesai (${result.mode}). Akun pertama dibuat untuk ${meta.mode === "vendor" ? "akun platform" : "Kepala IT"}.`
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      // Balapan dengan proses lain: setup ternyata sudah selesai.
      return (await client.get("/api/itsm/app-meta")) || meta;
    }
    throw error;
  }

  return client.get("/api/itsm/app-meta");
}

async function preflightDevRoute(admin) {
  try {
    await admin.json("POST", "/api/itsm/dev/seed/age", {
      body: { items: [] },
      timeoutMs: 20_000,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new Error(
        "Server PocketBase belum memuat route seed data (/api/itsm/dev/seed/age).\n" +
          "Hentikan proses dev lalu jalankan `npm run dev` kembali, kemudian ulangi seed."
      );
    }

    throw error;
  }
}

function normalizeCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function hospitalFor(index, opts, mode) {
  const fallback = {
    code: `DEMO0${index + 1}`,
    name: `RS Demo ${index + 1}`,
    city: "Jakarta",
    domain: `demo${index + 1}.local`,
    timezone: HOSPITALS[0].timezone,
  };
  const base = HOSPITALS[index] || fallback;

  return {
    ...base,
    code: normalizeCode(index === 0 && opts.tenantCode ? opts.tenantCode : base.code),
    name: String(index === 0 && opts.tenantName ? opts.tenantName : base.name).trim(),
    domain: index === 0 ? opts.emailDomain || base.domain : base.domain,
    mode,
  };
}

function hospitalCount(opts, mode, log) {
  if (mode !== "vendor") {
    if (opts.hospitals > 1) {
      log.warn("--hospitals diabaikan pada mode standalone (hanya satu rumah sakit).");
    }
    return 1;
  }

  return Math.max(1, Math.min(5, opts.hospitals || 1));
}

async function ageRecords(ctx, items) {
  if (!ctx.opts.age || !items.length) return;

  const chunks = [];
  for (let i = 0; i < items.length; i += 30) {
    chunks.push(items.slice(i, i + 30));
  }

  let processed = 0;

  for (const chunk of chunks) {
    await ctx.admin.json("POST", "/api/itsm/dev/seed/age", {
      body: { items: chunk },
      timeoutMs: 180_000,
    });
    processed += chunk.length;
    ctx.log.detail(`Backdate ${processed}/${items.length} record`);
  }
}

async function resetTenant(ctx) {
  const { tenant, log, opts } = ctx;

  if (!opts.reset) return;

  const counts = {
    tickets: (await ctx.admin.listAll("tickets", { filter: `tenant="${tenant.id}"` }))
      .length,
    problems: (await ctx.admin.listAll("problems", { filter: `tenant="${tenant.id}"` }))
      .length,
    articles: (
      await ctx.admin.listAll("knowledge_articles", {
        filter: `tenant="${tenant.id}"`,
      })
    ).length,
    incidents: (
      await ctx.admin.listAll("major_incidents", {
        filter: `tenant="${tenant.id}"`,
      })
    ).length,
  };

  log.warn(
    `--reset akan menghapus ${counts.tickets} tiket, ${counts.problems} problem, ` +
      `${counts.articles} artikel, dan ${counts.incidents} insiden milik ` +
      `"${tenant.name}" (${tenant.code}).`
  );

  if (!opts.yes) {
    const ok = await confirm("Lanjutkan reset data demo?");
    if (!ok) {
      throw new Error("Reset dibatalkan. Jalankan ulang dengan --yes untuk mode non-interaktif.");
    }
  }

  const result = await ctx.admin.json("POST", "/api/itsm/dev/seed/reset", {
    body: { tenant: tenant.id },
    timeoutMs: 120_000,
  });

  log.success(
    `Data demo dibersihkan (${result.removed.tickets} tiket, ${result.removed.assets} aset, ` +
      `${result.removed.problems} problem, ${result.removed.articles} artikel, ` +
      `${result.removed.incidents} insiden).`
  );
}

async function seedHospital(ctx) {
  const { admin, opts, profile, log, tenant } = ctx;

  await resetTenant(ctx);
  await prepareOrganisation(ctx);

  const totalTickets = Math.max(
    6,
    opts.tickets || Math.round(profile.tickets / ctx.hospitalSplit)
  );
  ctx.ticketCount = totalTickets;
  const qrCount = profile.key === "tiny" ? 1 : Math.max(2, Math.round(totalTickets / 25));

  const tickets = buildPlans(ctx);
  const qrPlans = buildQrPlans(ctx, qrCount);

  log.step(`Membuat ${tickets.length} tiket dan ${qrPlans.length} tiket QR...`);

  const generated = await seedTickets(ctx, tickets);
  const generatedQr = await seedTickets(ctx, qrPlans);
  const allTickets = [...generated, ...generatedQr];

  log.success(
    `${allTickets.length} tiket dibuat (${generated.length} web/staf, ${generatedQr.length} QR).`
  );

  log.step("Membuat problem, artikel pengetahuan, dan insiden mayor...");
  const problems = await seedProblems(ctx, allTickets);
  const articles = await seedArticles(ctx, problems);
  const incidents = await seedIncidents(ctx, allTickets);

  const totals = {
    problems: (
      await admin.listAll("problems", { filter: `tenant="${tenant.id}"` })
    ).length,
    articles: (
      await admin.listAll("knowledge_articles", {
        filter: `tenant="${tenant.id}"`,
      })
    ).length,
    incidents: (
      await admin.listAll("major_incidents", {
        filter: `tenant="${tenant.id}"`,
      })
    ).length,
  };

  log.success(
    `${problems.length} problem baru, ${articles.length} artikel baru, ${incidents.length} insiden baru ` +
      `(total ${totals.problems}/${totals.articles}/${totals.incidents}).`
  );

  const agingItems = [
    ...allTickets.map((plan) => buildAgingPlan(plan)),
    ...artifactAgingPlans(problems, articles, incidents),
  ].filter((item) => item && item.id);

  if (opts.age) {
    log.step(`Memundurkan waktu ${agingItems.length} record...`);
    await ageRecords(ctx, agingItems);
    log.success("Waktu record disebar ke riwayat.");
  }

  ctx.generated = allTickets;
  ctx.artifactCounts = totals;

  // Ringkasan isi tenant.
  const ticketRows = await admin.listAll("tickets", {
    filter: `tenant="${tenant.id}"`,
    perPage: 200,
  });
  ctx.summary = summarizeTickets(ticketRows);

  return ctx;
}

function summarizeTickets(rows) {
  const statuses = {};
  const types = {};
  let breached = 0;
  let oldest = null;

  for (const ticket of rows) {
    statuses[ticket.status] = (statuses[ticket.status] || 0) + 1;
    types[ticket.type] = (types[ticket.type] || 0) + 1;
    if (
      ticket.response_breach_at ||
      ticket.approval_breach_at ||
      ticket.resolution_breach_at
    ) {
      breached += 1;
    }
    if (!oldest || String(ticket.created) < String(oldest)) {
      oldest = ticket.created;
    }
  }

  const active = rows.filter(
    (ticket) => !["resolved", "closed"].includes(ticket.status)
  ).length;

  return { total: rows.length, active, breached, statuses, types, oldest };
}

function webBase(ctx) {
  if (ctx.opts.webUrl) return ctx.opts.webUrl.replace(/\/+$/, "");

  try {
    const url = new URL(ctx.baseUrl);
    if (url.port === "8090") {
      url.port = "5173";
      url.hostname = url.hostname === "0.0.0.0" ? "localhost" : url.hostname;
      return url.origin;
    }
  } catch {
    // biarkan fallback di bawah
  }

  return ctx.baseUrl;
}

function printSummary(ctx) {
  const { log, tenant, hospital, mode, opts, summary, artifactCounts } = ctx;
  const web = webBase(ctx);
  const lead = ctx.users.lead;

  log.title("Ringkasan seed");
  log.plain(`  ${color.bold}Rumah sakit${color.reset} : ${tenant.name} (${tenant.code})`);
  log.plain(`  ${color.bold}Mode${color.reset}        : ${mode}`);
  log.plain(
    `  ${color.bold}Tiket${color.reset}       : ${summary.total} total · ${summary.active} aktif · ${summary.breached} breach`
  );
  if (artifactCounts) {
    log.plain(
      `  ${color.bold}Lainnya${color.reset}     : ${artifactCounts.problems} problem · ${artifactCounts.articles} artikel · ${artifactCounts.incidents} insiden`
    );
  }
  log.plain(`  ${color.bold}Riwayat${color.reset}     : ${summary.oldest ? humanDate(summary.oldest) : "-"} s/d sekarang`);

  log.title("Akun demo");
  const accounts = [
    ["lead", "Kepala IT — lihat semua, approval, laporan"],
    ["support", "Staff IT — triage, assign, komentar internal"],
    ["resolverApp", "Teknisi aplikasi — antrean tim application"],
    ["managerIgd", "Manajer unit IGD — approver tahap 1"],
    ["nurseIgd", "Pemohon IGD — buat tiket, CSAT"],
    ["viewer", "Pengamat — laporan dan audit"],
  ];

  for (const [key, note] of accounts) {
    const user = ctx.users[key];
    if (!user) continue;
    log.plain(
      `  ${user.email.padEnd(34)} ${color.dim}${opts.password}${color.reset}   ${color.dim}${note}${color.reset}`
    );
  }

  if (ctx.points.length) {
    log.title("Titik QR publik");
    for (const point of ctx.points.slice(0, 3)) {
      log.plain(`  ${point.name}`);
      log.plain(`  ${color.dim}${web}/i/${point.token}${color.reset}`);
    }
  }

  log.title("Buka aplikasi");
  log.plain(`  Login      : ${web}/login`);
  log.plain(`  Dashboard  : ${web}/dashboard`);
  log.plain(`  Tiket      : ${web}/tickets`);
  log.plain(`  Laporan    : ${web}/reports`);
  if (mode === "vendor") {
    log.plain(`  Konsol RS  : ${web}/platform`);
    log.plain(
      `  ${color.dim}Masuk sebagai vendor.seed@${opts.emailDomain} untuk melihat konsol vendor.${color.reset}`
    );
  }
  log.plain(`  ${color.dim}Superuser PocketBase: ${ctx.opts.superuserEmail}${color.reset}`);

  if (opts.age) {
    log.plain(
      `\n  ${color.dim}Waktu record sudah dimundurkan. Bila ingin data "sekarang", jalankan dengan --no-age.${color.reset}`
    );
  }
}

async function main() {
  const opts = parseArgs(process.argv, OPTION_SPEC);
  opts.age = !opts.noAge;

  if (opts.help) {
    printHelp();
    return;
  }

  const log = createLogger({ quiet: opts.quiet });
  const profile = PROFILES[opts.profile] || PROFILES.small;
  const seed = opts.seed ?? Math.floor(Date.now() % 2147483647);

  log.title("Healthcare ITSM — seed data manual");
  log.plain(
    `  Profil ${color.bold}${profile.label}${color.reset} (${profile.key}) · ${profile.description}`
  );
  log.plain(`  RNG seed: ${seed}`);

  const baseUrl = String(opts.baseUrl).replace(/\/+$/, "");
  log.step(`Menghubungkan ke ${baseUrl}...`);

  if (!(await waitForServer(baseUrl))) {
    throw new Error(
      `PocketBase tidak merespons di ${baseUrl}.\n` +
        "Jalankan `npm run dev` lebih dulu, atau berikan --base-url yang benar."
    );
  }

  const client = new ApiClient(baseUrl);
  const ctx = {
    baseUrl,
    opts,
    profile,
    log,
    client,
    admin: null,
    platform: null,
    mode: "standalone",
    hospitalSplit: 1,
  };

  await ensureSuperuser(ctx);

  const admin = new ApiClient(baseUrl);
  await admin.loginSuperuser(opts.superuserEmail, opts.superuserPassword);
  ctx.admin = admin;

  let meta = await admin.get("/api/itsm/app-meta");
  ctx.mode = meta.mode;

  if (meta.setup_required) {
    meta = await ensureSetup(ctx, meta);
    ctx.mode = meta.mode || ctx.mode;
  }

  await preflightDevRoute(admin);

  if (ctx.mode === "vendor") {
    const platform = await ensurePlatformAdmin(ctx);
    ctx.platform = platform.client;
    log.detail(`Akun platform: ${platform.email}`);
  }

  const hospitals = hospitalCount(opts, ctx.mode, log);
  ctx.hospitalSplit = hospitals;

  if (hospitals > 1) {
    log.plain(
      `  ${color.dim}Menyiapkan ${hospitals} rumah sakit demo untuk konsol vendor.${color.reset}`
    );
  }

  const results = [];

  for (let index = 0; index < hospitals; index += 1) {
    const hospital = hospitalFor(index, opts, ctx.mode);
    const hospitalCtx = {
      baseUrl,
      opts,
      profile,
      log,
      meta,
      admin,
      platform: ctx.platform,
      mode: ctx.mode,
      hospitalSplit: hospitals,
      hospital,
      rng: createRandom(seed + index * 7919),
      users: {},
      sessions: {},
      userKeyById: {},
      units: {},
      services: {},
      items: {},
      categories: {},
      assets: {},
      points: [],
      problems: {},
      articles: {},
      incidents: {},
    };

    log.title(`${hospital.name} (${hospital.code})`);

    const tenant = await resolveTenant(hospitalCtx);
    hospitalCtx.tenant = tenant;
    log.detail(`Tenant ${tenant.name} (${tenant.code}) · ${tenant.id}`);

    const prepared = await seedHospital(hospitalCtx);

    // Simpan kebutuhan ringkasan lintas rumah sakit.
    prepared.userKeyById = hospitalCtx.userKeyById;
    prepared.summary = hospitalCtx.summary;

    results.push(prepared);
  }

  for (const result of results) {
    printSummary(result);
  }

  if (results.length > 1) {
    log.title("Ringkasan konsol vendor");
    for (const result of results) {
      log.plain(
        `  ${result.tenant.name.padEnd(26)} ${String(result.summary.total).padStart(3)} tiket · ${String(result.summary.active).padStart(2)} aktif · ${String(result.summary.breached).padStart(2)} breach`
      );
    }
  }

  log.plain(
    `\n${color.green}Selesai.${color.reset} Jalankan lagi kapan saja untuk menambah data; gunakan --reset untuk mulai bersih.`
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n${color.red}Seed gagal:${color.reset} ${message}`);

  if (process.env.SEED_DEBUG === "1" && error && error.stack) {
    console.error(error.stack);
  }

  process.exitCode = 1;
});
