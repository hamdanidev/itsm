// E2E daftar tiket: tampilan tersimpan, pilih massal, aksi cepat baris, dan
// kepadatan tabel. Memakai instance PocketBase + Vite sendiri.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { after, before, test } from "node:test";

import { chromium } from "playwright-core";

import { freePort, startPocketBase } from "../lib/pocketbase-server.mjs";
import {
  assignTicket,
  createTicket,
  PASSWORD,
  seedOrg,
  uniqueLabel,
} from "../lib/fixtures.mjs";
import { findChromium } from "../lib/chromium.mjs";

const frontendDir = fileURLToPath(new URL("../../frontend/", import.meta.url));

const state = {
  pb: null,
  web: null,
  browser: null,
  org: null,
  mine: [],
  assigned: null,
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

async function login(email) {
  const context = await state.browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  const page = await context.newPage();
  trackErrors(page, "daftar tiket");

  await page.goto(`${state.web.url}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  // Staf mendarat di dashboard, pemohon di daftar tiket.
  await page.waitForURL(/\/dashboard$|\/tickets$/, { timeout: 20_000 });

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

  state.org = await seedOrg({ label: uniqueLabel("list") });

  for (let index = 0; index < 3; index++) {
    state.mine.push(
      await createTicket(state.org.requester.client, {
        title: `Gangguan uji daftar ${index + 1}`,
      })
    );
  }

  state.assigned = state.mine[2];
  await assignTicket(state.org.lead.client, state.assigned.id, state.org.support.user.id);

  state.web = await startVite(state.pb.url);
  state.browser = await chromium.launch({ executablePath: await findChromium() });
});

after(async () => {
  await state.browser?.close().catch(() => {});
  await state.web?.stop();
  await state.pb?.stop();

  assert.deepEqual(state.consoleErrors, [], "daftar tiket tidak boleh error di console");
});

test("tampilan tersimpan menyaring tiket dan pilihan massal bisa di-assign", async () => {
  const { context, page } = await login(state.org.support.email);

  await page.goto(`${state.web.url}/tickets`, { waitUntil: "networkidle" });

  // Tampilan "Belum di-assign" hanya menampilkan tiket tanpa assignee.
  const unassignedPill = page.getByRole("button", {
    name: "Belum di-assign",
    exact: true,
  });
  await unassignedPill.click();
  await page.waitForURL(/assignee=unassigned/);
  await page.waitForSelector(".issue-table tbody tr");

  const rows = page.locator(".issue-table tbody tr");
  assert.equal(await rows.count(), 2, "hanya dua tiket yang belum di-assign");

  assert.equal(await unassignedPill.getAttribute("aria-pressed"), "true");

  // Tiket tanpa assignee menawarkan aksi cepat "Ambil".
  assert.equal(
    await page.getByRole("button", { name: /^Ambil / }).count(),
    2,
    "tiap tiket belum di-assign punya tombol Ambil"
  );

  // Pilih semua di halaman, lalu assign massal ke diri sendiri.
  await page.getByRole("checkbox", { name: "Pilih semua tiket di halaman ini" }).check();
  await page.waitForSelector(".bulk-bar");
  assert.match(await page.locator(".bulk-bar").innerText(), /2 tiket dipilih/);

  await page.getByRole("button", { name: /Assign ke saya/ }).click();
  await page.waitForSelector(".alert--success", { timeout: 20_000 });
  assert.match(
    await page.locator(".alert--success").innerText(),
    /2 tiket di-assign/i
  );

  // Baris pilihan hilang dan data tersimpan.
  assert.equal(await page.locator(".bulk-bar").count(), 0);

  const first = await state.org.admin.list("tickets", {
    filter: `ticket_no = "${state.mine[0].ticket_no}"`,
  });
  const second = await state.org.admin.list("tickets", {
    filter: `ticket_no = "${state.mine[1].ticket_no}"`,
  });

  assert.equal(first.items[0].assignee, state.org.support.user.id);
  assert.equal(second.items[0].assignee, state.org.support.user.id);
  assert.equal(first.items[0].status, "assigned");

  // Tampilan "Tiket saya" memuat tiga tiket, dan aksi cepat "Mulai" bekerja.
  await page.getByRole("button", { name: "Tiket saya", exact: true }).click();
  await page.waitForURL(/assignee=mine/);
  await page.waitForSelector(".issue-table tbody tr");

  assert.equal(await page.locator(".issue-table tbody tr").count(), 3);

  await page.getByRole("button", { name: /^Mulai / }).first().click();
  await page.waitForSelector(".alert--success", { timeout: 20_000 });

  const startNotice = await page.locator(".alert--success").innerText();
  assert.match(startNotice, /mulai dikerjakan/i);

  const startedNo = startNotice.match(/[A-Z]{2,4}-\d{8}-[A-Z0-9]{6}/)?.[0];
  assert.ok(startedNo, "notifikasi memuat nomor tiket");

  const started = await state.org.admin.list("tickets", {
    filter: `ticket_no = "${startedNo}"`,
  });
  assert.equal(started.items[0].status, "in_progress");

  await context.close();
});

test("pemohon tidak melihat tampilan tersimpan, pilih massal, atau aksi cepat", async () => {
  const { context, page } = await login(state.org.requester.email);
  await page.goto(`${state.web.url}/tickets`, { waitUntil: "networkidle" });
  await page.waitForSelector(".issue-table");

  assert.equal(await page.locator(".saved-views").count(), 0);
  assert.equal(await page.getByRole("button", { name: /Papan/ }).count(), 0);
  assert.equal(
    await page.getByRole("checkbox", { name: "Pilih semua tiket di halaman ini" }).count(),
    0
  );
  assert.equal(await page.locator(".quick-action").count(), 0);

  await context.close();
});

test("kepadatan tabel tersimpan dan kolom tim tampil", async () => {
  const { context, page } = await login(state.org.lead.email);
  await page.goto(`${state.web.url}/tickets`, { waitUntil: "networkidle" });
  await page.waitForSelector(".issue-table");

  assert.equal(await page.locator(".issue-table th", { hasText: "Tim" }).count(), 1);

  const density = page.getByRole("button", { name: /Nyaman|Padat/ });
  assert.match(await density.innerText(), /Nyaman/);

  await density.click();
  await page.waitForSelector(".issue-table.is-compact");
  assert.match(await density.innerText(), /Padat/);

  // Pilihan kepadatan bertahan setelah muat ulang.
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".issue-table.is-compact");
  assert.match(
    await page.getByRole("button", { name: /Nyaman|Padat/ }).innerText(),
    /Padat/
  );

  await context.close();
});
