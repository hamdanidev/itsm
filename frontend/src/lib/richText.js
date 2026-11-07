// Rich text disimpan sebagai HTML yang sudah dibersihkan. Renderer tidak
// pernah memakai HTML mentah dari server; semua nilai melewati sanitizeHtml.
//
// Allowlist sengaja kecil: format yang benar-benar dipakai di tiket/artikel.
// Script, style, iframe, event handler, dan URL non-http dibuang.

const ALLOWED_TAGS = new Set([
  "p",
  "div",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "blockquote",
  "code",
  "pre",
  "a",
  "hr",
]);

const HTML_PATTERN =
  /<\/?(p|br|strong|b|em|i|u|s|ul|ol|li|h[1-3]|blockquote|pre|code|a|hr)\b/i;

export function isHtml(value) {
  return HTML_PATTERN.test(String(value || ""));
}

export function sanitizeHtml(value) {
  const html = String(value || "");
  if (!html) return "";

  // Lingkungan non-browser (mis. build) tidak perlu membersihkan HTML.
  if (typeof DOMParser === "undefined") return html;

  const doc = new DOMParser().parseFromString(html, "text/html");

  function clean(node) {
    const children = Array.from(node.childNodes);

    for (const child of children) {
      if (child.nodeType === Node.TEXT_NODE) continue;

      if (child.nodeType !== Node.ELEMENT_NODE) {
        child.remove();
        continue;
      }

      const tag = child.tagName.toLowerCase();

      if (
        ["script", "style", "iframe", "object", "embed", "link", "meta"].includes(
          tag
        )
      ) {
        child.remove();
        continue;
      }

      if (!ALLOWED_TAGS.has(tag)) {
        // Bersihkan isi tag yang tidak dikenal sebelum dibuka, agar elemen
        // berbahaya di dalamnya tidak lolos tanpa pemeriksaan.
        clean(child);
        while (child.firstChild) {
          node.insertBefore(child.firstChild, child);
        }
        child.remove();
        continue;
      }

      for (const attribute of Array.from(child.attributes)) {
        if (tag === "a" && attribute.name === "href") continue;
        child.removeAttribute(attribute.name);
      }

      if (tag === "a") {
        const href = String(child.getAttribute("href") || "").trim();

        if (!/^(https?:|mailto:|\/)/i.test(href)) {
          child.removeAttribute("href");
        } else {
          child.setAttribute("target", "_blank");
          child.setAttribute("rel", "noreferrer noopener");
        }
      }

      clean(child);
    }
  }

  clean(doc.body);
  return doc.body.innerHTML;
}

export function htmlToText(value) {
  const raw = String(value || "");
  if (!raw) return "";

  if (!isHtml(raw)) return raw;

  if (typeof document === "undefined") {
    return raw.replace(/<[^>]*>/g, " ");
  }

  const div = document.createElement("div");
  div.innerHTML = sanitizeHtml(raw);
  return String(div.textContent || "").replace(/\u00a0/g, " ");
}

export function richTextLength(value) {
  return htmlToText(value).trim().length;
}

export function isRichTextEmpty(value) {
  return richTextLength(value) === 0;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Nilai lama berupa teks biasa. Ubah ke HTML saat pertama kali diedit tanpa
// menghilangkan baris baru.
export function toEditorHtml(value) {
  const raw = String(value || "");
  if (!raw) return "";

  if (isHtml(raw)) return sanitizeHtml(raw);

  return escapeHtml(raw).replace(/\r?\n/g, "<br>");
}
