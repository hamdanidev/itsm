#!/usr/bin/env node
/**
 * Mengambil screenshot panduan dari aplikasi yang sedang berjalan.
 *
 *   npm run guide:shots
 *   npm run guide:shots -- --only 02-pemohon
 *   npm run guide:shots -- --list
 *
 * Prasyarat (mode pengembangan, instance terpisah agar data rumah sakit tidak
 * tersentuh):
 *
 *   PB_HTTP=127.0.0.1:8091 PB_DATA_DIR=.tmp/pb_data-guide node scripts/dev.mjs --pb-only
 *   PB_TARGET=http://127.0.0.1:8091 VITE_DEV_PORT=5174 node scripts/dev.mjs --web-only
 *   PB_URL=http://127.0.0.1:8091 npm run seed -- --profile busy --seed 42
 *   GUIDE_BASE_URL=http://localhost:5174 GUIDE_PB_URL=http://127.0.0.1:8091 npm run guide:shots
 *
 * Setiap shot diambil dari manifest `docs/USER-GUIDE/shots.json`. Skrip gagal
 * keras bila halaman, selektor, atau data demo tidak sesuai — lebih baik tidak
 * menghasilkan gambar sama sekali daripada panduan yang menyesatkan.
 */
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { findChromium } from "../../tests/lib/chromium.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const GUIDE_DIR = path.join(ROOT, "docs/USER-GUIDE");
const IMG_DIR = path.join(GUIDE_DIR, "img");

const args = process.argv.slice(2);
const only = valueOf("--only", "");
const listOnly = args.includes("--list");
const manifest = JSON.parse(
  await readFile(path.join(GUIDE_DIR, "shots.json"), "utf8")
);

const baseUrl = (process.env.GUIDE_BASE_URL || manifest.baseUrl).replace(/\/$/, "");
const pbUrl = (process.env.GUIDE_PB_URL || manifest.pbUrl).replace(/\/$/, "");
const password = process.env.GUIDE_PASSWORD || manifest.password;
const adminEmail = process.env.GUIDE_PB_ADMIN || manifest.admin.email;
const adminPassword = process.env.GUIDE_PB_PASSWORD || manifest.admin.password;
const viewport = manifest.viewport || { width: 1440, height: 900 };

function valueOf(name, fallback) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
}

let superuserToken = null;

async function api(pathname, params = {}) {
  const url = new URL(pbUrl + pathname);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: superuserToken ? { Authorization: superuserToken } : {},
  });

  if (!response.ok) {
    throw new Error(`GET ${pathname} -> HTTP ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function authenticate() {
  if (superuserToken) return superuserToken;

  const response = await fetch(`${pbUrl}/api/collections/_superusers/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: adminEmail, password: adminPassword }),
  });

  if (!response.ok) {
    throw new Error(
      `Login superuser ${adminEmail} gagal (HTTP ${response.status}). ` +
        "Periksa GUIDE_PB_URL/GUIDE_PB_ADMIN/GUIDE_PB_PASSWORD."
    );
  }

  const data = await response.json();
  superuserToken = data.token;
  return superuserToken;
}

/** Menentukan record yang dipakai shot lewat filter, bukan ID yang di-hardcode. */
async function resolvePick(shot) {
  if (!shot.pick) return null;

  await authenticate();
  const { collection, filter, sort, field } = shot.pick;
  const data = await api(`/api/collections/${collection}/records`, {
    filter,
    sort,
    perPage: 1,
  });
  const record = data.items[0];

  if (!record) {
    throw new Error(
      `[${shot.id}] tidak ada record untuk filter: ${filter}. ` +
        "Jalankan seed ulang dengan profil yang sama."
    );
  }

  return field ? record[field] : record.id;
}

/** Nilai dinamis pada path, mis. token reset dari email_outbox. */
async function resolveVar(shot, name, spec) {
  await authenticate();

  const data = await api(`/api/collections/${spec.collection}/records`, {
    filter: spec.filter,
    sort: spec.sort,
    perPage: 1,
  });
  const record = data.items[0];

  if (!record) {
    throw new Error(
      `[${shot.id}] variabel "${name}": tidak ada record ${spec.collection} ` +
        `untuk filter ${spec.filter}. Jalankan shot persiapan lebih dulu.`
    );
  }

  const source = String(record[spec.field] || "").trim();

  if (!spec.regex) return source;

  const match = new RegExp(spec.regex).exec(source);

  if (!match?.[1]) {
    throw new Error(
      `[${shot.id}] variabel "${name}": pola ${spec.regex} tidak cocok pada ${spec.field}.`
    );
  }

  return match[1];
}

/** Satu halaman browser per peran, login sekali lalu dipakai ulang. */
const sessions = new Map();

async function sessionFor(key, { anonymous = false } = {}) {
  if (sessions.has(key)) return sessions.get(key);

  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();

  if (!anonymous) {
    await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
    await page.fill("#email", key);
    await page.fill("#password", password);
    await page.click("button.login-submit");

    try {
      await page.waitForSelector(".topbar", { timeout: 25_000 });
    } catch {
      const error = await page
        .locator(".login-error")
        .innerText()
        .catch(() => "tidak ada pesan error di halaman login");
      throw new Error(`Login ${key} gagal: ${error}`);
    }
  }

  sessions.set(key, page);
  return page;
}

const QUIET_CSS = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
  }
  ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
