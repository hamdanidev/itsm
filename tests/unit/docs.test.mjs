// Penjaga dokumentasi: (1) setiap route yang didaftarkan di hooks harus
// tercatat di docs/API.md, (2) docs/API.md tidak boleh mencantumkan route
// /api/itsm yang sudah tidak ada, dan (3) semua tautan markdown lokal harus
// menunjuk berkas dan anchor yang benar. Test ini yang mencegah tabel route
// kembali menyimpang seperti sebelum perapian 2026-11-10.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const HOOKS = join(ROOT, "backend/pb_hooks");
const API_DOC = join(ROOT, "docs/API.md");

const METHOD_PATH = /"(GET|POST|PATCH|PUT|DELETE)"\s*,\s*"(\/api\/[^"]+)"/;

function read(file) {
  return readFileSync(file, "utf8");
}

/** Route yang benar-benar didaftarkan lewat routerAdd() di pb_hooks. */
function registeredRoutes() {
  const routes = [];

  for (const file of readdirSync(HOOKS).filter((name) => name.endsWith(".pb.js"))) {
    const lines = read(join(HOOKS, file)).split("\n");

    lines.forEach((line, index) => {
      if (!line.includes("routerAdd(")) return;

      const chunk = lines.slice(index, index + 5).join("\n");
      const match = METHOD_PATH.exec(chunk);
      assert.ok(
        match,
        `${file}:${index + 1} routerAdd() tanpa method/path yang bisa dibaca`
      );
      routes.push(`${match[1]} ${match[2]}`);
    });
  }

  return routes;
}

/** Baris tabel di docs/API.md dengan format `| METHOD | \`/path\` |`. */
function documentedRoutes() {
  const routes = [];

  for (const line of read(API_DOC).split("\n")) {
    const match = /^\|\s*(GET|POST|PATCH|PUT|DELETE)\s*\|\s*`([^`]+)`/.exec(line);
    if (match) routes.push(`${match[1]} ${match[2]}`);
  }

  return routes;
}

/** Slug heading gaya GitHub: huruf kecil, buang tanda baca, spasi jadi '-'. */
function slug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s\-_]/gu, "")
    .replace(/\s/g, "-");
}

function headings(file) {
  return read(file)
    .split("\n")
    .filter((line) => /^#{1,6}\s/.test(line))
    .map((line) => slug(line.replace(/^#{1,6}\s/, "")));
}

/** Semua berkas markdown yang dijaga: seluruh *.md di root dan di docs/. */
function markdownFiles() {
  const files = readdirSync(ROOT)
    .filter((name) => name.endsWith(".md"))
    .map((name) => join(ROOT, name));

  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".md")) files.push(full);
    }
  };

  walk(join(ROOT, "docs"));

  return files;
}

/** Tautan `](...)` di luar blok kode. */
function linksIn(file) {
  const links = [];
  let inFence = false;

  for (const line of read(file).split("\n")) {
    if (line.trimStart().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    for (const match of line.matchAll(/\]\(([^)\s]+)\)/g)) {
      links.push(match[1]);
    }
  }

  return links;
}

test("setiap route di pb_hooks tercatat di docs/API.md", () => {
  const documented = new Set(documentedRoutes());
  const missing = registeredRoutes().filter((route) => !documented.has(route));

  assert.deepEqual(
    missing,
    [],
    `Route berikut belum tercatat di docs/API.md: ${missing.join(", ")}`
  );
});

test("docs/API.md tidak mencantumkan route /api/itsm yang sudah tidak ada", () => {
  const registered = new Set(registeredRoutes());
  const stale = documentedRoutes().filter(
    (route) => route.includes(" /api/itsm/") && !registered.has(route)
  );

  assert.deepEqual(
    stale,
    [],
    `Route berikut ada di docs/API.md tetapi tidak lagi terdaftar di hooks: ${stale.join(", ")}`
  );
});

test("semua tautan markdown lokal menunjuk berkas dan anchor yang ada", () => {
  const broken = [];

  for (const file of markdownFiles()) {
    for (const target of linksIn(file)) {
      if (/^(https?:|mailto:)/.test(target)) continue;

      const [path, fragment = ""] = target.split("#");
      const resolved = path ? resolve(dirname(file), path) : file;

      let exists = true;
      try {
        statSync(resolved);
      } catch {
        exists = false;
      }

      if (!exists) {
        broken.push(`${file.slice(ROOT.length + 1)} -> ${target} (berkas tidak ada)`);
        continue;
      }

      if (fragment && resolved.endsWith(".md")) {
        if (!headings(resolved).includes(fragment)) {
          broken.push(`${file.slice(ROOT.length + 1)} -> ${target} (anchor tidak ada)`);
        }
      }
    }
  }

  assert.deepEqual(broken, [], `Tautan bermasalah:\n${broken.join("\n")}`);
});
