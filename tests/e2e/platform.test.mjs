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
import { adminClient, createPlatformUser, uniqueLabel } from "../lib/fixtures.mjs";
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
  await page.getByText("Rumah Sakit Contoh").first().waitFor();
  await page.getByText("RS01").first().waitFor();

  // Sidebar vendor berisi tautan konsol, bukan menu ruang kerja rumah sakit.
  await page
    .locator(".sidebar")
    .getByRole("link", { name: "Konsol Vendor" })
    .waitFor();
  assert.equal(
    await page.locator(".sidebar").getByText("Tiket", { exact: true }).count(),
    0
  );

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