`;

async function runAction(page, action) {
  if (action.type === "wait") {
    await page.waitForTimeout(action.ms || 300);
    return;
  }

  const locator = page.locator(action.selector).first();
  await locator.waitFor({ state: "visible", timeout: 20_000 });

  switch (action.type) {
    case "click":
      await locator.click();
      break;
    case "fill":
      await locator.fill(action.value);
      break;
    case "select":
      await locator.selectOption(
        action.index !== undefined ? { index: action.index } : { label: action.label }
      );
      break;
    case "check":
      await locator.check();
      break;
    case "press":
      await locator.press(action.key || "Enter");
      break;
    default:
      throw new Error(`Tipe aksi tidak dikenal: ${action.type}`);
  }

  await page.waitForTimeout(180);
}

/** Outline + badge angka, disuntik ke DOM sebelum capture. */
async function annotate(page, highlights) {
  const boxes = [];
  const viewportWidth = viewport.width;

  for (const item of highlights) {
    const locator = page.locator(item.selector).first();

    if ((await locator.count()) === 0) {
      throw new Error(`Elemen highlight tidak ada: ${item.selector}`);
    }

    await locator.evaluate((element) => {
      element.style.outline = "3px solid #0052CC";
      element.style.outlineOffset = "2px";
      element.style.borderRadius = "2px";
    });

    const box = await locator.boundingBox();
    if (!box) continue;

    // Badge diletakkan di luar elemen supaya tidak menutupi teks tombol/label.
    let left = box.x - 26;
    let top = box.y + Math.min(Math.max(box.height / 2 - 12, 0), 36);

    if (item.placement === "above" || left < 4) {
      left = box.x + 6;
      top = box.y - 26;
    }

    if (item.placement !== "above" && left < 4) {
      left = box.x + box.width + 8;
    }

    if (left + 26 > viewportWidth) {
      left = Math.max(4, viewportWidth - 30);
    }

    boxes.push({ label: item.label, left, top });
  }

  await page.evaluate((items) => {
    document.querySelectorAll("[data-guide-badge]").forEach((node) => node.remove());

    for (const item of items) {
      const badge = document.createElement("span");
      badge.dataset.guideBadge = "1";
      badge.textContent = item.label;
      badge.style.cssText = [
        "position:fixed",
        "z-index:2147483647",
        "background:#0052CC",
        "color:#fff",
        'font:600 12px/1.2 "Segoe UI",system-ui,sans-serif',
        "padding:3px 6px",
        "border-radius:3px",
        "border:2px solid #fff",
        "box-shadow:0 1px 4px rgba(0,0,0,.35)",
        `left:${Math.max(2, item.left)}px`,
        `top:${Math.max(2, item.top)}px`,
        "pointer-events:none",
      ].join(";");
      document.body.appendChild(badge);
    }
  }, boxes);
}

async function capture(shot) {
  const anonymous = Boolean(shot.anonymous);
  const page = await sessionFor(anonymous ? "__anon__" : shot.role, { anonymous });

  const values = {};
  const picked = await resolvePick(shot);
  if (picked) values.id = picked;

  for (const [name, spec] of Object.entries(shot.vars || {})) {
    values[name] = await resolveVar(shot, name, spec);
  }

  const target = shot.path.replace(/\{(\w+)\}/g, (match, key) =>
    values[key] === undefined ? match : values[key]
  );

  await page.goto(`${baseUrl}${target}`, { waitUntil: "domcontentloaded" });
  await page.addStyleTag({ content: QUIET_CSS });

  if (shot.waitFor) {
    await page.waitForSelector(shot.waitFor, { timeout: 25_000 });
  } else {
    await page.waitForSelector(".topbar", { timeout: 25_000 });
  }

  for (const action of shot.actions || []) {
    await runAction(page, action);
  }

  if (shot.waitAfterActions) {
    await page.waitForSelector(shot.waitAfterActions, { timeout: 25_000 });
  }

  // Tunggu skeleton/loading hilang supaya gambar tidak menampilkan tabel kosong.
  await page
    .waitForFunction(
      () => !document.querySelector(".table-skeleton, .skeleton, .centered-page"),
      null,
      { timeout: 15_000 }
    )
    .catch(() => {});

  const scrollTarget = shot.scrollTo || shot.highlight?.[0]?.selector;
  if (scrollTarget === "top") {
    // Sebagian halaman menggulir di container internal, bukan window.
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.querySelectorAll("*").forEach((element) => {
        if (element.scrollTop > 0) element.scrollTop = 0;
      });
    });
    await page.waitForTimeout(250);
  } else if (scrollTarget) {
    await page
      .locator(scrollTarget)
      .first()
      .evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }))
      .catch(() => {});
    await page.waitForTimeout(250);
  }

  await annotate(page, shot.highlight || []);

  const file = path.join(IMG_DIR, `${shot.id}.jpg`);
  await mkdir(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, type: "jpeg", quality: 88 });
  await page.waitForTimeout(100);
}

async function main() {
  const shots = manifest.shots.filter((shot) => !only || shot.id.startsWith(only));

  if (shots.length === 0) {
    throw new Error(`Tidak ada shot yang cocok dengan --only "${only}".`);
  }

  if (listOnly) {
    for (const shot of shots) console.log(`${shot.id}  (${shot.role})`);
    return;
  }

  console.log(`Mengambil ${shots.length} screenshot dari ${baseUrl}`);
  browser = await chromium.launch({
    executablePath: await findChromium(),
    headless: true,
  });

  const started = Date.now();

  for (const shot of shots) {
    try {
      await capture(shot);
      console.log(`✓ ${shot.id}`);
    } catch (error) {
      throw new Error(`${shot.id}: ${error.message}`);
    }
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`Selesai: ${shots.length} gambar dalam ${seconds} detik.`);
}

let browser = null;

try {
  await main();
} catch (error) {
  console.error(`\nGagal: ${error.message}`);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
}
