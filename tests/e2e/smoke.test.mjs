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
  adminClient,
  assignTicket,
  createTicket,
  postComment,
  seedOrg,
  transition,
  uniqueLabel,
} from "../lib/fixtures.mjs";
import { findChromium } from "../lib/chromium.mjs";
import { loadHookModule } from "../lib/load-hook.mjs";

const totpLib = loadHookModule("lib/totp.js");

const frontendDir = fileURLToPath(new URL("../../frontend/", import.meta.url));
const PASSWORD = "RahasiaUji123!";

function currentTotp(secret) {
  return totpLib.hotp(
    secret,
    totpLib.stepFor(Math.floor(Date.now() / 1000))
  );
}

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

  state.profileUser = await addMember(state.org.admin, {
    tenantId: state.org.tenant.id,
    unitId: state.org.unit.id,
    role: "requester",
    label: "profil",
    name: "Pengguna Profil",
  });

  state.resetUser = await addMember(state.org.admin, {
    tenantId: state.org.tenant.id,
    unitId: state.org.unit.id,
    role: "requester",
    label: "reset",
    name: "Pengguna Reset",
  });

  const catalogSuffix = Date.now().toString(36).toUpperCase().slice(-6);
  state.catalogService = await state.org.admin.create("services", {
    tenant: state.org.tenant.id,
    name: `Layanan E2E ${catalogSuffix}`,
    code: `E2E-${catalogSuffix}`,
    description: "Layanan untuk menguji katalog dan intake.",
    support_unit: state.org.itUnit.id,
    is_active: true,
  });
  state.catalogItem = await state.org.admin.create("service_items", {
    tenant: state.org.tenant.id,
    service: state.catalogService.id,
    name: "Reset password E2E",
    code: "RESET-E2E",
    description: "Permintaan rutin tanpa approval.",
    approval_mode: "none",
    sort: 10,
    is_active: true,
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
    assert.ok((await page.locator(".kpi-card").count()) >= 5);

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

test("IT Lead membuka laporan SLA dan mengunduh CSV", async () => {
  const page = await login(state.org.lead.email, "**/dashboard", "lead-laporan");

  try {
    await page.goto(`${state.web.url}/reports`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".kpi-card", { timeout: 20_000 });

    assert.ok((await page.locator(".kpi-card").count()) >= 5);

    const heads = (await page.locator(".kpi-head").allInnerTexts()).map((text) =>
      text.toLowerCase()
    );
    assert.ok(heads.some((text) => text.includes("compliance sla")));
    assert.ok(heads.some((text) => text.includes("median resolusi")));

    await page.waitForSelector(".report-table tbody tr", { timeout: 20_000 });
    assert.ok((await page.locator(".report-table tbody tr").count()) > 0);

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 20_000 }),
      page.getByRole("button", { name: "Unduh CSV", exact: true }).click(),
    ]);

    assert.match(
      download.suggestedFilename(),
      /^laporan-sla-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv$/
    );

    // Jadwal laporan dan kirim manual dari panel yang sama.
    await page.selectOption(".report-schedule select", "weekly");
    await page.getByRole("button", { name: "Simpan jadwal" }).click();
    await page.waitForSelector(".report-schedule .alert--success", {
      timeout: 20_000,
    });

    await page.getByRole("button", { name: "Kirim sekarang" }).click();
    await page.waitForFunction(
      () =>
        document
          .querySelector(".report-schedule .alert--success")
          ?.textContent?.includes("Laporan dikirim"),
      null,
      { timeout: 20_000 }
    );

    // Mode cetak menyembunyikan navigasi dan filter agar hasil PDF bersih.
    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => document.body.classList.add("print-report"));
    assert.equal(
      await page.locator(".sidebar").evaluate((node) => getComputedStyle(node).display),
      "none"
    );
    assert.equal(
      await page
        .locator(".filter-bar")
        .first()
        .evaluate((node) => getComputedStyle(node).display),
      "none"
    );
    await page.evaluate(() => document.body.classList.remove("print-report"));
    await page.emulateMedia({ media: "screen" });
  } finally {
    await closePage(page);
  }
});

test("requester dialihkan keluar dari halaman laporan", async () => {
  const page = await login(state.org.requester.email, "**/tickets", "requester-laporan");

  try {
    await page.goto(`${state.web.url}/reports`, { waitUntil: "domcontentloaded" });
    await page.waitForURL("**/tickets", { timeout: 15_000 });
    assert.match(page.url(), /\/tickets$/);
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
    await page.waitForSelector(".wizard-steps", { timeout: 20_000 });
    await page.getByRole("button", { name: "Lanjut" }).click();
    await page.waitForSelector("#title", { timeout: 20_000 });

    const title = `Printer loket pendaftaran macet ${Date.now()}`;
    await page.fill("#title", title);
    await page.fill(
      "#description",
      "Printer di loket pendaftaran tidak mengeluarkan tiket antrean sejak pagi."
    );

    await page.getByRole("button", { name: "Lanjut" }).click();
    await page.waitForSelector("#confirmData", { timeout: 20_000 });
    await page.check("#confirmData");

    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(/\/tickets\/[a-z0-9]+$/, { timeout: 20_000 });
    await page.waitForSelector(".issue-title");

    assert.match(await page.locator(".issue-title").innerText(), /Printer loket pendaftaran/);
  } finally {
    await closePage(page);
  }
});

