// E2E form publik QR: opsi "Dampak" harus terlihat benar-benar terpilih (titik
// radio terisi, bukan hanya bingkai biru), seleksi berpindah saat opsi lain
// diklik, dan alur kirim dengan lampiran berjalan sampai layar sukses.
// Instance PocketBase + Vite sendiri supaya data dev tidak tersentuh.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { after, before, test } from "node:test";

import { chromium } from "playwright-core";

import { freePort, startPocketBase } from "../lib/pocketbase-server.mjs";
import { seedOrg, uniqueLabel } from "../lib/fixtures.mjs";
import { findChromium } from "../lib/chromium.mjs";

const frontendDir = fileURLToPath(new URL("../../frontend/", import.meta.url));

const state = {
  pb: null,
  web: null,
  browser: null,
  org: null,
  point: null,
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

async function openForm() {
  const context = await state.browser.newContext({
    viewport: { width: 1320, height: 1100 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  trackErrors(page, "form publik");

  await page.goto(`${state.web.url}/i/${state.point.token}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector(".public-impact");

  return { context, page };
}

// Membaca keadaan tiap opsi dampak: terpilih atau tidak, dan apakah titik
// radio di dalamnya benar-benar terisi (pseudo-element ::after).
async function readImpactOptions(page) {
  return page.$$eval(".public-impact", (nodes) =>
    nodes.map((node) => {
      const dot = node.querySelector(".radio-dot");
      const after = getComputedStyle(dot, "::after");
      const dotBox = getComputedStyle(dot);

      return {
        label: node.querySelector("strong")?.textContent || "",
        selected: node.classList.contains("is-selected"),
        ariaPressed: node.getAttribute("aria-pressed"),
        dotBorder: dotBox.borderTopColor,
        dotBorderWidth: dotBox.borderTopWidth,
        hasFill: after.content !== "none" && after.backgroundColor !== "rgba(0, 0, 0, 0)",
        fillColor: after.backgroundColor,
      };
    })
  );
}

before(async () => {
  state.pb = await startPocketBase();
  process.env.PB_URL = state.pb.url;
  process.env.PB_ADMIN_EMAIL = state.pb.superuser.email;
  process.env.PB_ADMIN_PASSWORD = state.pb.superuser.password;

  state.org = await seedOrg({ label: uniqueLabel("intake-ui") });

  const created = await state.org.lead.client.json("POST", "/api/itsm/intake-points", {
    body: {
      name: `Titik ${uniqueLabel("qr")}`,
      unit: state.org.unit.id,
      location: "IGD",
      max_per_hour: 20,
    },
  });
  state.point = created.point;

  state.web = await startVite(state.pb.url);
  state.browser = await chromium.launch({ executablePath: await findChromium() });
});

after(async () => {
  await state.browser?.close().catch(() => {});
  await state.web?.stop();
  await state.pb?.stop();

  assert.deepEqual(state.consoleErrors, [], "form publik tidak boleh error di console");
});

test("titik radio opsi dampak terisi untuk nilai default, bukan hanya bingkainya", async () => {
  const { context, page } = await openForm();

  const options = await readImpactOptions(page);
  assert.ok(options.length >= 4, "semua opsi dampak harus tampil");

  const selected = options.filter((option) => option.selected);
  assert.equal(selected.length, 1, "hanya satu opsi dampak boleh terpilih");
  assert.equal(selected[0].label, "Operasional", "default dampak adalah operasional");
  assert.equal(selected[0].ariaPressed, "true");
  assert.ok(
    selected[0].hasFill,
    `opsi terpilih harus menampilkan titik radio terisi (border ${selected[0].dotBorder})`
  );

  for (const option of options.filter((item) => !item.selected)) {
    assert.equal(option.ariaPressed, "false");
    assert.equal(option.hasFill, false, `opsi ${option.label} tidak boleh terisi`);
  }

  await context.close();
});

test("memilih dampak lain memindahkan titik terisi ke opsi tersebut", async () => {
  const { context, page } = await openForm();

  await page.getByRole("button", { name: /Keselamatan pasien/ }).click();
  await page.waitForTimeout(150);

  let options = await readImpactOptions(page);
  let selected = options.filter((option) => option.selected);

  assert.equal(selected.length, 1);
  assert.equal(selected[0].label, "Keselamatan pasien");
  assert.equal(selected[0].ariaPressed, "true");
  assert.ok(selected[0].hasFill, "opsi baru harus menampilkan titik radio terisi");

  const operational = options.find((option) => option.label === "Operasional");
  assert.equal(operational.selected, false);
  assert.equal(operational.hasFill, false, "opsi lama harus kembali kosong");

  // Mengklik ulang opsi yang sama tidak boleh menghapus pilihan.
  await page.getByRole("button", { name: /Keselamatan pasien/ }).click();
  await page.waitForTimeout(150);
  options = await readImpactOptions(page);
  selected = options.filter((option) => option.selected);

  assert.equal(selected.length, 1);
  assert.equal(selected[0].label, "Keselamatan pasien");

  await context.close();
});

test("langkah bisa dibuka kembali dan progres mengikuti posisi", async () => {
  const { context, page } = await openForm();

  await page.selectOption("#public-service", { index: 1 });
  await page.getByRole("button", { name: "Lanjut" }).click();
  await page.waitForSelector("#public-title");

  assert.match(await page.locator(".public-step.is-active").innerText(), /Detail/);
  assert.match(await page.locator(".public-progress").innerText(), /Langkah 2 dari 3/);
  assert.equal(await page.locator(".public-step.is-done").count(), 1);

  // Kembali ke langkah 1 lewat indikator; pilihan layanan tetap.
  await page.locator(".public-step").first().click();
  await page.waitForSelector(".public-choice-grid");
  assert.notEqual(await page.locator("#public-service").inputValue(), "");

  await page.getByRole("button", { name: "Lanjut" }).click();
  await page.waitForSelector("#public-title");

  await context.close();
});

test("kirim laporan gangguan dengan lampiran sampai layar sukses", async () => {
  const { context, page } = await openForm();

  // Langkah 1 wajib memilih layanan.
  await page.getByRole("button", { name: "Lanjut" }).click();
  await page.waitForSelector(".alert--error");
  assert.match(
    await page.locator(".alert--error").innerText(),
    /Pilih layanan/i
  );

  await page.selectOption("#public-service", { index: 1 });
  await page.getByRole("button", { name: /Alur kerja klinis/ }).click();
  await page.getByRole("button", { name: "Lanjut" }).click();
  await page.waitForSelector("#public-title");

  await page.fill(
    "#public-title",
    "Modul pendaftaran gagal menyimpan kunjungan"
  );
  await page.fill(
    "#public-description",
    "Sejak pagi tombol simpan tidak merespons dan muncul pesan error singkat."
  );

  await page.setInputFiles('.public-file-input input[type="file"]', {
    name: "bukti-layar.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    ),
  });
  await page.waitForSelector(".public-file-list li");
  assert.match(await page.locator(".file-input-name").innerText(), /1 file/i);

  await page.getByRole("button", { name: "Lanjut" }).click();
  await page.waitForSelector("#public-name");

  // Ringkasan langkah 3 harus mencerminkan pilihan langkah 1.
  const summary = await page.locator(".public-summary").innerText();
  assert.match(summary, /Laporan gangguan/);
  assert.match(summary, /1 file/);

  await page.fill("#public-name", "Rina Pratiwi");
  await page.fill("#public-contact", "rina@rs.id");
  await page.check("#public-confirm");
  await page.getByRole("button", { name: /Kirim laporan/ }).click();

  await page.waitForSelector(".public-success", { timeout: 20_000 });
  const ticketNo = (
    await page.locator(".public-success-ticket > span").first().innerText()
  ).trim();
  assert.match(ticketNo, /^INC-/, "nomor tiket insiden harus dibuat");

  // Ringkasan laporan dan salin nomor tiket.
  assert.match(
    await page.locator(".public-success-report").innerText(),
    /Modul pendaftaran gagal menyimpan kunjungan/
  );
  assert.match(
    await page.locator(".public-success-report").innerText(),
    /Laporan gangguan/
  );

  await page.locator(".public-copy").click();
  await page.waitForFunction(
    () => document.querySelector(".public-copy")?.textContent?.includes("Tersalin"),
    { timeout: 5000 }
  );

  const tickets = await state.org.admin.list("tickets", {
    filter: `ticket_no="${ticketNo}"`,
    perPage: 1,
  });
  const ticket = tickets.items[0];
  assert.ok(ticket, "tiket harus tersimpan di database");
  assert.equal(ticket.source, "web");
  assert.equal(ticket.intake_channel, "qr");
  assert.equal(ticket.intake_ref, state.point.id);
  assert.equal(ticket.location, "IGD");
  assert.equal(ticket.impact, "clinical_workflow");
  assert.equal(ticket.patient_data_confirmed, true);

  const attachments = await state.org.support.client.list("ticket_attachments", {
    filter: `ticket="${ticket.id}"`,
    perPage: 10,
  });
  assert.equal(attachments.items.length, 1, "lampiran dari form publik harus tersimpan");

  await context.close();
});
