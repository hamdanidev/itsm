// E2E Konsol Vendor: mode `vendor`, akun platform, dan pengelolaan tenant lewat UI.
// Instance PocketBase sendiri supaya mode tenancy tidak bercampur dengan smoke
// test lain (yang berjalan pada mode standalone).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { after, before, test } from "node:test";

import { chromium } from "playwright-core";

import { freePort, startPocketBase } from "../lib/pocketbase-server.mjs";
import {
  adminClient,
  createPlatformUser,
  createTicket,
  seedOrg,
  uniqueLabel,
} from "../lib/fixtures.mjs";
import { findChromium } from "../lib/chromium.mjs";

process.env.TENANCY_MODE = "vendor";

const frontendDir = fileURLToPath(new URL("../../frontend/", import.meta.url));
const PASSWORD = "RahasiaUji123!";

const state = {
  pb: null,
  web: null,
  browser: null,
  vendor: null,
  createdCode: "",
  createdName: "",
  adminEmail: "",
  consoleErrors: [],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function startVite(pbUrl) {
  const port = await freePort();
  const viteBin = path.join(frontendDir, "node_modules", "vite", "bin", "vite.js");

  const child = spawn(
    process.execPath,
    [viteBin, "--port", String(port), "--strictPort", "--host=127.0.0.1"],
    {
      cwd: frontendDir,
      env: { ...process.env, PB_TARGET: pbUrl, VITE_DEV_PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(String(chunk)));
  child.stderr.on("data", (chunk) => logs.push(String(chunk)));

  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  let ready = false;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/login`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // Vite masih boot.
    }

    await sleep(250);
  }

  if (!ready) {
    child.kill();
    throw new Error(`Vite tidak siap.\n${logs.join("").slice(-3000)}`);
  }

  return {
    url,
    async stop() {
      if (child.exitCode === null) {
        child.kill();
        await Promise.race([once(child, "exit"), sleep(5000)]);
      }
    },
  };
}

function trackErrors(page, label) {
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/favicon|React DevTools|Download the React/i.test(text)) return;
    state.consoleErrors.push(`${label}: ${text}`);
  });

  page.on("pageerror", (error) => {
    state.consoleErrors.push(`${label}: ${error.message}`);
  });
}

async function login(email, expectedUrl, label) {
  const context = await state.browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  trackErrors(page, label);

  await page.goto(`${state.web.url}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(expectedUrl, { timeout: 20_000 });
  await page.waitForLoadState("networkidle").catch(() => {});

  return page;
}

before(async () => {
  state.pb = await startPocketBase();
  process.env.PB_URL = state.pb.url;
  process.env.PB_ADMIN_EMAIL = state.pb.superuser.email;
  process.env.PB_ADMIN_PASSWORD = state.pb.superuser.password;

  const admin = await adminClient();
  state.vendor = await createPlatformUser(admin, { role: "it_lead", label: "vendor" });

  // Satu tiket di RS01 agar vendor punya pekerjaan nyata untuk dibuka.
  state.org = await seedOrg({ label: "e2e", isolatedTenant: false });
  const ticket = await createTicket(state.org.requester.client, {
    type: "incident",
    title: "Tiket rumah sakit untuk vendor",
    description: "Tiket ini dipakai memverifikasi akses vendor lintas tenant.",
  });
  state.ticketId = ticket.id;
  state.ticketNo = ticket.ticket_no;
  state.requesterName = state.org.requester.user.name;

  // Jejak audit dari aktor vendor, dipakai layar Audit.
  await state.vendor.client.json(
    "POST",
    `/api/itsm/tickets/${ticket.id}/comments`,
    { body: { body: "Catatan vendor untuk audit.", visibility: "internal" } }
  );

  // Rumah sakit kedua tanpa tiket, untuk menguji pemilih tenant.
  state.secondTenant = await state.vendor.client.json(
    "POST",
    "/api/itsm/platform/tenants",
    {
      body: {
        name: `RS Kedua ${uniqueLabel("e2e")}`,
        code: `D${Date.now().toString(36)}`.toUpperCase().slice(0, 12),
        seed_master: false,
      },
    }
  );

  state.web = await startVite(state.pb.url);
  state.browser = await chromium.launch({
    executablePath: await findChromium(),
    headless: true,
  });
}, { timeout: 180_000 });

after(async () => {
  await state.browser?.close().catch(() => {});
  await state.web?.stop().catch(() => {});
  await state.pb?.stop().catch(() => {});
});

test("akun vendor masuk ke Konsol Vendor dan melihat daftar rumah sakit", async () => {
  const page = await login(state.vendor.email, "**/platform", "vendor");

  await page.getByRole("heading", { name: "Konsol Vendor" }).waitFor();
  await page.locator("tbody").getByText("Rumah Sakit Contoh").first().waitFor();
  await page.locator("tbody").getByText("RS01").first().waitFor();

  // Sidebar vendor berisi konsol + antrean tiket, tanpa menu khusus rumah sakit.
  await page
    .locator(".sidebar")
    .getByRole("link", { name: "Konsol Vendor" })
    .waitFor();
  await page.locator(".sidebar").getByRole("link", { name: "Tiket" }).waitFor();
  assert.equal(
    await page.locator(".sidebar").getByText("Ringkasan", { exact: true }).count(),
    0
  );

  await page.context().close();
});

test("vendor memilih rumah sakit dan mengerjakan tiketnya", async () => {
  const page = await login(state.vendor.email, "**/platform", "vendor-tiket");

  // Pemilih tenant hanya muncul untuk akun vendor.
  const switcher = page.locator(".tenant-switcher select");
  await switcher.waitFor();
  await switcher.selectOption({ label: "Rumah Sakit Contoh" });

  await page.locator(".sidebar").getByRole("link", { name: "Tiket" }).click();
  await page.waitForURL("**/tickets", { timeout: 15_000 });
  await page.waitForTimeout(1200);

  const row = page.locator("tr", { hasText: state.ticketNo });
  await row.waitFor();
  await row.click();
  await page.waitForURL(/\/tickets\/[^/]+$/, { timeout: 15_000 });
  await page.waitForTimeout(1500);

  // Vendor bisa membaca tiket rumah sakit: requester ter-expand.
  await page.getByText(state.requesterName).first().waitFor();

  // Assignee mencakup staf vendor sendiri.
  const assignee = page.locator('select[aria-label="Pilih assignee"]');
  await assignee.waitFor();
  const options = await assignee.locator("option").allTextContents();
  assert.ok(
    options.some((text) => text.includes("Vendor")),
    "staf vendor harus muncul sebagai calon assignee"
  );

  await page.context().close();
});

test("pemilih tenant mengikuti tiket yang dibuka", async () => {
  const page = await login(state.vendor.email, "**/platform", "vendor-sinkron");

  const switcher = page.locator(".tenant-switcher select");
  await switcher.waitFor();

  // Pindah ke rumah sakit kedua (tanpa tiket), lalu buka tiket RS01 lewat URL.
  await switcher.selectOption({ label: state.secondTenant.tenant.name });
  await page.waitForTimeout(600);

  await page.goto(`${state.web.url}/tickets/${state.ticketId}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(1600);

  // Pemilih harus pindah sendiri ke rumah sakit pemilik tiket.
  const selectedLabel = await switcher.locator("option:checked").innerText();
  assert.equal(selectedLabel, "Rumah Sakit Contoh");

  // Mengganti rumah sakit dari halaman detail tidak boleh tetap di tiket itu.
  await switcher.selectOption({ label: state.secondTenant.tenant.name });
  await page.waitForURL(/\/tickets$/, { timeout: 15_000 });
  await page.waitForTimeout(800);

  assert.equal(await page.locator("tbody tr").count(), 0);

  await page.context().close();
});

test("vendor menelusuri audit lintas rumah sakit", async () => {
  const page = await login(state.vendor.email, "**/platform", "vendor-audit");

  await page.locator(".sidebar").getByRole("link", { name: "Audit" }).click();
  await page.waitForURL("**/audit", { timeout: 15_000 });
  await page.waitForTimeout(1800);

  await page.getByRole("heading", { name: "Audit" }).waitFor();
  assert.ok((await page.locator("tbody tr").count()) >= 1, "audit harus berisi baris");

  // Filter satu rumah sakit.
  await page.locator("#audit-tenant").selectOption({ label: "Rumah Sakit Contoh" });
  await page.getByRole("button", { name: "Terapkan" }).click();
  await page.waitForTimeout(1500);

  await page.locator("tbody").getByText("Rumah Sakit Contoh").first().waitFor();

  // Hanya aksi vendor.
  await page.locator("#audit-scope").selectOption("platform");
  await page.getByRole("button", { name: "Terapkan" }).click();
  await page.waitForTimeout(1500);

  const rows = page.locator("tbody tr");
  assert.ok((await rows.count()) >= 1, "aksi vendor harus terlihat");

  // Detail perubahan.
  await rows.first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Perubahan").waitFor();
  await dialog.getByText("User agent").waitFor();
  await dialog.locator(".modal-foot").getByRole("button", { name: "Tutup" }).click();

  await page.context().close();
});

test("vendor membandingkan SLA antar rumah sakit", async () => {
  const page = await login(state.vendor.email, "**/platform", "vendor-laporan");

  await page.locator(".sidebar").getByRole("link", { name: "Laporan" }).click();
  await page.waitForURL("**/reports", { timeout: 15_000 });
  await page.waitForTimeout(2000);

  await page.getByRole("heading", { name: "Laporan SLA lintas RS" }).waitFor();

  const comparison = page.locator(".report-panel", {
    hasText: "Perbandingan rumah sakit",
  });
  await comparison.waitFor();

  const rows = comparison.locator("tbody tr");
  assert.ok((await rows.count()) >= 2, "perbandingan memuat minimal dua RS");
  await comparison.getByText("Rumah Sakit Contoh").first().waitFor();

  // Membatasi ke satu rumah sakit menghilangkan tabel perbandingan.
  await page.locator("#report-tenant").selectOption({ label: "Rumah Sakit Contoh" });
  await page.getByRole("button", { name: "Terapkan" }).click();
  await page.waitForTimeout(1800);

  await page
    .getByText("Perbandingan rumah sakit")
    .waitFor({ state: "detached", timeout: 15_000 });

  await page.context().close();
});

test("vendor membuat rumah sakit baru beserta akun IT pertama", async () => {
  const page = await login(state.vendor.email, "**/platform", "vendor-create");

  state.createdName = `RS Uji UI ${uniqueLabel("e2e")}`;
  state.createdCode = `UI${Date.now().toString(36)}`.toUpperCase().slice(0, 12);
  state.adminEmail = `lead.ui.${Date.now()}@uji.local`;

  await page.getByRole("button", { name: "Tambah rumah sakit" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#tenant-name").fill(state.createdName);
  await dialog.locator("#tenant-code").fill(state.createdCode);
  await dialog.locator("#tenant-admin-name").fill("Lead UI");
  await dialog.locator("#tenant-admin-email").fill(state.adminEmail);
  await dialog.locator("#tenant-admin-password").fill(PASSWORD);
  await dialog.getByRole("button", { name: "Buat rumah sakit" }).click();

  await page.getByText(`${state.createdName} (${state.createdCode}) dibuat`).waitFor();
  await page.getByRole("cell", { name: state.createdCode }).first().waitFor();

  await page.context().close();
});

test("vendor melihat data master dan pengguna hasil pembuatan tenant", async () => {
  const page = await login(state.vendor.email, "**/platform", "vendor-detail");

  const row = page.locator("tr", { hasText: state.createdCode });
  await row.getByRole("button", { name: "Kelola" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByText("Master data").waitFor();
  await dialog.getByText("Kebijakan SLA", { exact: true }).waitFor();
  await dialog.getByText(state.adminEmail).waitFor();

  await dialog.locator(".modal-foot").getByRole("button", { name: "Tutup" }).click();
  await page.context().close();
});

test("tidak ada console error pada alur konsol vendor", () => {
  assert.deepEqual(state.consoleErrors, []);
});
