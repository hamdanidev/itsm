#!/usr/bin/env node
/**
 * Membangun HTML dan PDF panduan dari Markdown.
 *
 *   npm run guide:build   -> docs/USER-GUIDE/dist/panduan-pengguna.html
 *   npm run guide:pdf     -> + Panduan-Pengguna-Healthcare-ITSM-v<versi>.pdf
 *
 * Tanpa JavaScript di HTML hasil build: bisa dibuka dari file://, dari intranet,
 * atau di-ZIP untuk dikirim ke rumah sakit.
 */
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const GUIDE_DIR = path.join(ROOT, "docs/USER-GUIDE");
const DIST_DIR = path.join(GUIDE_DIR, "dist");
const PUBLIC_DIR = path.join(ROOT, "frontend/public/panduan");
const PUBLIC_FILE = path.join(ROOT, "frontend/public/panduan.html");
const withPdf = process.argv.includes("--pdf");
const withPublish = process.argv.includes("--publish");

const book = JSON.parse(await readFile(path.join(GUIDE_DIR, "book.json"), "utf8"));

/** Slug yang sama dengan gaya GitHub, cukup untuk id heading. */
function slug(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, "").trim();
}

/** Judul heading sudah di-escape `marked`; kembalikan ke teks biasa dulu. */
function headingText(html) {
  return stripTags(html)
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

/** Tambahkan id pada h1–h3 dan kumpulkan heading untuk daftar isi. */
function withHeadingIds(html, prefix) {
  const headings = [];
  const used = new Map();

  const output = html.replace(/<h([1-3])>([\s\S]*?)<\/h\1>/g, (match, level, inner) => {
    let id = `${prefix}-${slug(inner)}`;
    const count = used.get(id) || 0;
    used.set(id, count + 1);
    if (count > 0) id = `${id}-${count + 1}`;

    headings.push({ level: Number(level), id, text: headingText(inner) });
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });

  return { output, headings };
}

async function buildHtml() {
  const chapters = [];

  for (const file of book.chapters) {
    const source = await readFile(path.join(GUIDE_DIR, file), "utf8");
    const raw = marked.parse(source, { gfm: true, breaks: false });
    const prefix = `ch-${file.replace(/\.md$/, "")}`;
    const { output, headings } = withHeadingIds(raw, prefix);
    const title = headings.find((heading) => heading.level === 1)?.text || file;

    chapters.push({ file, title, html: output, headings });
  }

  const toc = chapters
    .map((chapter, index) => {
      const items = chapter.headings
        .filter((heading) => heading.level === 2)
        .map((heading) => `<li><a href="#${heading.id}">${escapeHtml(heading.text)}</a></li>`)
        .join("\n");

      return `<li class="toc-chapter">
  <a class="toc-chapter-title" href="#${chapter.headings[0].id}">${escapeHtml(chapter.title)}</a>
  <ol class="toc-sections">${items}</ol>
  <span class="toc-file">${escapeHtml(chapter.file)}</span>
</li>`;
    })
    .join("\n");

  const body = chapters
    .map((chapter, index) => {
      const previous = chapters[index - 1];
      const next = chapters[index + 1];
      const nav = [
        previous ? `<a class="nav-prev" href="#${previous.headings[0].id}">← ${escapeHtml(previous.title)}</a>` : "<span></span>",
        `<a class="nav-toc" href="#daftar-isi">Daftar isi</a>`,
        next ? `<a class="nav-next" href="#${next.headings[0].id}">${escapeHtml(next.title)} →</a>` : "<span></span>",
      ].join("");

      return `<section class="chapter" id="${chapter.headings[0].id}-section">
${chapter.html}
<nav class="chapter-nav">${nav}</nav>
</section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(book.title)}</title>
<style>
${STYLES}
</style>
</head>
<body>
<div class="page">
<header class="cover">
  <div class="cover-mark">Healthcare <span>ITSM</span></div>
  <h1 class="cover-title">${escapeHtml(book.title)}</h1>
  <p class="cover-subtitle">${escapeHtml(book.subtitle)}</p>
  <div class="cover-meta">
    <span>Versi ${escapeHtml(book.version)}</span>
    <span>${escapeHtml(book.date)}</span>
    <span>Data demo · bukan data rumah sakit nyata</span>
  </div>
</header>

<nav class="toc" id="daftar-isi">
  <h2>Daftar isi</h2>
  <ol class="toc-chapters">
${toc}
  </ol>
</nav>

<main>
${body}
</main>

<footer class="colophon">
  <p>${escapeHtml(book.title)} · versi ${escapeHtml(book.version)} · ${escapeHtml(book.date)}</p>
  <p>Dibangun dari sumber Markdown di <code>docs/USER-GUIDE/</code>. Gambar diambil
  otomatis dari instalasi demo; jangan memakai tangkapan layar dari instalasi
  rumah sakit nyata.</p>
</footer>
</div>
</body>
</html>
`;
}

const STYLES = `
  :root {
    --ink: #172b4d;
    --muted: #5e6c84;
    --line: #dfe1e6;
    --accent: #0052cc;
    --soft: #f4f5f7;
  }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0;
    color: var(--ink);
    background: #fff;
    font: 16px/1.6 "Segoe UI", system-ui, -apple-system, sans-serif;
  }
  .page { max-width: 900px; margin: 0 auto; padding: 48px 28px 64px; }

  .cover { padding: 56px 0 40px; border-bottom: 3px solid var(--accent); margin-bottom: 36px; }
  .cover-mark { color: var(--accent); font-weight: 700; letter-spacing: .2px; margin-bottom: 40px; }
  .cover-mark span { font-weight: 400; }
  .cover-title { font-size: 40px; line-height: 1.15; margin: 0 0 12px; }
  .cover-subtitle { font-size: 19px; color: var(--muted); margin: 0 0 28px; max-width: 34em; }
  .cover-meta { display: flex; flex-wrap: wrap; gap: 8px 18px; color: var(--muted); font-size: 13px; }
  .cover-meta span::before { content: "•"; margin-right: 10px; color: var(--line); }
  .cover-meta span:first-child::before { content: ""; margin: 0; }

  .toc { margin: 0 0 48px; padding: 22px 24px; border: 1px solid var(--line); border-radius: 3px; background: #fbfbfc; }
  .toc h2 { margin: 0 0 12px; font-size: 18px; }
  .toc-chapters { margin: 0; padding: 0; list-style: none; }
  .toc-chapter { margin: 12px 0; }
  .toc-chapter-title { display: block; font-weight: 600; }
  .toc-sections { margin: 4px 0 0; padding: 0 0 0 14px; list-style: none; font-size: 14px; columns: 2; column-gap: 28px; }
  .toc-sections li { margin: 2px 0; break-inside: avoid; }
  .toc-file { display: none; }

  .chapter { margin: 0 0 56px; }
  .chapter h1 { font-size: 30px; line-height: 1.2; margin: 0 0 14px; padding-bottom: 10px; border-bottom: 1px solid var(--line); }
  .chapter h2 { font-size: 21px; margin: 32px 0 10px; }
  .chapter h3 { font-size: 17px; margin: 24px 0 8px; }
  .chapter p { margin: 0 0 14px; }
  .chapter ul, .chapter ol { margin: 0 0 16px; padding-left: 24px; }
  .chapter li { margin: 4px 0; }
  .chapter li > p { margin: 4px 0; }

  .chapter img { display: block; width: 100%; height: auto; margin: 10px 0 4px; border: 1px solid var(--line); border-radius: 3px; }
  .chapter p:has(> img) { margin-bottom: 18px; }

  blockquote { margin: 18px 0; padding: 12px 16px; border-left: 3px solid var(--accent); background: #f4f7fb; }
  blockquote p:last-child { margin-bottom: 0; }

  table { width: 100%; border-collapse: collapse; margin: 14px 0 20px; font-size: 14px; }
  th, td { border: 1px solid var(--line); padding: 7px 10px; text-align: left; vertical-align: top; }
  th { background: var(--soft); }
  tr { break-inside: avoid; }

  code { background: var(--soft); padding: 1px 5px; border-radius: 3px; font-size: .9em; }
  pre { background: #f7f8f9; border: 1px solid var(--line); border-radius: 3px; padding: 12px 14px; overflow: auto; }
  pre code { background: none; padding: 0; }

  .chapter-nav { display: flex; justify-content: space-between; gap: 16px; margin-top: 36px; padding-top: 14px; border-top: 1px solid var(--line); font-size: 14px; }
  .chapter-nav .nav-toc { color: var(--muted); }

  .colophon { margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; }

  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }

  @media print {
    @page { size: A4; margin: 18mm 15mm 20mm; }
    body { font-size: 10.5pt; }
    .page { max-width: none; padding: 0; }
    .cover { break-after: page; border-bottom: none; padding-top: 40mm; }
    .cover-title { font-size: 30pt; }
    .toc { background: none; border: none; padding: 0; }
    .toc-sections { columns: 1; }
    .chapter { break-before: page; margin-bottom: 0; }
    .chapter h1 { font-size: 20pt; }
    .chapter h2 { font-size: 13pt; break-after: avoid; }
    .chapter h3 { font-size: 11.5pt; break-after: avoid; }
    .chapter p:has(> img) { break-inside: avoid; }
    .chapter img { border: 1px solid #d0d4da; }
    pre, blockquote { break-inside: avoid; }
    .chapter-nav, .colophon { display: none; }
    a { color: inherit; text-decoration: none; }
  }
`;

async function buildPdf() {
  // Diimpor dinamis supaya `--publish` (dan build HTML di Docker/CI) tidak
  // membutuhkan Chromium atau playwright-core.
  const [{ chromium }, { findChromium }, { pathToFileURL }] = await Promise.all([
    import("playwright-core"),
    import("../../tests/lib/chromium.mjs"),
    import("node:url"),
  ]);

  const htmlPath = path.join(DIST_DIR, "panduan-pengguna.html");
  const browser = await chromium.launch({
    executablePath: await findChromium(),
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
    await page.evaluate(async () => {
      await Promise.all(
        Array.from(document.images)
          .filter((image) => !image.complete)
          .map(
            (image) =>
              new Promise((resolve) => {
                image.onload = resolve;
                image.onerror = resolve;
              })
          )
      );
    });

    const footer = `<div style="width:100%;padding:0 15mm;font:8px 'Segoe UI',sans-serif;color:#5e6c84;display:flex;justify-content:space-between">
      <span>${escapeHtml(book.title)} · v${escapeHtml(book.version)}</span>
      <span>Halaman <span class="pageNumber"></span> dari <span class="totalPages"></span></span>
    </div>`;

    const file = path.join(
      DIST_DIR,
      `Panduan-Pengguna-Healthcare-ITSM-v${book.version}.pdf`
    );

    await page.pdf({
      path: file,
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: footer,
      margin: { top: "18mm", bottom: "20mm", left: "15mm", right: "15mm" },
    });

    return file;
  } finally {
    await browser.close();
  }
}

// --publish tidak membersihkan dist agar PDF hasil guide:pdf tetap ada.
if (!withPublish) {
  await rm(DIST_DIR, { recursive: true, force: true });
}
await mkdir(DIST_DIR, { recursive: true });

const html = await buildHtml();
await writeFile(path.join(DIST_DIR, "panduan-pengguna.html"), html);
await cp(path.join(GUIDE_DIR, "img"), path.join(DIST_DIR, "img"), { recursive: true });

console.log(`HTML : docs/USER-GUIDE/dist/panduan-pengguna.html`);

if (withPublish) {
  // Satu file HTML di /panduan.html + gambar di /panduan/img/. Jangan memakai
  // `<base href="/panduan/">`: elemen base juga mengubah resolusi tautan
  // `#anchor`, sehingga klik daftar isi malah pindah ke /panduan/ dan ditangkap
  // router SPA. Path gambar ditulis absolut saja.
  await rm(PUBLIC_DIR, { recursive: true, force: true });
  await mkdir(PUBLIC_DIR, { recursive: true });
  const published = html.replaceAll('src="img/', 'src="/panduan/img/');
  await writeFile(path.join(PUBLIC_FILE), published);
  await cp(path.join(GUIDE_DIR, "img"), path.join(PUBLIC_DIR, "img"), {
    recursive: true,
  });
  console.log(`SITUS: frontend/public/panduan.html (dibuka di /panduan.html)`);
}

if (withPdf) {
  const pdf = await buildPdf();
  const size = (await readFile(pdf)).length;
  console.log(`PDF  : ${path.relative(ROOT, pdf).replaceAll("\\", "/")} (${Math.round(size / 1024)} KB)`);
}
