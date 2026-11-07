// Helper knowledge base. Wajib di-require di dalam callback route.

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function uniqueSlug(app, tenantId, title) {
  var base = slugify(title) || "artikel";

  for (var i = 0; i < 5; i++) {
    var candidate =
      base +
      "-" +
      $security.randomStringWithAlphabet(
        4,
        "abcdefghijkmnpqrstuvwxyz23456789"
      );

    var existing = null;
    try {
      existing = app.findFirstRecordByFilter(
        "knowledge_articles",
        "tenant = {:tenant} && slug = {:slug}",
        { tenant: tenantId, slug: candidate }
      );
    } catch (err) {
      existing = null;
    }

    if (!existing) return candidate;
  }

  throw new BadRequestError("Gagal membuat slug artikel, coba lagi");
}

function snippet(body, max) {
  var text = String(body || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|li|h[1-3]|blockquote|pre|div)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  var limit = max || 280;
  if (text.length <= limit) return text;
  return text.slice(0, limit - 1) + "…";
}

function response(article) {
  return {
    id: article.id,
    title: String(article.get("title") || ""),
    slug: String(article.get("slug") || ""),
    body: String(article.get("body") || ""),
    status: String(article.get("status") || ""),
    visibility: String(article.get("visibility") || ""),
    service: String(article.get("service") || ""),
    problem: String(article.get("problem") || ""),
    tags: String(article.get("tags") || ""),
    author: String(article.get("author") || ""),
    reviewer: String(article.get("reviewer") || ""),
    published_at: String(article.get("published_at") || ""),
  };
}

function linkTicket(app, article, ticket) {
  ticket.set("kb_article", article.id);
  ticket.set("last_activity_at", new Date().toISOString());
  app.save(ticket);
}

module.exports = {
  uniqueSlug: uniqueSlug,
  snippet: snippet,
  response: response,
  linkTicket: linkTicket,
};
