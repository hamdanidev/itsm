// E2E setup awal: instalasi baru tanpa akun harus mengalihkan ke /setup, kode
// setup diambil dari data dir server, form membuat rumah sakit + Kepala IT
// pertama, dan halaman setup menutup diri setelah selesai.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { after, before, test } from "node:test";

import { chromium } from "playwright-core";

import { freePort, startPocketBase } from "../lib/pocketbase-server.mjs";
import { ApiClient } from "../lib/api-client.mjs";
import { findChromium } from "../lib/chromium.mjs";

const frontendDir = fileURLToPath(new URL("../../frontend/", import.meta.url));
const PASSWORD = "RahasiaSetup123!";
const ADMIN = {
  name: "Rina Pratiwi",
  email: "kepala.it@rsuji.local",
};

const state = {
  pb: null,
  web: null,
  browser: null,
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
      const response = await fetch(`${url}/setup`, {
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
    // Test ini sengaja mengirim kode setup salah; Chromium mencatat respons 403
    // sebagai error resource.
    if (/Failed to load resource.*status of 403/i.test(text)) return;
    state.consoleErrors.push(`${label}: ${text}`);
  });

  page.on("pageerror", (error) => {
    state.consoleErrors.push(`${label}: ${error.message}`);
  });
}

before(async () => {
  const previous = process.env.TENANCY_MODE;
  process.env.TENANCY_MODE = "standalone";
  delete process.env.SETUP_TOKEN;
  state.pb = await startPocketBase();
  if (previous === undefined) delete process.env.TENANCY_MODE;
  else process.env.TENANCY_MODE = previous;

  state.web = await startVite(state.pb.url);
  state.browser = await chromium.launch({ executablePath: await findChromium() });
});

after(async () => {
  await state.browser?.close().catch(() => {});
  await state.web?.stop();
  await state.pb?.stop();

  assert.deepEqual(state.consoleErrors, [], "alur setup tidak boleh error di console");
});

test("instalasi baru dialihkan ke /setup dan menolak kode setup yang salah", async () => {
  const context = await state.browser.newContext({
    viewport: { width: 1280, height: 1000 },
  });
  const page = await context.newPage();
  trackErrors(page, "setup");

  await page.goto(`${state.web.url}/`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/setup$/, { timeout: 20_000 });
  await page.waitForSelector("#setup-token");

  assert.match(
    await page.locator("#setup-title").innerText(),
    /Siapkan instalasi/i
  );

  // Halaman setup meminta kode dari server: cek panduan tersedia.
  await page.getByText("Di mana kode setup saya?").click();
  assert.match(
    await page.locator(".setup-help-body").innerText(),
    /setup_token/
  );

  await page.fill("#setup-token", "AAAA-BBBB-CCCC-DDDD");
  await page.fill("#hospital-name", "RSUD Kota Bandung");
  await page.fill("#hospital-code", "rsud-kota-bdg");
  await page.fill("#admin-name", ADMIN.name);
  await page.fill("#admin-email", ADMIN.email);
  await page.fill("#admin-password", PASSWORD);
  await page.fill("#admin-password-confirm", PASSWORD);

  await page.getByRole("button", { name: /Selesaikan setup/ }).click();
  await page.waitForSelector(".login-error");

  assert.match(await page.locator(".login-error").innerText(), /kode setup/i);
  assert.equal(new URL(page.url()).pathname, "/setup", "tetap di halaman setup");

  await context.close();
});

test("form setup membuat rumah sakit dan langsung masuk sebagai Kepala IT", async () => {
  const context = await state.browser.newContext({
    viewport: { width: 1280, height: 1000 },
  });
  const page = await context.newPage();
  trackErrors(page, "setup form");

  await page.goto(`${state.web.url}/setup`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#setup-token");

  const token = (await readFile(path.join(state.pb.dataDir, "setup_token"), "utf8")).trim();
  assert.ok(token.length >= 16, "kode setup harus tersedia di data dir server");

  // Validasi klien: password berbeda harus ditolak sebelum dikirim.
  await page.fill("#setup-token", token);
  await page.fill("#hospital-name", "RSUD Kota Bandung");
  await page.fill("#hospital-code", "rsud-kota-bdg");
  await page.fill("#admin-name", ADMIN.name);
  await page.fill("#admin-email", ADMIN.email);
  await page.fill("#admin-password", PASSWORD);
  await page.fill("#admin-password-confirm", `${PASSWORD}x`);
  await page.getByRole("button", { name: /Selesaikan setup/ }).click();
  await page.waitForSelector(".field-error");
  assert.match(
    await page.locator(".field-error").innerText(),
    /tidak sama/i
  );

  await page.fill("#admin-password-confirm", PASSWORD);
  await page.getByRole("button", { name: /Selesaikan setup/ }).click();

  // Setup sukses langsung memakai sesi akun baru dan mendarat di dashboard.
  await page.waitForURL(/\/dashboard$/, { timeout: 25_000 });
  await page.waitForSelector(".sidebar");

  const heading = await page.locator("h1").first().innerText();
  assert.ok(heading.length > 0, "dashboard harus tampil setelah setup");

  // Data tersimpan di server: rumah sakit berganti nama, satu akun Kepala IT.
  const superuser = new ApiClient(state.pb.url);
  await superuser.loginSuperuser(state.pb.superuser.email, state.pb.superuser.password);

  const tenants = await superuser.list("tenants", { filter: 'code = "RSUD-KOTA-BDG"' });
  assert.equal(tenants.items.length, 1);
  assert.equal(tenants.items[0].name, "RSUD Kota Bandung");
  assert.equal(tenants.items[0].timezone, "Asia/Jakarta");

  const users = await superuser.list("users", { filter: `email = "${ADMIN.email}"` });
  assert.equal(users.items.length, 1);
  assert.equal(users.items[0].role, "it_lead");
  assert.equal(users.items[0].is_active, true);
  assert.equal(users.items[0].tenant, tenants.items[0].id);

  // Sesi tersimpan: muat ulang tetap di dashboard.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/dashboard$/, { timeout: 20_000 });

  // Zona waktu bisa diatur sendiri oleh Kepala IT pada instalasi standalone.
  await page.goto(`${state.web.url}/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/admin$/, { timeout: 20_000 });
  await page.waitForSelector('[role="tab"]', { timeout: 20_000 });
  await page.getByRole("tab", { name: "Identitas" }).click();
  await page.waitForSelector("#tenant-timezone");
  await page.waitForSelector("#tenant-timezone");

  await page.selectOption("#tenant-timezone", "Asia/Makassar");
  await page.getByRole("button", { name: /Simpan zona waktu/ }).click();
  await page.waitForSelector(".alert--success");

  assert.match(
    await page.locator(".alert--success").innerText(),
    /Zona waktu diperbarui/
  );

  const shifted = await superuser.list("tenants", {
    filter: 'code = "RSUD-KOTA-BDG"',
  });
  assert.equal(shifted.items[0].timezone, "Asia/Makassar");

  // Setelah keluar, /setup tidak lagi terbuka.
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${state.web.url}/setup`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/login$/, { timeout: 20_000 });

  await context.close();
});
