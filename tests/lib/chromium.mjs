// Mencari binary Chromium yang sudah terpasang (cache Playwright, atau path
// eksplisit). Test e2e hanya memakai playwright-core, jadi browser tidak
// diunduh otomatis.
import { access, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const RELATIVE_CANDIDATES = {
  win32: [
    path.join("chrome-win64", "chrome.exe"),
    path.join("chrome-win32", "chrome.exe"),
    path.join("chrome-headless-shell-win64", "chrome-headless-shell.exe"),
  ],
  linux: [
    path.join("chrome-linux", "chrome"),
    path.join("chrome-headless-shell-linux64", "chrome-headless-shell"),
  ],
  darwin: [
    path.join("chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
  ],
};

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function browserRoots() {
  const roots = [];

  if (process.env.PLAYWRIGHT_BROWSERS_PATH) {
    roots.push(process.env.PLAYWRIGHT_BROWSERS_PATH);
  }

  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    roots.push(path.join(process.env.LOCALAPPDATA, "ms-playwright"));
  } else {
    roots.push(path.join(os.homedir(), ".cache", "ms-playwright"));
  }

  return roots;
}

export async function findChromium() {
  const explicit =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || process.env.CHROME_PATH;

  if (explicit && (await exists(explicit))) return explicit;

  for (const root of browserRoots()) {
    let entries = [];

    try {
      entries = await readdir(root);
    } catch {
      continue;
    }

    const revisions = entries
      .filter((entry) => /^chromium(-\d+)?$/.test(entry) || /^chromium-\d+$/.test(entry))
      .sort((a, b) => {
        const left = Number(a.split("-")[1] || 0);
        const right = Number(b.split("-")[1] || 0);
        return right - left;
      });

    for (const revision of revisions) {
      for (const relative of RELATIVE_CANDIDATES[process.platform] || []) {
        const candidate = path.join(root, revision, relative);
        if (await exists(candidate)) return candidate;
      }
    }
  }

  throw new Error(
    "Chromium untuk Playwright tidak ditemukan. Jalankan " +
      "`npx playwright@1.64.1 install chromium` atau set " +
      "PLAYWRIGHT_CHROMIUM_EXECUTABLE ke path chrome/chromium."
  );
}
