// E2E setup awal mode vendor: form hanya meminta akun platform (tanpa identitas
// rumah sakit), lalu mendarat di Konsol Vendor dan halaman setup menutup diri.
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
const VENDOR = { name: "Admin Vendor", email: "vendor@uji.local" };

const state = { pb: null, web: null, browser: null, consoleErrors: [] };

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

before(async () => {
  const previous = process.env.TENANCY_MODE;
  process.env.TENANCY_MODE = "vendor";
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

  assert.deepEqual(state.consoleErrors, [], "alur setup vendor tidak boleh error di console");
});

test("setup vendor hanya meminta akun platform lalu membuka Konsol Vendor", async () => {
  const context = await state.browser.newContext({
    viewport: { width: 1280, height: 1000 },
  });
  const page = await context.newPage();

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/favicon|React DevTools|Download the React/i.test(text)) return;
    state.consoleErrors.push(`setup vendor: ${text}`);
  });
  page.on("pageerror", (error) => {
    state.consoleErrors.push(`setup vendor: ${error.message}`);
  });

  await page.goto(`${state.web.url}/`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/setup$/, { timeout: 20_000 });
  await page.waitForSelector("#setup-token");

  // Form vendor tidak menampilkan identitas rumah sakit.
  assert.equal(await page.locator("#hospital-name").count(), 0);
  assert.match(
    await page.locator(".setup-section-title").last().innerText(),
    /Akun vendor pertama/i
  );
  assert.match(await page.locator(".login-intro").innerText(), /akun vendor/i);

  const token = (await readFile(path.join(state.pb.dataDir, "setup_token"), "utf8")).trim();

  await page.fill("#setup-token", token);
  await page.fill("#admin-name", VENDOR.name);
  await page.fill("#admin-email", VENDOR.email);
  await page.fill("#admin-password", PASSWORD);
  await page.fill("#admin-password-confirm", PASSWORD);
  await page.getByRole("button", { name: /Selesaikan setup/ }).click();

  await page.waitForURL(/\/platform$/, { timeout: 25_000 });
  await page.waitForSelector(".sidebar");

  // Akun platform tersimpan dan Konsol Vendor langsung menampilkan rumah sakit.
  const superuser = new ApiClient(state.pb.url);
  await superuser.loginSuperuser(state.pb.superuser.email, state.pb.superuser.password);

  const users = await superuser.list("users", { filter: `email = "${VENDOR.email}"` });
  assert.equal(users.items.length, 1);
  assert.equal(users.items[0].is_platform_staff, true);
  assert.equal(users.items[0].role, "it_lead");
  assert.equal(String(users.items[0].tenant || ""), "");

  // Setup tertutup setelah akun pertama.
  const setupAgain = await (await fetch(`${state.pb.url}/api/itsm/setup/status`)).json();
  assert.equal(setupAgain.required, false);

  await context.close();
});
