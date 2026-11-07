// E2E papan Kanban: kolom, drag transisi tervalidasi, menu pindah kartu, dan
// modal penyelesaian bersama.
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
  open: null,
  doing: null,
  waiting: null,
  done: null,
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
  trackErrors(page, "papan");

  await page.goto(`${state.web.url}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard$/, { timeout: 20_000 });

  return { context, page };
}


async function waitForStatus(ticketNo, status, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  let last = "";

  while (Date.now() < deadline) {
    const list = await state.org.admin.list("tickets", {
      filter: `ticket_no = "${ticketNo}"`,
    });
    last = list.items[0]?.status || "";
    if (last === status) return;
    await sleep(200);
  }

  throw new Error(
    `Tiket ${ticketNo} tidak berubah ke ${status} (status terakhir: ${last})`
  );
}

async function openBoard(page) {
  await page.goto(`${state.web.url}/tickets`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Papan/ }).click();
  await page.waitForURL(/view=board/);
  await page.waitForSelector(".board-column");
  // Tunggu fetch kolom selesai (skeleton hilang).
  await page.waitForFunction(
    () => document.querySelectorAll(".board-card").length > 0,
    { timeout: 20_000 }
  );
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

  const org = (state.org = await seedOrg({ label: uniqueLabel("board") }));

  state.open = await createTicket(org.requester.client, {
    title: "Pendaftaran poli gagal menyimpan kunjungan",
  });
  state.doing = await createTicket(org.requester.client, {
    title: "Printer triase tidak mencetak label",
  });
  state.waiting = await createTicket(org.requester.client, {
    title: "Hasil lab belum masuk rekam medis",
  });
  state.done = await createTicket(org.requester.client, {
    title: "Koneksi jaringan radiologi lambat",
  });

  // doing: assigned (kolom Dikerjakan)
  await assignTicket(org.lead.client, state.doing.id, org.support.user.id);

  // waiting: assigned lalu waiting
  await assignTicket(org.lead.client, state.waiting.id, org.support.user.id);
  await transition(org.support.client, state.waiting.id, "in_progress");
  await transition(org.support.client, state.waiting.id, "waiting");

  // done: resolved
  await assignTicket(org.lead.client, state.done.id, org.support.user.id);
  await transition(org.support.client, state.done.id, "in_progress");
  await transition(org.support.client, state.done.id, "resolved", {
    resolution_summary: "Kabel jaringan diganti dan koneksi diuji ulang.",
    resolution_code: "fixed",
  });

  state.web = await startVite(state.pb.url);
  state.browser = await chromium.launch({ executablePath: await findChromium() });
});

after(async () => {
  await state.browser?.close().catch(() => {});
  await state.web?.stop();
  await state.pb?.stop();

  assert.deepEqual(state.consoleErrors, [], "papan tidak boleh error di console");
});

test("papan menampilkan empat kolom dan bisa kembali ke daftar", async () => {
  const { context, page } = await login(state.org.support.email);
  await openBoard(page);

  const titles = await page.$$eval(".board-column-title", (nodes) =>
    nodes.map((node) => node.textContent.trim())
  );

  assert.deepEqual(titles, ["Baru", "Dikerjakan", "Menunggu pelapor", "Selesai"]);

  // Tab status disembunyikan di papan.
  assert.equal(await page.locator(".tabs").count(), 0);

  const counts = await page.$$eval(".board-column", (nodes) =>
    nodes.map((node) => node.querySelectorAll(".board-card").length)
  );
  assert.deepEqual(counts, [1, 1, 1, 1]);

  // Kembali ke daftar lewat tombol.
  await page.getByRole("button", { name: /Daftar/ }).click();
  await page.waitForURL((url) => !url.search.includes("view=board"));
  await page.waitForSelector(".issue-table");

  await context.close();
});

test("drag kartu memindahkan tiket sesuai aturan transisi", async () => {
  const { context, page } = await login(state.org.support.email);
  await openBoard(page);

  // Baru → Dikerjakan: mulai mengerjakan (auto-claim).
  await page.dragAndDrop(
    ".board-column.is-new .board-card",
    ".board-column.is-doing .board-column-head"
  );

  // Tunggu efeknya di server; notifikasi lama bisa masih terlihat.
  await waitForStatus(state.open.ticket_no, "in_progress");

  const records = await state.org.admin.list("tickets", {
    filter: `ticket_no = "${state.open.ticket_no}"`,
  });
  assert.equal(records.items[0].assignee, state.org.support.user.id);

  // Dikerjakan → Menunggu pelapor.
  await page.dragAndDrop(
    `.board-column.is-doing .board-card:has-text("${state.doing.ticket_no}")`,
    ".board-column.is-waiting .board-column-head"
  );

  await waitForStatus(state.doing.ticket_no, "waiting");

  await context.close();
});

test("menu kartu bisa menyelesaikan tiket lewat modal bersama", async () => {
  const { context, page } = await login(state.org.support.email);
  await openBoard(page);

  // tOpen sudah in_progress setelah test sebelumnya.
  const card = page
    .locator(`.board-column.is-doing .board-card:has-text("${state.open.ticket_no}")`)
    .first();
  await card.locator(".board-card-menu").click();
  await page.waitForSelector(".board-card-actions");
  await page.getByRole("menuitem", { name: /Selesaikan/ }).click();

  await page.waitForSelector("#resolve-form");
  await page
    .locator("#resolutionSummary")
    .fill("Antrean pendaftaran dibersihkan dan simpan kunjungan diuji ulang.");
  await page.getByRole("button", { name: "Tandai selesai" }).click();

  await waitForStatus(state.open.ticket_no, "resolved");

  const records = await state.org.admin.list("tickets", {
    filter: `ticket_no = "${state.open.ticket_no}"`,
  });
  assert.equal(records.items[0].resolution_code, "fixed");

  await context.close();
});

test("tiket yang menunggu approval tidak bisa dipindahkan ke Dikerjakan", async () => {
  const sr = await createTicket(state.org.requester.client, {
    type: "service_request",
    title: "Permintaan akses modul farmasi",
  });

  const { context, page } = await login(state.org.support.email);
  await openBoard(page);

  const card = page
    .locator(`.board-column.is-new .board-card:has-text("${sr.ticket_no}")`)
    .first();
  await card.locator(".board-card-menu").click();

  const workItem = page.getByRole("menuitem", { name: /Kerjakan/ });
  assert.equal(
    await workItem.isDisabled(),
    true,
    "menu Kerjakan harus nonaktif saat approval belum disetujui"
  );

  const records = await state.org.admin.list("tickets", {
    filter: `ticket_no = "${sr.ticket_no}"`,
  });
  assert.equal(records.items[0].status, "open");
  assert.equal(records.items[0].approval_status, "pending");

  await context.close();
});
