// Smoke test UI dengan Playwright: login per peran, daftar, detail, dashboard,
// approval dua tahap, dan intake tiket. Server PocketBase + Vite dijalankan
// sendiri dengan data sementara supaya tidak menyentuh data dev.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { after, before, test } from "node:test";

import { chromium } from "playwright-core";

import { freePort, startPocketBase } from "../lib/pocketbase-server.mjs";
import {
  addMember,
  assignTicket,
  createTicket,
  postComment,
  seedOrg,
  transition,
  uniqueLabel,
} from "../lib/fixtures.mjs";
import { findChromium } from "../lib/chromium.mjs";

const frontendDir = fileURLToPath(new URL("../../frontend/", import.meta.url));
const PASSWORD = "RahasiaUji123!";

const state = {
  pb: null,
  web: null,
  browser: null,
  org: null,
  incident: null,
  sr: null,
  consoleErrors: [],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check, { timeout = 20_000, interval = 200, label = "kondisi" } = {}) {
  const deadline = Date.now() + timeout;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch (error) {
      lastError = error;
    }

    await sleep(interval);
  }

  throw new Error(
    `Timeout menunggu ${label}${lastError ? `: ${lastError.message}` : ""}`
  );
}

async function startVite(pbUrl) {
  const port = await freePort();
  const viteBin = path.join(frontendDir, "node_modules", "vite", "bin", "vite.js");

  const child = spawn(
    process.execPath,
    [viteBin, "--port", String(port), "--strictPort", "--host=127.0.0.1"],
    {
      cwd: frontendDir,
      env: {
        ...process.env,
        PB_TARGET: pbUrl,
        VITE_DEV_PORT: String(port),
      },
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

async function closePage(page) {
  await page.context().close().catch(() => {});
}

before(async () => {
  state.pb = await startPocketBase();
  process.env.PB_URL = state.pb.url;
  process.env.PB_ADMIN_EMAIL = state.pb.superuser.email;
  process.env.PB_ADMIN_PASSWORD = state.pb.superuser.password;

  state.org = await seedOrg({ label: uniqueLabel("e2e") });
  const { requester, support } = state.org;

  state.incident = await createTicket(requester.client, {
    type: "incident",
    impact: "clinical_workflow",
    title: "Printer label farmasi tidak mencetak",
    description: "Printer label di loket farmasi dua tidak mengeluarkan label.",
  });

  await assignTicket(support.client, state.incident.id, support.user.id);
  await transition(support.client, state.incident.id, "in_progress");
  await postComment(
    support.client,
    state.incident.id,
    "Kami sedang memeriksa antrean cetak di server.",
    "public"
  );
  await postComment(
    support.client,
    state.incident.id,
    "Catatan internal: driver printer sudah usang.",
    "internal"
  );

  state.sr = await createTicket(requester.client, {
    type: "service_request",
    title: "Reset password akun kasir shift pagi",
    description: "Akun kasir terkunci dan perlu direset oleh tim IT.",
  });

  state.deputy = await addMember(state.org.admin, {
    tenantId: state.org.tenant.id,
    unitId: state.org.unit.id,
    role: "requester",
    label: "wakil",
    name: "Wakil Manajer",
  });

  state.srDelegate = await createTicket(requester.client, {
    type: "service_request",
    title: "Akses akun baru untuk uji delegasi",
    description: "Permintaan ini dipakai memverifikasi delegasi approval di UI.",
  });

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

test("requester login dan melihat tiketnya di daftar", async () => {
  const page = await login(state.org.requester.email, "**/tickets", "requester");

  try {
    assert.match(await page.locator(".page-title").innerText(), /^Tiket( saya)?$/);
    await page.waitForSelector(".issue-table tbody tr");
    assert.ok(
      (await page.locator(".issue-table tbody tr", {
        hasText: "Printer label farmasi tidak mencetak",
      }).count()) >= 1,
      "tiket milik requester harus tampil"
    );
  } finally {
    await closePage(page);
  }
});

test("requester tidak melihat komentar internal di detail tiket", async () => {
  const page = await login(state.org.requester.email, "**/tickets", "requester-detail");

  try {
    await page.goto(`${state.web.url}/tickets/${state.incident.id}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector(".issue-title", { timeout: 20_000 });

    assert.match(await page.locator(".issue-title").innerText(), /Printer label/);
    await waitFor(
      async () => (await page.getByText("Kami sedang memeriksa antrean cetak").count()) === 1,
      { label: "komentar publik tampil" }
    );

    assert.equal(
      await page.getByText("Catatan internal").count(),
      0,
      "komentar internal tidak boleh terlihat requester"
    );
  } finally {
    await closePage(page);
  }
});

test("staf mendarat di dashboard dan tautan antrean membawa filter URL", async () => {
  const page = await login(state.org.support.email, "**/dashboard", "support-dashboard");

  try {
    await page.waitForSelector(".kpi-card");
    assert.equal(await page.locator(".kpi-card").count(), 5);

    const panelTitles = await page.locator(".panel-title").allInnerTexts();
    assert.ok(panelTitles.some((title) => title.includes("Antrean saya")));

    const minePanel = page.locator(".dash-panel", { hasText: "Antrean saya" }).first();
    await minePanel.locator("a.panel-link").click();
    await page.waitForURL(/\/tickets\?/, { timeout: 20_000 });

    assert.match(page.url(), /assignee=mine/);
    assert.match(page.url(), /scope=active/);
  } finally {
    await closePage(page);
  }
});

test("manajer unit menyetujui tahap 1 dari dua tahap", async () => {
  const page = await login(state.org.manager.email, "**/tickets", "manajer");

  try {
    await page.goto(`${state.web.url}/tickets/${state.sr.id}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector(".approval-step", { timeout: 20_000 });

    assert.equal(await page.locator(".approval-step").count(), 2);

    await page.getByRole("button", { name: "Setujui", exact: true }).click();
    await page.waitForSelector(".modal");
    assert.match(
      (await page.locator(".modal-desc").innerText()).toLowerCase(),
      /tahap 1 dari 2/
    );

    await page.getByRole("button", { name: "Setujui permintaan" }).click();
    await waitFor(
      async () => (await page.locator(".approval-step.is-approved").count()) === 1,
      { label: "tahap 1 disetujui" }
    );

    assert.match(
      (await page.locator(".issue-meta-line").first().innerText()).toLowerCase(),
      /menunggu/
    );
  } finally {
    await closePage(page);
  }
});

test("manajer mendelegasikan approval ke wakil lewat UI", async () => {
  const page = await login(state.org.manager.email, "**/tickets", "manajer-delegasi");

  try {
    await page.goto(`${state.web.url}/tickets/${state.srDelegate.id}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector(".approval-step", { timeout: 20_000 });

    await page.getByRole("button", { name: "Delegasikan" }).click();
    await page.waitForSelector("#delegateTarget", { timeout: 10_000 });
    await page.selectOption("#delegateTarget", state.deputy.user.id);
    await page.fill("#delegateNote", "Manajer unit cuti sampai Jumat");

    await page
      .locator(".modal")
      .getByRole("button", { name: "Delegasikan" })
      .click();

    await waitFor(
      async () =>
        (await page.getByText("Didelegasikan").count()) >= 1 &&
        (await page.getByText("Manajer unit cuti sampai Jumat").count()) >= 1,
      { label: "jejak delegasi tampil" }
    );
  } finally {
    await closePage(page);
  }

  const deputyPage = await login(state.deputy.email, "**/tickets", "wakil");

  try {
    await deputyPage.goto(`${state.web.url}/tickets/${state.srDelegate.id}`, {
      waitUntil: "domcontentloaded",
    });
    await deputyPage.waitForSelector(".approval-step", { timeout: 20_000 });

    assert.equal(
      await deputyPage.getByRole("button", { name: "Setujui", exact: true }).count(),
      1,
      "penerima delegasi harus bisa menyetujui tahap tersebut"
    );

    await deputyPage.getByRole("button", { name: "Setujui", exact: true }).click();
    await deputyPage.waitForSelector(".modal");
    await deputyPage.getByRole("button", { name: "Setujui permintaan" }).click();

    await waitFor(
      async () =>
        (await deputyPage.locator(".approval-step.is-approved").count()) === 1,
      { label: "tahap 1 disetujui pengganti" }
    );
  } finally {
    await closePage(deputyPage);
  }
});

test("IT Lead menyelesaikan approval dan support bisa mulai bekerja", async () => {
  const leadPage = await login(state.org.lead.email, "**/dashboard", "lead");

  try {
    await leadPage.goto(`${state.web.url}/tickets/${state.sr.id}`, {
      waitUntil: "domcontentloaded",
    });
    await leadPage.waitForSelector(".approval-step", { timeout: 20_000 });

    await leadPage.getByRole("button", { name: "Setujui", exact: true }).click();
    await leadPage.waitForSelector(".modal");
    await leadPage.getByRole("button", { name: "Setujui permintaan" }).click();

    await waitFor(
      async () => (await leadPage.locator(".approval-step.is-approved").count()) === 2,
      { label: "dua tahap disetujui" }
    );
    assert.match(
      (await leadPage.locator(".issue-meta-line").first().innerText()).toLowerCase(),
      /disetujui/
    );
  } finally {
    await closePage(leadPage);
  }

  const supportPage = await login(state.org.support.email, "**/dashboard", "support-start");

  try {
    await supportPage.goto(`${state.web.url}/tickets/${state.sr.id}`, {
      waitUntil: "domcontentloaded",
    });
    await supportPage.waitForSelector(".issue-title", { timeout: 20_000 });

    assert.equal(
      await supportPage.getByRole("button", { name: "Mulai kerjakan" }).count(),
      1,
      "pekerjaan boleh dimulai setelah approval final"
    );
  } finally {
    await closePage(supportPage);
  }
});

test("requester membuat tiket baru lewat form intake", async () => {
  const page = await login(state.org.requester.email, "**/tickets", "requester-create");

  try {
    await page.goto(`${state.web.url}/tickets/new`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#title", { timeout: 20_000 });

    const title = `Printer loket pendaftaran macet ${Date.now()}`;
    await page.fill("#title", title);
    await page.fill(
      "#description",
      "Printer di loket pendaftaran tidak mengeluarkan tiket antrean sejak pagi."
    );
    await page.check("#confirmData");

    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(/\/tickets\/[a-z0-9]+$/, { timeout: 20_000 });
    await page.waitForSelector(".issue-title");

    assert.match(await page.locator(".issue-title").innerText(), /Printer loket pendaftaran/);
  } finally {
    await closePage(page);
  }
});

test("tidak ada console error selama alur diuji", () => {
  assert.deepEqual(
    state.consoleErrors,
    [],
    `console error: ${state.consoleErrors.slice(0, 5).join(" || ")}`
  );
});