test("pengguna memperbarui profil, avatar, dan password", async () => {
  const page = await login(state.profileUser.email, "**/tickets", "profil");
  const newPassword = "PasswordBaruE2E!";
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
    "base64"
  );

  try {
    await page.locator(".user-trigger").click();
    await page.getByRole("menuitem", { name: "Profil saya" }).click();
    await page.waitForURL("**/profile", { timeout: 20_000 });
    await page.waitForSelector("#profile-name", { timeout: 20_000 });

    const newName = `Pengguna Profil ${Date.now()}`;
    await page.fill("#profile-name", newName);
    await page.getByRole("button", { name: "Simpan profil" }).click();
    await page.waitForSelector(".alert--success", { timeout: 15_000 });

    await waitFor(
      async () => (await page.locator(".user-name").innerText()) === newName,
      { label: "nama topbar berubah" }
    );

    await page.locator("#avatar-file").setInputFiles({
      name: "avatar.png",
      mimeType: "image/png",
      buffer: png,
    });
    await page.waitForSelector(".user-trigger img.avatar--image", {
      timeout: 20_000,
    });

    await page.fill("#current-password", PASSWORD);
    await page.fill("#new-password", newPassword);
    await page.fill("#confirm-password", newPassword);
    await page.getByRole("button", { name: "Ubah password" }).click();

    await page.waitForURL(/\/login\?changed=1/, { timeout: 20_000 });
    await page.waitForSelector(".login-notice", { timeout: 10_000 });

    await page.fill("#email", state.profileUser.email);
    await page.fill("#password", newPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/tickets", { timeout: 20_000 });
  } finally {
    await closePage(page);
  }

  const oldLogin = await fetch(
    `${state.pb.url}/api/collections/users/auth-with-password`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identity: state.profileUser.email,
        password: PASSWORD,
      }),
    }
  );

  assert.equal(oldLogin.status, 400, "password lama harus ditolak");
});

test("login menampilkan petunjuk akun untuk staf rumah sakit", async () => {
  const context = await state.browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  await page.goto(`${state.web.url}/login`, { waitUntil: "domcontentloaded" });
  await page.locator(".login-note").waitFor();

  assert.match(
    await page.locator(".login-note").innerText(),
    /Hubungi IT rumah sakit/
  );

  await context.close();
});

test("IT Lead menambah anggota tim dan anggota wajib ganti password", async () => {
  const page = await login(state.org.lead.email, "**/dashboard", "lead-tim");

  await page.goto(`${state.web.url}/admin`, { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: /Tim/ }).click();
  await page.waitForTimeout(1200);

  await page.getByRole("button", { name: /Tambah anggota/ }).first().click();

  const modal = page.getByRole("dialog");
  const memberEmail = `anggota.${Date.now()}@uji.local`;

  await modal.locator("#team-name").fill("Anggota Baru E2E");
  await modal.locator("#team-email").fill(memberEmail);
  await modal.locator("#team-role").selectOption("it_support");
  await modal.getByRole("button", { name: "Simpan" }).click();

  const secretBox = page.locator(".secret-box code");
  await secretBox.waitFor();
  const initialPassword = (await secretBox.innerText()).trim();
  assert.ok(initialPassword.length >= 12, "password awal harus dibuat sistem");

  await page.getByRole("dialog").getByRole("button", { name: "Selesai" }).click();
  await page.locator("tbody").getByText("Anggota Baru E2E").waitFor();

  // Reset password harus lewat konfirmasi, bukan sekali klik di kolom aksi.
  const memberRow = page.locator("tr", { hasText: "Anggota Baru E2E" });
  await memberRow.getByRole("button", { name: "Reset password" }).click();

  const confirmDialog = page.getByRole("dialog");
  await confirmDialog.getByText("Reset password anggota?").waitFor();
  await confirmDialog.getByRole("button", { name: "Batal" }).click();
  await page.waitForTimeout(400);

  assert.equal(
    await page.locator(".secret-box").count(),
    0,
    "membatalkan konfirmasi tidak boleh mereset password"
  );

  await page.context().close();

  // Anggota baru masuk dengan password awal -> wajib ganti password.
  const memberContext = await state.browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const memberPage = await memberContext.newPage();

  await memberPage.goto(`${state.web.url}/login`, { waitUntil: "domcontentloaded" });
  await memberPage.fill("#email", memberEmail);
  await memberPage.fill("#password", initialPassword);
  await memberPage.click('button[type="submit"]');
  await memberPage.waitForURL("**/change-password", { timeout: 20_000 });

  await memberPage.fill("#current-password", initialPassword);
  await memberPage.fill("#new-password", "PasswordBaru123!");
  await memberPage.fill("#confirm-password", "PasswordBaru123!");
  await memberPage.getByRole("button", { name: "Simpan password" }).click();
  await memberPage.waitForURL(/\/login\?changed=1/, { timeout: 20_000 });

  // Masuk lagi dengan password baru -> langsung ke ruang kerja.
  await memberPage.fill("#email", memberEmail);
  await memberPage.fill("#password", "PasswordBaru123!");
  await memberPage.click('button[type="submit"]');
  await memberPage.waitForURL("**/dashboard", { timeout: 20_000 });

  await memberContext.close();
});

