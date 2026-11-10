// Penjaga panduan pengguna: struktur bab, gambar, dan manifest screenshot harus
// konsisten. Test ini menangkap gambar yatim, gambar hilang (yang juga dicek
// docs.test.mjs), halaman yang sudah tidak ada di router, dan bab yang lupa
// didaftarkan di book.json.
import assert from "node:assert/strict";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUIDE = join(ROOT, "docs/USER-GUIDE");
const IMG = join(GUIDE, "img");
const ROUTER = join(ROOT, "frontend/src/app/router.jsx");

const MAX_IMAGE_BYTES = 300 * 1024;
const MAX_TOTAL_BYTES = 12 * 1024 * 1024;

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function markdownChapters() {
  return readdirSync(GUIDE).filter(
    (name) => name.endsWith(".md") && name !== "template.md" && name !== "index.md"
  );
}

function imagesIn(file) {
  const content = readFileSync(file, "utf8");
  const images = [];

  for (const match of content.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)) {
    images.push({ alt: match[1].trim(), src: match[2].trim() });
  }

  return images;
}

function imageFiles(dir) {
  if (!existsSync(dir)) return [];

  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...imageFiles(full));
    else if (/\.(jpe?g|png|webp|gif)$/i.test(entry.name)) files.push(full);
  }

  return files;
}

/** Route yang terdaftar di router.jsx, termasuk route publik dan ber-parameter. */
function routes() {
  const source = readFileSync(ROUTER, "utf8");
  const paths = [];

  for (const match of source.matchAll(/path="([^"]+)"/g)) {
    paths.push(match[1]);
  }

  return paths;
}

function routeMatches(pathname) {
  return routes().some((route) => {
    if (route === pathname) return true;

    const pattern = new RegExp(
      "^" +
        route
          .split("/")
          .map((segment) =>
            segment.startsWith(":")
              ? "[^/]+"
              : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          )
          .join("/") +
        "$"
    );

    return pattern.test(pathname);
  });
}

const book = readJson(join(GUIDE, "book.json"));
const manifest = readJson(join(GUIDE, "shots.json"));
const chapters = markdownChapters();

test("book.json mendaftarkan bab yang benar-benar ada", () => {
  assert.ok(book.title && book.version && book.date, "judul/versi/tanggal wajib diisi");
  assert.ok(Array.isArray(book.chapters) && book.chapters.length > 0, "daftar bab kosong");

  for (const file of book.chapters) {
    assert.ok(existsSync(join(GUIDE, file)), `bab tidak ditemukan: ${file}`);
  }

  assert.deepEqual(
    book.chapters.slice().sort(),
    chapters.slice().sort(),
    "setiap file bab harus terdaftar di book.json, dan sebaliknya"
  );
});

test("setiap bab punya metadata, judul, dan minimal satu gambar", () => {
  for (const file of book.chapters) {
    const full = join(GUIDE, file);
    const content = readFileSync(full, "utf8");

    assert.match(content, /^# .+/m, `${file}: tidak ada judul H1`);

    for (const field of ["Untuk", "Prasyarat", "Hasil"]) {
      assert.ok(
        content.includes(`| **${field}** |`),
        `${file}: blok metadata "${field}" tidak ada`
      );
    }

    const images = imagesIn(full);
    assert.ok(images.length > 0, `${file}: belum ada gambar`);
  }
});

test("setiap gambar bab ada, alt text terisi, dan ukurannya wajar", () => {
  const problems = [];
  let total = 0;

  for (const file of book.chapters) {
    for (const image of imagesIn(join(GUIDE, file))) {
      if (!image.alt) problems.push(`${file}: gambar tanpa alt text (${image.src})`);

      if (/^https?:/.test(image.src)) continue;

      const target = resolve(dirname(join(GUIDE, file)), image.src);
      if (!existsSync(target)) {
        problems.push(`${file}: gambar tidak ada -> ${image.src}`);
        continue;
      }

      const size = statSync(target).size;
      total += size;
      if (size > MAX_IMAGE_BYTES) {
        problems.push(
          `${image.src}: ${Math.round(size / 1024)} KB (maks ${MAX_IMAGE_BYTES / 1024} KB)`
        );
      }
    }
  }

  if (total > MAX_TOTAL_BYTES) {
    problems.push(`total gambar ${(total / 1024 / 1024).toFixed(1)} MB melebihi batas 12 MB`);
  }

  assert.deepEqual(problems, []);
});

test("manifest screenshot dan folder gambar saling lengkap", () => {
  assert.ok(Array.isArray(manifest.shots) && manifest.shots.length > 0);

  const ids = manifest.shots.map((shot) => shot.id);
  assert.equal(new Set(ids).size, ids.length, "id shot duplikat");

  const expected = new Set(ids.map((id) => join(IMG, `${id}.jpg`)).map((file) => resolve(file)));
  const actual = new Set(imageFiles(IMG).map((file) => resolve(file)));

  const missing = [...expected].filter((file) => !actual.has(file));
  const orphans = [...actual].filter((file) => !expected.has(file));

  assert.deepEqual(
    missing.map((file) => relative(ROOT, file)),
    [],
    "gambar yang tercatat di manifest tetapi tidak ada di disk"
  );
  assert.deepEqual(
    orphans.map((file) => relative(ROOT, file)),
    [],
    "gambar di disk yang tidak tercatat di manifest"
  );
});

test("setiap shot menunjuk bab dan route yang ada", () => {
  const chapterNames = new Set(book.chapters.map((file) => file.replace(/\.md$/, "")));

  for (const shot of manifest.shots) {
    const [chapter, name] = shot.id.split("/");
    assert.ok(chapter && name, `id shot harus "<bab>/<nama>": ${shot.id}`);
    assert.ok(chapterNames.has(chapter), `${shot.id}: bab "${chapter}" tidak terdaftar`);

    assert.ok(
      typeof shot.role === "string" && shot.role.includes("@"),
      `${shot.id}: role harus email akun demo`
    );

    const target = shot.path
      .replace(/\{\w+\}/g, "x")
      .split("?")[0]
      .split("#")[0];
    assert.ok(routeMatches(target), `${shot.id}: route "${shot.path}" tidak ada di router.jsx`);
  }
});

test("setiap shot yang memakai {id} punya aturan pick", () => {
  for (const shot of manifest.shots) {
    if (!shot.path.includes("{id}")) continue;

    assert.ok(shot.pick, `${shot.id}: path memakai {id} tanpa pick`);
    assert.ok(shot.pick.collection, `${shot.id}: pick.collection kosong`);
    assert.ok(
      shot.pick.filter || shot.pick.sort,
      `${shot.id}: pick butuh filter atau urutan agar pilihannya deterministik`
    );
  }
});
