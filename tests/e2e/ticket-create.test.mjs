// E2E form buat tiket tiga langkah: navigasi, validasi per langkah, ringkasan,
// dan submit hanya di langkah terakhir.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { after, before, test } from "node:test";

import { chromium } from "playwright-core";

import { freePort, startPocketBase } from "../lib/pocketbase-server.mjs";
import { PASSWORD, seedOrg, uniqueLabel } from "../lib/fixtures.mjs";
import { findChromium } from "../lib/chromium.mjs";

const frontendDir = fileURLToPath(new URL("../../frontend/", import.meta.url));

const state = { pb: null, web: null, browser: null, org: null, consoleErrors: [] };

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

async function login(email) {
  const context = await state.browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  trackErrors(page, "buat tiket");

  await page.goto(`${state.web.url}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/tickets$/, { timeout: 20_000 });

  return { context, page };
}

before(async () => {
  const previous = process.env.TENANCY_MODE;
  process.env.TENANCY_MODE = "standalone";
  delete process.env.SETUP_TOKEN;
  state.pb = await startPocketBase();
  if (previous === undefined) delete process.env.TENANCY_MODE;
  else process.env.TENANCY_MODE = previous;

  process.env.PB_URL = state.pb.url;
  process.env.PB_ADMIN_EMAIL = state.pb.superuser.email;
  process.env.PB_ADMIN_PASSWORD = state.pb.superuser.password;

  state.org = await seedOrg({ label: uniqueLabel("create") });

  state.web = await startVite(state.pb.url);
  state.browser = await chromium.launch({ executablePath: await findChromium() });
});

after(async () => {
  await state.browser?.close().catch(() => {});
  await state.web?.stop();
  await state.pb?.stop();

  assert.deepEqual(state.consoleErrors, [], "form buat tiket tidak boleh error di console");
});

test("wizard: validasi per langkah, ringkasan, dan submit di langkah 3", async () => {
  const { context, page } = await login(state.org.requester.email);

  await page.goto(`${state.web.url}/tickets/new`, { waitUntil: "networkidle" });
  await page.waitForSelector(".wizard-steps");

  // Langkah 1: klasifikasi, detail belum tampil.
  assert.equal(await page.locator("#title").isVisible(), false);
  assert.match(await page.locator(".wizard-step.is-active").innerText(), /Klasifikasi/);

  await page.getByRole("button", { name: "Lanjut" }).click();
  await page.waitForSelector("#title", { state: "visible" });
  assert.match(await page.locator(".wizard-step.is-active").innerText(), /Detail/);

  // Langkah 2 tidak boleh lanjut tanpa judul dan deskripsi.
  await page.getByRole("button", { name: "Lanjut" }).click();
  await page.waitForSelector(".alert--error");
  assert.match(await page.locator(".alert--error").innerText(), /Judul minimal 5/);
  assert.equal(await page.locator("#confirmData").isVisible(), false);

  const title = `Wizard tiket ${Date.now()}`;
  await page.fill("#title", title);
  await page.fill(
    "#description",
    "Deskripsi uji wizard yang cukup panjang untuk lolos validasi."
  );

  await page.getByRole("button", { name: "Lanjut" }).click();
  await page.waitForSelector("#confirmData", { state: "visible" });
  assert.match(await page.locator(".wizard-step.is-active").innerText(), /Tinjau/);
  assert.match(await page.locator(".form-step-count").innerText(), /Langkah 3 dari 3/);
  assert.match(await page.locator(".wizard-panel:not(.is-hidden)").innerText(), new RegExp(title));

  // Submit tanpa konfirmasi ditolak.
  await page.getByRole("button", { name: "Buat tiket" }).click();
  await page.waitForSelector(".alert--error");
  assert.match(await page.locator(".alert--error").innerText(), /Konfirmasi/i);

  await page.check("#confirmData");
  await page.getByRole("button", { name: "Buat tiket" }).click();
  await page.waitForURL(/\/tickets\/[a-z0-9]+$/, { timeout: 20_000 });
  await page.waitForSelector(".issue-title");

  assert.match(await page.locator(".issue-title").innerText(), new RegExp(title));

  await context.close();
});

test("wizard: kembali ke langkah sebelumnya tidak menghapus isian", async () => {
  const { context, page } = await login(state.org.requester.email);

  await page.goto(`${state.web.url}/tickets/new`, { waitUntil: "networkidle" });
  await page.waitForSelector(".wizard-steps");

  // Jenis Change Request memunculkan rencana perubahan di langkah 2.
  await page.getByRole("button", { name: /Change Request/ }).click();
  await page.getByRole("button", { name: "Lanjut" }).click();
  await page.waitForSelector("#title", { state: "visible" });

  await page.fill("#title", "Perubahan konfigurasi antrean farmasi");
  await page.fill(
    "#description",
    "Mengubah parameter antrean agar resep elektronik masuk otomatis."
  );

  assert.equal(await page.locator("#implementationPlan").isVisible(), true);

  await page.getByRole("button", { name: "Lanjut" }).click();
  await page.waitForSelector("#confirmData", { state: "visible" });

  // Kembali dua langkah: nilai judul dan jenis tetap.
  await page.getByRole("button", { name: "Kembali" }).click();
  await page.waitForSelector("#title", { state: "visible" });
  assert.equal(
    await page.locator("#title").inputValue(),
    "Perubahan konfigurasi antrean farmasi"
  );

  await page.getByRole("button", { name: "Kembali" }).click();
  await page.waitForFunction(() =>
    document
      .querySelector(".wizard-step.is-active")
      ?.textContent?.includes("Klasifikasi")
  );
  assert.match(
    await page.locator(".wizard-step.is-active").innerText(),
    /Klasifikasi/
  );
  assert.equal(
    await page.getByRole("button", { name: /Change Request/ }).getAttribute("aria-pressed"),
    "true"
  );

  await context.close();
});