test("IT Lead mengimpor anggota tim dari CSV", async () => {
  const page = await login(state.org.lead.email, "**/dashboard", "lead-impor");
  const suffix = Date.now().toString(36);
  const validEmail = `impor.e2e.${suffix}@uji.local`;
  const invalidEmail = `impor.e2e.rusak.${suffix}@uji.local`;

  try {
    await page.goto(`${state.web.url}/admin`, { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: /Tim/ }).click();
    await page.getByRole("button", { name: "Impor CSV" }).click();
    await page.waitForSelector("#team-import-file", {
      state: "attached",
      timeout: 15_000,
    });

    const [template] = await Promise.all([
      page.waitForEvent("download", { timeout: 15_000 }),
      page.getByRole("button", { name: "Unduh template CSV" }).click(),
    ]);

    assert.equal(template.suggestedFilename(), "template-anggota.csv");

    const body = [
      "nama,email,role,unit,tim",
      `Anggota Impor E2E,${validEmail},Staff IT,IT,Service Desk`,
      `Baris Rusak,${invalidEmail},Pemohon,Unit Tidak Ada,`,
    ].join("\r\n");

    await page.locator("#team-import-file").setInputFiles({
      name: "anggota.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(body, "utf8"),
    });

    await page.getByRole("button", { name: "Impor sekarang" }).click();
    await page.waitForSelector(".import-summary", { timeout: 20_000 });

    assert.match(
      await page.locator(".import-summary").innerText(),
      /1 dari 2 baris berhasil diimpor/
    );
    assert.ok(
      (await page.locator(".import-failures").innerText()).includes(
        "Unit tidak ditemukan"
      ),
      "baris gagal harus tampil beserta alasannya"
    );

    const [credentials] = await Promise.all([
      page.waitForEvent("download", { timeout: 15_000 }),
      page.getByRole("button", { name: "Unduh kredensial" }).click(),
    ]);

    assert.match(
      credentials.suggestedFilename(),
      /^kredensial-import-\d{4}-\d{2}-\d{2}\.csv$/
    );

    await page.getByRole("dialog").getByRole("button", { name: "Selesai" }).click();

    // Anggota hasil impor dapat dicari dan tampil di tabel tim.
    await page.getByLabel("Cari anggota tim").fill("Anggota Impor E2E");
    await page.waitForSelector('tbody tr:has-text("Anggota Impor E2E")', {
      timeout: 20_000,
    });

    assert.ok(
      (await page.locator("tbody").innerText()).includes(validEmail),
      "email anggota hasil impor harus tampil"
    );
  } finally {
    await closePage(page);
  }
});

test("pengguna mengaktifkan 2FA dan IT Lead meresetnya", async () => {
  const member = await addMember(state.org.admin, {
    tenantId: state.org.tenant.id,
    unitId: state.org.itUnit.id,
    role: "requester",
    label: "dua-faktor-e2e",
    name: "Pengguna 2FA E2E",
  });

  let secret = "";
  let recoveryCodes = [];

  const page = await login(member.email, "**/tickets", "2fa-member");

  try {
    await page.locator(".user-trigger").click();
    await page.getByRole("menuitem", { name: "Profil saya" }).click();
    await page.waitForURL("**/profile", { timeout: 20_000 });
    await page.waitForSelector(".security-block", { timeout: 20_000 });

    await page.getByRole("button", { name: "Aktifkan 2FA" }).click();
    await page.waitForSelector("#totp-current-password", { timeout: 15_000 });
    await page.fill("#totp-current-password", PASSWORD);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Lanjut" })
      .click();

    await page.waitForSelector("#totp-code", { timeout: 20_000 });
    secret = (await page.locator(".totp-secret").innerText()).trim();
    assert.ok(secret.length >= 16, "secret TOTP harus tampil untuk disalin");

    await page.fill("#totp-code", currentTotp(secret));
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Aktifkan 2FA" })
      .click();

    await page.waitForSelector(".totp-codes code", { timeout: 20_000 });
    recoveryCodes = await page.locator(".totp-codes code").allInnerTexts();
    assert.equal(recoveryCodes.length, 10);
    assert.ok(
      recoveryCodes.every((item) =>
        /^[A-Z0-9]{4}(-[A-Z0-9]{4}){2}$/.test(item)
      )
    );

    await page.getByRole("dialog").getByRole("button", { name: "Selesai" }).click();
    await waitFor(
      async () =>
        (
          await page.locator(".security-block .lozenge").innerText()
        ).toLowerCase() === "aktif",
      { label: "status 2FA aktif di profil" }
    );
  } finally {
    await closePage(page);
  }

  // Login berikutnya meminta kode dari aplikasi authenticator.
  const context = await state.browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const codePage = await context.newPage();

  try {
    await codePage.goto(`${state.web.url}/login`, {
      waitUntil: "domcontentloaded",
    });
    await codePage.fill("#email", member.email);
    await codePage.fill("#password", PASSWORD);
    await codePage.click('button[type="submit"]');
    await codePage.waitForSelector("#totp", { timeout: 20_000 });

    await codePage.fill("#totp", currentTotp(secret));
    await codePage.click('button[type="submit"]');
    await codePage.waitForURL("**/tickets", { timeout: 20_000 });
  } finally {
    await context.close().catch(() => {});
  }

  // IT Lead mereset 2FA dari modal Keamanan di tab Tim.
  const leadPage = await login(state.org.lead.email, "**/dashboard", "2fa-lead");

  try {
    await leadPage.goto(`${state.web.url}/admin`, {
      waitUntil: "domcontentloaded",
    });
    await leadPage.getByRole("tab", { name: /Tim/ }).click();
    await leadPage.getByLabel("Cari anggota tim").fill("Pengguna 2FA E2E");
    await leadPage.waitForSelector('tbody tr:has-text("Pengguna 2FA E2E")', {
      timeout: 20_000,
    });

    const row = leadPage
      .locator("tr", { hasText: "Pengguna 2FA E2E" })
      .first();
    await row.getByRole("button", { name: "Keamanan" }).click();

    const dialog = leadPage.getByRole("dialog");
    await dialog.getByText("Keamanan akun").waitFor();

    assert.match(await dialog.innerText(), /Aktif/);

    await dialog.getByRole("button", { name: "Reset 2FA" }).click();
    await leadPage.waitForSelector(".modal .alert--success", {
      timeout: 20_000,
    });

    await waitFor(
      async () => (await dialog.innerText()).includes("Nonaktif"),
      { label: "status 2FA menjadi nonaktif setelah reset" }
    );
  } finally {
    await closePage(leadPage);
  }
});

