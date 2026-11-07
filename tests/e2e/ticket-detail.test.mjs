// E2E detail tiket: bilah aksi lengket, panel SLA di atas, riwayat per hari,
// modal penyelesaian bersama, dan komposer (visibilitas + Ctrl+Enter + draf).
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
  transition,
  uniqueLabel,
} from "../lib/fixtures.mjs";
import { findChromium } from "../lib/chromium.mjs";

const frontendDir = fileURLToPath(new URL("../../frontend/", import.meta.url));

const state = {
  pb: null,
  web: null,
  browser: null,
  org: null,
  ticket: null,
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
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  trackErrors(page, "detail tiket");

  await page.goto(`${state.web.url}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard$/, { timeout: 20_000 });

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

  state.org = await seedOrg({ label: uniqueLabel("detail") });

  state.ticket = await createTicket(state.org.requester.client, {
    title: "Gangguan modul farmasi setelah pembaruan",
    description:
      "Setelah pembaruan malam, resep elektronik gagal terkirim ke farmasi.",
  });

  await assignTicket(
    state.org.lead.client,
    state.ticket.id,
    state.org.support.user.id
  );
  await transition(state.org.support.client, state.ticket.id, "in_progress");

  state.web = await startVite(state.pb.url);
  state.browser = await chromium.launch({ executablePath: await findChromium() });
});

after(async () => {
  await state.browser?.close().catch(() => {});
  await state.web?.stop();
  await state.pb?.stop();

  assert.deepEqual(state.consoleErrors, [], "detail tiket tidak boleh error di console");
});

test("bilah aksi lengket, panel SLA di atas, dan riwayat dikelompokkan per hari", async () => {
  const { context, page } = await login(state.org.support.email);

  await page.goto(`${state.web.url}/tickets/${state.ticket.id}`, {
    waitUntil: "networkidle",
  });
  await page.waitForSelector(".ticket-actions");

  const position = await page
    .locator(".ticket-actions")
    .evaluate((node) => getComputedStyle(node).position);
  assert.equal(position, "sticky", "bilah aksi harus lengket di atas");

  // SLA adalah panel pertama di kolom samping.
  const firstPanel = page.locator(".detail-side-inner > .panel").first();
  assert.match(await firstPanel.locator(".panel-title").innerText(), /SLA/i);

  await page.getByRole("tab", { name: /Riwayat/ }).click();
  await page.waitForSelector(".history-day");

  assert.equal(await page.locator(".history-day").first().innerText(), "HARI INI");

  const timeText = await page.locator(".history-time").first().innerText();
  assert.match(timeText, /^\d{2}[.:]\d{2}$/, "waktu riwayat memakai jam:menit");

  await context.close();
});

test("selesaikan tiket lewat modal bersama, lalu komentar internal dengan Ctrl+Enter", async () => {
  const { context, page } = await login(state.org.support.email);

  await page.goto(`${state.web.url}/tickets/${state.ticket.id}`, {
    waitUntil: "networkidle",
  });
  await page.waitForSelector(".ticket-actions");

  await page.getByRole("button", { name: "Selesaikan" }).click();
  await page.waitForSelector("#resolve-form");

  await page
    .locator("#resolutionSummary")
    .fill("Konfigurasi antrean farmasi dikembalikan dan resep diuji ulang.");
  await page.getByRole("button", { name: "Tandai selesai" }).click();

  await page.waitForSelector(".alert--success", { timeout: 20_000 });
  assert.match(
    await page.locator(".alert--success").innerText(),
    /ditandai selesai/i
  );

  const resolved = await state.org.admin.list("tickets", {
    filter: `ticket_no = "${state.ticket.ticket_no}"`,
  });
  assert.equal(resolved.items[0].status, "resolved");
  assert.equal(resolved.items[0].resolution_code, "fixed");
  assert.match(resolved.items[0].resolution_summary, /antrean farmasi/i);

  // Komposer: pilih Internal, tulis, lalu kirim dengan Ctrl+Enter.
  await page.getByRole("button", { name: "Internal", exact: true }).click();
  await page.locator("#comment").fill("Catatan internal: cek log antrean farmasi.");
  await page.locator("#comment").press("Control+Enter");

  await page.waitForFunction(
    (text) =>
      Array.from(document.querySelectorAll(".comment-body")).some((node) =>
        node.textContent.includes(text)
      ),
    "Catatan internal: cek log antrean farmasi.",
    { timeout: 20_000 }
  );

  const comments = await state.org.admin.list("ticket_comments", {
    filter: `ticket = "${state.ticket.id}"`,
    sort: "-created",
  });
  assert.ok(comments.items.length >= 1);
  assert.equal(comments.items[0].visibility, "internal");

  // Draf komentar dipulihkan setelah muat ulang.
  await page.locator("#comment").click();
  await page.locator("#comment").pressSequentially("Draf yang belum dikirim.");
  const draftKey = `ticket-comment-draft:${state.ticket.id}`;
  await page.waitForFunction(
    (key) => Boolean(localStorage.getItem(key)),
    draftKey,
    { timeout: 15_000 }
  );

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#comment");
  await page.waitForFunction(
    () => document.querySelector("#comment")?.textContent?.includes("Draf yang belum dikirim."),
    { timeout: 10_000 }
  );

  await context.close();
});