test("IT Lead mengunggah logo rumah sakit dan logo tampil di sidebar", async () => {
  const page = await login(state.org.lead.email, "**/dashboard", "lead-logo");

  try {
    await page.goto(`${state.web.url}/admin`, { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: /Identitas/ }).click();
    await page.waitForSelector("#tenant-logo", { state: "attached" });

    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );

    await page.locator("#tenant-logo").setInputFiles({
      name: "logo-rs.png",
      mimeType: "image/png",
      buffer: png,
    });

    await page.waitForSelector(".identity-preview img", { timeout: 20_000 });
    await waitFor(
      async () => (await page.locator(".project-avatar img").count()) === 1,
      { label: "logo tampil di sidebar" }
    );

    const publicLogo = await fetch(`${state.pb.url}/api/itsm/branding/logo`);
    assert.equal(publicLogo.status, 200);
    assert.match(publicLogo.headers.get("content-type") || "", /image\/png/);

    // Halaman login belum punya sesi; pastikan logo benar-benar termuat lewat
    // route publik, bukan hanya muncul sebagai elemen kosong.
    const anonContext = await state.browser.newContext();
    const anonPage = await anonContext.newPage();

    try {
      await anonPage.goto(`${state.web.url}/login`, {
        waitUntil: "domcontentloaded",
      });
      await anonPage.waitForSelector(".login-brand-logo", { timeout: 15_000 });

      const width = await anonPage
        .locator(".login-brand-logo")
        .evaluate((img) => img.naturalWidth);

      assert.ok(width > 0, "logo rumah sakit harus termuat di halaman login");
    } finally {
      await anonContext.close().catch(() => {});
    }
  } finally {
    await closePage(page);
  }
});

test("pengguna mereset password lewat tautan email", async () => {
  const page = await state.browser.newPage();

  try {
    await page.goto(`${state.web.url}/login`, { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: "Lupa password?" }).click();
    await page.waitForURL("**/forgot-password", { timeout: 15_000 });

    await page.fill("#forgot-email", state.resetUser.email);
    await page.getByRole("button", { name: "Kirim tautan reset" }).click();
    await page.waitForSelector(".login-notice", { timeout: 15_000 });

    const admin = await adminClient();
    const rows = await admin.list("email_outbox", {
      filter: `event = "link" && to = "${state.resetUser.email}"`,
      sort: "-created",
      perPage: 5,
    });

    assert.equal(rows.totalItems, 1, "email tautan reset harus terkirim");
    const match = String(rows.items[0].html).match(
      /reset-password\?token=([A-Za-z0-9._-]+)/
    );
    assert.ok(match, "tautan reset harus memuat token");

    await page.goto(
      `${state.web.url}/reset-password?token=${encodeURIComponent(match[1])}`,
      { waitUntil: "domcontentloaded" }
    );

    await page.fill("#reset-password", "PasswordResetE2E!");
    await page.fill("#reset-confirm", "PasswordResetE2E!");
    await page.getByRole("button", { name: "Simpan password baru" }).click();
    await page.waitForURL(/\/login\?reset=1/, { timeout: 20_000 });
    await page.waitForSelector(".login-notice");

    await page.fill("#email", state.resetUser.email);
    await page.fill("#password", "PasswordResetE2E!");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/tickets", { timeout: 20_000 });

    const oldLogin = await fetch(
      `${state.pb.url}/api/collections/users/auth-with-password`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identity: state.resetUser.email,
          password: PASSWORD,
        }),
      }
    );

    assert.equal(oldLogin.status, 400, "password lama harus ditolak");
  } finally {
    await page.context().close().catch(() => {});
  }
});

test("requester mengajukan permintaan dari katalog layanan", async () => {
  const page = await login(
    state.org.requester.email,
    "**/tickets",
    "catalog-request"
  );

  try {
    await page.goto(`${state.web.url}/catalog`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector(".catalog-card", { timeout: 20_000 });

    const card = page
      .locator(".catalog-card", { hasText: state.catalogService.name })
      .first();

    assert.equal(await card.count(), 1, "layanan katalog harus tampil");
    await card.getByRole("link", { name: "Ajukan" }).click();

    await page.waitForURL(/\/tickets\/new\?/, { timeout: 20_000 });
    await page.waitForFunction(
      () => Boolean(document.querySelector("#serviceItem")?.value),
      null,
      { timeout: 20_000 }
    );

    await page.getByRole("button", { name: "Lanjut" }).click();
    await page.waitForSelector("#title", { timeout: 20_000 });
    await page.fill("#title", "Reset password dari katalog E2E");
    await page.fill(
      "#description",
      "Permintaan dibuat dari katalog untuk memverifikasi intake layanan."
    );

    await page.getByRole("button", { name: "Lanjut" }).click();
    await page.waitForSelector("#confirmData", { timeout: 20_000 });
    await page.check("#confirmData");
    await page.getByRole("button", { name: "Buat tiket" }).click();

    await page.waitForURL(/\/tickets\/[a-z0-9]+$/, { timeout: 20_000 });
    await page.waitForSelector(".issue-title", { timeout: 20_000 });

    assert.match(
      await page.locator(".issue-title").innerText(),
      /Reset password dari katalog/
    );

    const side = await page.locator(".detail-side").innerText();
    assert.ok(
      side.includes(state.catalogService.name),
      "detail tiket harus menampilkan layanan"
    );
    assert.ok(
      side.includes(state.catalogItem.name),
      "detail tiket harus menampilkan item permintaan"
    );
  } finally {
    await closePage(page);
  }
});

test("staf melakukan triage prioritas dari detail tiket", async () => {
  const incident = await createTicket(state.org.requester.client, {
    type: "incident",
    impact: "operational",
    title: "Antrean farmasi lambat setelah pembaruan",
    description: "Antrean farmasi melambat dan perlu dikoreksi prioritasnya.",
  });

  const page = await login(
    state.org.support.email,
    "**/dashboard",
    "triage-detail"
  );

  try {
    await page.goto(`${state.web.url}/tickets/${incident.id}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector(".issue-title", { timeout: 20_000 });

    await page.getByRole("button", { name: "Triage" }).click();
    await page.waitForSelector("#triagePriority", { timeout: 20_000 });

    await page.selectOption("#triagePriority", "critical");
    await page.selectOption("#triageImpact", "patient_safety");
    await page.fill(
      "#triageReason",
      "Dampak keselamatan pasien lebih tinggi dari laporan awal."
    );
    await page.getByRole("button", { name: "Simpan triage" }).click();

    await page.waitForSelector("#triagePriority", {
      state: "detached",
      timeout: 20_000,
    });

    await waitFor(
      async () =>
        (await page.locator(".issue-meta-line").innerText()).includes("Kritis"),
      { label: "prioritas kritis tampil setelah triage" }
    );
  } finally {
    await closePage(page);
  }
});

test("IT Lead mengelola layanan dan item dari Pengaturan", async () => {
  const page = await login(state.org.lead.email, "**/dashboard", "admin-catalog");
  const suffix = Date.now().toString(36).toUpperCase().slice(-5);
  const serviceName = `Layanan Admin ${suffix}`;

  try {
    await page.goto(`${state.web.url}/admin`, { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: "Layanan" }).click();
    await page.waitForSelector(".catalog-admin-grid", { timeout: 20_000 });

    await page.getByRole("button", { name: "Tambah layanan" }).click();
    await page.waitForSelector("#service-name", { timeout: 15_000 });
    await page.fill("#service-name", serviceName);
    await page.fill("#service-code", `ADM-${suffix}`);
    await page.fill(
      "#service-description",
      "Layanan yang dibuat dari pengujian UI Pengaturan."
    );
    await page.locator('button[form="service-form"]').click();
    await page.waitForSelector("#service-name", {
      state: "detached",
      timeout: 20_000,
    });

    await page.waitForSelector(`.catalog-admin-table tr:has-text("${serviceName}")`);

    await page
      .locator(".catalog-admin-table tr", { hasText: serviceName })
      .first()
      .locator("td")
      .first()
      .click();
    await page.getByRole("button", { name: "Tambah item" }).first().click();
    await page.waitForSelector("#item-name", { timeout: 15_000 });
    await page.fill("#item-name", "Reset password admin E2E");
    await page.fill("#item-code", "RESET-ADMIN");
    await page.selectOption("#item-approval", "none");
    await page.locator('button[form="item-form"]').click();
    await page.waitForSelector("#item-name", {
      state: "detached",
      timeout: 20_000,
    });

    await page.waitForSelector(
      '.admin-table tr:has-text("Reset password admin E2E")'
    );
  } finally {
    await closePage(page);
  }
});

test("support membuat problem known error dari tiket", async () => {
  const incident = await createTicket(state.org.requester.client, {
    type: "incident",
    service: state.catalogService.id,
    impact: "operational",
    title: "E-resep gagal cetak setelah pembaruan",
    description: "Insiden untuk menguji problem management dari detail tiket.",
  });

  const page = await login(
    state.org.support.email,
    "**/dashboard",
    "problem-flow"
  );

  try {
    await page.goto(`${state.web.url}/tickets/${incident.id}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector(".issue-title", { timeout: 20_000 });

    await page.getByRole("button", { name: "Buat problem" }).click();
    await page.waitForSelector("#ticket-problem-title", { timeout: 15_000 });
    await page.fill(
      "#ticket-problem-title",
      "Driver printer e-resep tidak kompatibel"
    );
    await page.locator('button[form="ticket-problem-form"]').click();
    await page.waitForSelector("#ticket-problem-title", {
      state: "detached",
      timeout: 20_000,
    });

    await page.waitForSelector(".ticket-problem-head a", { timeout: 20_000 });
    const problemNo = (
      await page.locator(".ticket-problem-head a").innerText()
    ).trim();
    assert.match(problemNo, /^PRB-/);

    await page.locator(".ticket-problem-head a").click();
    await page.waitForURL(/\/problems\/[a-z0-9]+$/, { timeout: 20_000 });
    await page.waitForSelector("#problem-status", { timeout: 20_000 });

    await page.selectOption("#problem-status", "known_error");
    await page.fill(
      "#problem-root",
      "Driver versi lama tidak kompatibel dengan printer farmasi."
    );
    await page.fill(
      "#problem-workaround",
      "Gunakan printer cadangan dan cetak ulang dari antrean."
    );
    await page.getByRole("button", { name: "Simpan problem" }).click();
    await page.waitForSelector(".alert--success", { timeout: 20_000 });

    await page.goto(`${state.web.url}/tickets/${incident.id}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector(".ticket-problem-box", { timeout: 20_000 });

    const panel = await page.locator(".ticket-problem-box").innerText();
    assert.match(panel, /known error/i, `panel: ${panel}`);
    assert.ok(panel.includes("Gunakan printer cadangan"), `panel: ${panel}`);
  } finally {
    await closePage(page);
  }
});

test("IT Lead menerbitkan artikel dan requester melihat saran di intake", async () => {
  const suffix = Date.now().toString(36).slice(-5);
  const articleTitle = `Reset password SIMRS ${suffix}`;
  const articleBody =
    "Buka halaman lupa password, masukkan email terdaftar, lalu ikuti tautan reset yang dikirim.";

  const leadPage = await login(
    state.org.lead.email,
    "**/dashboard",
    "knowledge-lead"
  );

  try {
    await leadPage.goto(`${state.web.url}/knowledge`, {
      waitUntil: "domcontentloaded",
    });
    await leadPage.getByRole("button", { name: "Tulis artikel" }).click();
    await leadPage.waitForSelector("#knowledge-title", { timeout: 15_000 });
    await leadPage.fill("#knowledge-title", articleTitle);
    await leadPage.fill("#knowledge-body", articleBody);
    await leadPage.selectOption("#knowledge-visibility", "public");
    await leadPage.selectOption("#knowledge-service", state.catalogService.id);
    await leadPage.locator('button[form="knowledge-create-form"]').click();

    await leadPage.waitForURL(/\/knowledge\/[a-z0-9]+$/, { timeout: 20_000 });
    await leadPage.getByRole("button", { name: "Publikasikan" }).click();
    await leadPage.waitForSelector(".alert--success", { timeout: 20_000 });

    assert.ok(
      (await leadPage.locator(".detail-side").innerText()).includes("Terbit")
    );
  } finally {
    await closePage(leadPage);
  }

  const requesterPage = await login(
    state.org.requester.email,
    "**/tickets",
    "knowledge-requester"
  );

  try {
    await requesterPage.goto(`${state.web.url}/knowledge`, {
      waitUntil: "domcontentloaded",
    });
    await requesterPage.waitForSelector(".issue-table tbody tr", {
      timeout: 20_000,
    });

    const row = requesterPage
      .locator(".issue-table tbody tr", { hasText: articleTitle })
      .first();
    assert.equal(await row.count(), 1, "artikel publik harus terlihat requester");
    await row.locator("a").first().click();

    await requesterPage.waitForSelector(".knowledge-body", { timeout: 20_000 });
    assert.ok(
      (await requesterPage.locator(".knowledge-body").innerText()).includes(
        "lupa password"
      )
    );

    await requesterPage.goto(`${state.web.url}/tickets/new`, {
      waitUntil: "domcontentloaded",
    });
    await requesterPage.waitForSelector(".wizard-steps", { timeout: 20_000 });
    await requesterPage.getByRole("button", { name: "Lanjut" }).click();
    await requesterPage.waitForSelector("#title", { timeout: 20_000 });
    await requesterPage.fill("#title", articleTitle);

    await waitFor(
      async () =>
        (await requesterPage.locator(".knowledge-suggestions").count()) > 0,
      { label: "saran artikel di intake" }
    );
    assert.ok(
      (await requesterPage.locator(".knowledge-suggestions").innerText()).includes(
        articleTitle
      )
    );
  } finally {
    await closePage(requesterPage);
  }
});

test("editor rich text memformat teks dan membersihkan HTML berbahaya", async () => {
  const suffix = Date.now().toString(36).slice(-5);
  const articleTitle = `Panduan rich text ${suffix}`;
  const articleText = "Langkah penting untuk reset password pengguna.";

  const leadPage = await login(
    state.org.lead.email,
    "**/dashboard",
    "rich-text-lead"
  );

  try {
    await leadPage.goto(`${state.web.url}/knowledge`, {
      waitUntil: "domcontentloaded",
    });
    await leadPage.getByRole("button", { name: "Tulis artikel" }).click();
    await leadPage.waitForSelector("#knowledge-title", { timeout: 15_000 });
    await leadPage.fill("#knowledge-title", articleTitle);

    const editor = leadPage.locator("#knowledge-body");
    await editor.click();
    await leadPage.keyboard.type(articleText);
    await leadPage.keyboard.press("Control+A");
    await leadPage.locator('.rich-tool[title="Tebal"]').click();

    assert.ok(
      (await editor.locator("strong, b").count()) > 0,
      "toolbar tebal harus menghasilkan teks tebal"
    );

    await editor.evaluate((element) => {
      element.innerHTML =
        '<p>Langkah <strong onclick="window.__richXss = true">penting</strong> untuk reset password pengguna.</p>' +
        "<script>window.__richXss = true</script>";
      element.dispatchEvent(
        new InputEvent("input", { bubbles: true, inputType: "insertText" })
      );
    });

    await leadPage.selectOption("#knowledge-visibility", "public");
    await leadPage.locator('button[form="knowledge-create-form"]').click();
    await leadPage.waitForURL(/\/knowledge\/[a-z0-9]+$/, { timeout: 20_000 });

    const body = leadPage.locator(".rich-text").first();
    assert.ok((await body.innerText()).includes("Langkah penting"));
    assert.equal(await body.locator("script").count(), 0);
    assert.equal(await body.locator("[onclick]").count(), 0);
    assert.equal(
      await leadPage.evaluate(() => window.__richXss),
      undefined,
      "script dari HTML mentah tidak boleh dieksekusi"
    );
  } finally {
    await closePage(leadPage);
  }
});

test("aset/CI, CSAT, dan laporan operasional berjalan dari UI", async () => {
  const suffix = Date.now().toString(36).slice(-5);
  const assetName = `Printer E2E ${suffix}`;
  const ticketTitle = `Insiden untuk aset ${suffix}`;

  const leadPage = await login(
    state.org.lead.email,
    "**/dashboard",
    "asset-lead"
  );
  let assetId = "";

  try {
    await leadPage.goto(`${state.web.url}/assets`, {
      waitUntil: "domcontentloaded",
    });
    await leadPage.getByRole("button", { name: "Tambah aset" }).click();
    await leadPage.waitForSelector("#asset-name", { timeout: 15_000 });
    await leadPage.fill("#asset-name", assetName);
    await leadPage.selectOption("#asset-type", "printer");
    await leadPage.selectOption("#asset-criticality", "high");
    await leadPage.fill("#asset-location", "Farmasi lantai 1");
    await leadPage.selectOption("#asset-service", state.catalogService.id);
    await leadPage.locator('button[form="asset-form"]').click();

    await leadPage.waitForSelector(`text=${assetName}`, { timeout: 20_000 });
    const row = leadPage.locator(".issue-table tbody tr", { hasText: assetName }).first();
    await row.locator("a").first().click();
    await leadPage.waitForURL(/\/assets\/[a-z0-9]+$/, { timeout: 20_000 });
    assetId = leadPage.url().split("/").pop();
    assert.ok(assetId);
    await leadPage
      .getByRole("heading", { name: assetName })
      .waitFor({ timeout: 20_000 });
  } finally {
    await closePage(leadPage);
  }

  const ticket = await createTicket(state.org.requester.client, {
    type: "incident",
    impact: "operational",
    service: state.catalogService.id,
    title: ticketTitle,
    description: "Printer farmasi tidak mencetak label resep.",
  });

  const supportPage = await login(
    state.org.support.email,
    "**/dashboard",
    "asset-support"
  );

  try {
    await supportPage.goto(`${state.web.url}/tickets/${ticket.id}`, {
      waitUntil: "domcontentloaded",
    });
    await supportPage.waitForSelector("#ticket-problem-form, .detail-main", {
      timeout: 20_000,
    });
    await supportPage.getByRole("button", { name: "Tautkan aset" }).click();
    await supportPage.waitForSelector("#ticket-asset", { timeout: 15_000 });
    await supportPage.selectOption("#ticket-asset", assetId);
    await supportPage.locator('button[form="ticket-asset-form"]').click();
    await supportPage.waitForSelector(`text=${assetName}`, { timeout: 20_000 });
  } finally {
    await closePage(supportPage);
  }

  const assetPage = await login(state.org.lead.email, "**/dashboard", "asset-history");
  try {
    await assetPage.goto(`${state.web.url}/assets/${assetId}`, {
      waitUntil: "domcontentloaded",
    });
    await assetPage.waitForSelector(".issue-table tbody tr", { timeout: 20_000 });
    assert.ok(
      (await assetPage.locator(".issue-table tbody").innerText()).includes(
        ticketTitle
      )
    );
  } finally {
    await closePage(assetPage);
  }

  await assignTicket(state.org.lead.client, ticket.id, state.org.support.user.id);
  await transition(state.org.support.client, ticket.id, "in_progress");
  await transition(state.org.support.client, ticket.id, "resolved", {
    resolution_summary: "Printer sudah dibersihkan dan diuji ulang.",
    resolution_code: "fixed",
  });

  const requesterPage = await login(
    state.org.requester.email,
    "**/tickets",
    "csat-requester"
  );

  try {
    await requesterPage.goto(`${state.web.url}/tickets/${ticket.id}`, {
      waitUntil: "domcontentloaded",
    });
    await requesterPage.getByRole("button", { name: "5 dari 5" }).click();
    await requesterPage.fill("#csat-comment", "Penanganan cepat dan jelas.");
    await requesterPage.getByRole("button", { name: "Kirim penilaian" }).click();
    await requesterPage.waitForSelector(".csat-stars", { timeout: 20_000 });
    assert.ok(
      (await requesterPage.locator(".csat-stars").innerText()).includes("5/5")
    );
  } finally {
    await closePage(requesterPage);
  }

  const reportPage = await login(state.org.lead.email, "**/dashboard", "ops-report");
  try {
    await reportPage.goto(`${state.web.url}/reports`, {
      waitUntil: "domcontentloaded",
    });
    await reportPage.waitForSelector("text=Laporan operasional", {
      timeout: 20_000,
    });
    assert.ok(
      (await reportPage.locator("body").innerText()).includes("CSAT")
    );
    assert.ok(
      (await reportPage.locator("body").innerText()).includes("Insiden per layanan")
    );
  } finally {
    await closePage(reportPage);
  }
});

test("insiden mayor dideklarasikan dari tiket, diupdate, dan PIR lengkap", async () => {
  const page = await login(state.org.support.email, "**/dashboard", "incident-e2e");

  try {
    await page.goto(`${state.web.url}/tickets/${state.incident.id}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector(".issue-title", { timeout: 20_000 });

    // Deklarasi dari detail tiket: judul terisi otomatis dan tiket menjadi sumber.
    await page.getByRole("link", { name: "Deklarasikan" }).click();
    await page.waitForURL("**/incidents?ticket=*", { timeout: 20_000 });
    await page.waitForSelector("#incident-title", { timeout: 20_000 });

    assert.match(
      await page.inputValue("#incident-title"),
      /Printer label farmasi/
    );

    await page.selectOption("#incident-severity", "sev1");
    const serviceCheckbox = page.locator(".check-grid input[type=checkbox]").first();
    if ((await serviceCheckbox.count()) > 0) {
      await serviceCheckbox.check();
    }
    await page.click('button[form="incident-declare-form"]');

    await page.waitForURL(/\/incidents\/[a-z0-9]+$/, { timeout: 20_000 });
    await page.waitForSelector(".incident-update-list", { timeout: 20_000 });

    const incidentNo = (await page.locator(".breadcrumb").innerText()).match(
      /INC-\d{8}-[A-Z0-9]{6}/
    )?.[0];
    assert.ok(incidentNo, "nomor insiden harus tampil di breadcrumb");
    assert.match(await page.locator(".problem-head-meta").innerText(), /SEV-1/);

    // Update publik masuk ke timeline.
    await page.getByRole("button", { name: "Tulis update" }).click();
    await page.fill(
      "#update-body",
      "Failover jaringan selesai, pendaftaran rawat inap sudah normal."
    );
    await page.selectOption("#update-visibility", "public");
    await page.click('button[form="incident-update-form"]');
    await waitFor(
      async () =>
        (await page.locator(".incident-update-list").innerText()).includes(
          "Failover jaringan selesai"
        ),
      { label: "update publik di timeline" }
    );

    // Resolusi wajib ringkasan.
    await page.locator(".page-actions").getByRole("button", { name: "Tandai pulih" }).click();
    await page.fill(
      "#resolve-summary",
      "Uplink switch IGD dipindah ke jalur cadangan; layanan dipantau 30 menit."
    );
    await page.click('button[form="incident-resolve-form"]');
    await waitFor(
      async () => (await page.locator(".problem-head-meta").innerText()).toLowerCase().includes("dipulihkan"),
      { label: "status insiden dipulihkan" }
    );

    // PIR wajib lengkap sebelum tombol tutup aktif.
    const closeButton = page.getByRole("button", { name: "Tutup insiden" });
    assert.equal(await closeButton.isDisabled(), true);

    await page.fill("#incident-root", "Modul SFP pada switch core gagal.");
    await page.fill(
      "#incident-pir-actions",
      "Ganti modul SFP dan tambah monitoring suhu switch."
    );
    await page.getByRole("button", { name: "Simpan PIR" }).click();
    await waitFor(
      async () => (await page.locator(".panel").filter({ hasText: "Post-incident review" }).innerText()).toLowerCase().includes("pir selesai"),
      { label: "PIR tersimpan" }
    );

    await closeButton.click();
    await waitFor(
      async () => (await page.locator(".problem-head-meta").innerText()).toLowerCase().includes("ditutup"),
      { label: "insiden ditutup" }
    );
    assert.ok((await page.locator(".breadcrumb").innerText()).includes(incidentNo));

    // Detail tiket menampilkan tautan insiden mayor.
    await page.goto(`${state.web.url}/tickets/${state.incident.id}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector(".ticket-incident", { timeout: 20_000 });
    assert.ok(
      (await page.locator(".ticket-incident").innerText()).includes(incidentNo)
    );
  } finally {
    await closePage(page);
  }
});

test("pilihan tema gelap bertahan setelah muat ulang", async () => {
  const context = await state.browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: "light",
  });
  const page = await context.newPage();

  try {
    await page.goto(`${state.web.url}/login`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".login-theme", { timeout: 15_000 });

    // Default mengikuti sistem (terang), lalu diubah dari footer halaman masuk.
    assert.equal(
      await page.evaluate(() => document.documentElement.dataset.theme),
      "light"
    );

    await page.locator(".login-theme").click();
    await page.waitForTimeout(300);

    assert.equal(
      await page.evaluate(() => document.documentElement.dataset.theme),
      "dark"
    );
    assert.equal(
      await page.evaluate(() => localStorage.getItem("itsm-theme")),
      "dark"
    );

    // Warna latar harus memakai token gelap, bukan putih.
    const background = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor
    );
    assert.notEqual(background, "rgb(255, 255, 255)");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".login-theme", { timeout: 15_000 });

    assert.equal(
      await page.evaluate(() => document.documentElement.dataset.theme),
      "dark",
      "tema gelap harus bertahan setelah muat ulang"
    );
  } finally {
    await context.close();
  }
});

test("label mengambang menu sidebar terbaca pada tema gelap", async () => {
  const page = await login(
    state.org.support.email,
    "**/dashboard",
    "tooltip-gelap"
  );

  try {
    // Pilih tema gelap dari menu pengguna, seperti yang dilakukan pengguna.
    await page.locator(".user-trigger").click();
    await page.getByRole("button", { name: "Gelap", exact: true }).click();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    assert.equal(
      await page.evaluate(() => document.documentElement.dataset.theme),
      "dark"
    );

    // Ciutkan sidebar ke rail ikon supaya label mengambang muncul saat hover.
    await page.click(".sidebar-toggle");
    await page.waitForTimeout(300);
    await page.locator('.sidebar-link[href="/tickets"]').first().hover();
    await page.waitForSelector(".nav-tip", { timeout: 10_000 });

    // Kontras teks terhadap alas label mengambang harus lolos WCAG AA.
    const tip = await page.evaluate(() => {
      const element = document.querySelector(".nav-tip");
      const style = getComputedStyle(element);
      const channels = (value) =>
        value.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
      const luminance = (rgb) => {
        const [r, g, b] = rgb.map((value) => {
          const c = value / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };

      const text = luminance(channels(style.color));
      const background = luminance(channels(style.backgroundColor));

      return {
        label: element.textContent.trim(),
        contrast:
          (Math.max(text, background) + 0.05) /
          (Math.min(text, background) + 0.05),
      };
    });

    assert.equal(tip.label, "Tiket");
    assert.ok(
      tip.contrast >= 4.5,
      `kontras label mengambang ${tip.contrast.toFixed(2)}:1, minimal 4.5:1`
    );
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


