// Increment B: problem management, known error/workaround, dan knowledge base.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import {
  createTicket,
  seedOrg,
  ticketRecord,
  uniqueLabel,
} from "../lib/fixtures.mjs";

let org;
let otherOrg;
let service;

function code(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase().slice(-5)}`;
}

async function createIncident(title) {
  return createTicket(org.requester.client, {
    type: "incident",
    impact: "operational",
    service: service.id,
    title,
    description: "Insiden untuk pengujian problem management dan knowledge base.",
  });
}

async function createProblem(body) {
  return org.support.client.json("POST", "/api/itsm/problems", { body });
}

async function patchProblem(id, body) {
  return org.support.client.json("PATCH", `/api/itsm/problems/${id}`, { body });
}

before(async () => {
  org = await seedOrg({ label: uniqueLabel("problem") });
  otherOrg = await seedOrg({
    label: uniqueLabel("problem-other"),
    isolatedTenant: true,
  });

  service = await org.admin.create("services", {
    tenant: org.tenant.id,
    name: "Layanan Problem Uji",
    code: code("PRB"),
    is_active: true,
  });
});

describe("problem management", () => {
  it("membuat problem dari tiket dan menautkannya", async () => {
    const incident = await createIncident("Printer farmasi gagal mencetak label");

    const problem = await createProblem({
      title: "Driver printer farmasi tidak kompatibel",
      description: "Beberapa insiden printer farmasi memiliki akar masalah yang sama.",
      ticket_id: incident.id,
    });

    assert.match(problem.problem_no, /^PRB-\d{8}-[A-Z0-9]{6}$/);
    assert.equal(problem.status, "identified");

    const ticket = await ticketRecord(org.admin, incident.id);
    assert.equal(ticket.problem, problem.id);

    const links = await org.admin.list("problem_tickets", {
      filter: `problem="${problem.id}"`,
    });
    assert.equal(links.items.length, 1);
    assert.equal(links.items[0].ticket, incident.id);
    assert.equal(links.items[0].relation, "caused_by");

    const requesterList = await org.requester.client.list("problems");
    assert.equal(requesterList.items.length, 0, "requester tidak membaca problem");

    const forbidden = await org.requester.client.request(
      "POST",
      "/api/itsm/problems",
      { body: { title: "Problem ilegal" } }
    );
    assert.equal(forbidden.status, 403);
  });

  it("known error, resolved, dan closed memiliki syarat", async () => {
    const problem = await createProblem({
      title: "Konfigurasi VLAN tidak konsisten",
      description: "Problem untuk menguji transisi status.",
    });

    const missingRoot = await org.support.client.request(
      "PATCH",
      `/api/itsm/problems/${problem.id}`,
      { body: { status: "known_error" } }
    );
    assert.equal(missingRoot.status, 400);

    const known = await patchProblem(problem.id, {
      status: "known_error",
      root_cause: "VLAN pada switch lama memakai ID yang bertabrakan.",
      workaround: "Pindahkan perangkat ke VLAN cadangan sementara.",
    });
    assert.equal(known.status, "known_error");

    const missingFix = await org.support.client.request(
      "PATCH",
      `/api/itsm/problems/${problem.id}`,
      { body: { status: "resolved" } }
    );
    assert.equal(missingFix.status, 400);

    const resolved = await patchProblem(problem.id, {
      status: "resolved",
      permanent_fix: "Migrasi VLAN dan pembaruan konfigurasi switch.",
    });
    assert.equal(resolved.status, "resolved");
    assert.ok(resolved.resolved_at);

    const closed = await patchProblem(problem.id, { status: "closed" });
    assert.equal(closed.status, "closed");

    const invalidClose = await createProblem({
      title: "Problem belum resolved",
      description: "Tidak boleh langsung ditutup.",
    });
    const closeAttempt = await org.support.client.request(
      "PATCH",
      `/api/itsm/problems/${invalidClose.id}`,
      { body: { status: "closed" } }
    );
    assert.equal(closeAttempt.status, 400);
  });

  it("menautkan tiket kedua ke problem dan menulis audit", async () => {
    const first = await createIncident("Printer radiologi tidak mencetak");
    const problem = await createProblem({
      title: "Driver printer radiologi usang",
      description: "Dua insiden printer radiologi.",
      ticket_id: first.id,
    });

    const second = await createIncident("Printer radiologi macet lagi");
    const linked = await org.support.client.json(
      "POST",
      `/api/itsm/problems/${problem.id}/tickets`,
      { body: { ticket_id: second.id, relation: "duplicate" } }
    );

    assert.equal(linked.problem.id, problem.id);

    const links = await org.admin.list("problem_tickets", {
      filter: `problem="${problem.id}"`,
      sort: "created",
    });
    assert.equal(links.items.length, 2);

    const ticket = await ticketRecord(org.admin, second.id);
    assert.equal(ticket.problem, problem.id);

    const audit = await org.admin.list("audit_logs", {
      filter: `ticket="${second.id}" && action="problem_link"`,
    });
    assert.equal(audit.items.length, 1);
    assert.equal(audit.items[0].changes.problem_no, problem.problem_no);
  });

  it("problem lintas tenant tidak dapat diubah", async () => {
    const foreign = await createProblem({
      title: "Problem rumah sakit lain",
      description: "Problem milik tenant lain.",
    });

    // Problem di atas milik org; user lain tidak bisa melihat/mengubahnya.
    const response = await otherOrg.support.client.request(
      "PATCH",
      `/api/itsm/problems/${foreign.id}`,
      { body: { status: "investigating" } }
    );

    assert.equal(response.status, 404);
  });
});

describe("knowledge base", () => {
  it("artikel draft hanya terlihat staf dan dapat diajukan review", async () => {
    const incident = await createIncident("E-resep tidak tercetak di farmasi");

    const article = await org.support.client.json(
      "POST",
      "/api/itsm/knowledge",
      {
        body: {
          title: "Cara mengatasi e-resep tidak tercetak",
          body: "Periksa driver printer, antrean cetak, dan status koneksi ke server farmasi.",
          visibility: "internal",
          service: service.id,
          ticket_id: incident.id,
        },
      }
    );

    assert.equal(article.status, "draft");
    assert.ok(article.slug);
    assert.equal(article.visibility, "internal");

    const ticket = await ticketRecord(org.admin, incident.id);
    assert.equal(ticket.kb_article, article.id);

    const requesterList = await org.requester.client.list("knowledge_articles");
    assert.equal(requesterList.items.length, 0, "draft internal tidak terlihat requester");

    const review = await org.support.client.json(
      "PATCH",
      `/api/itsm/knowledge/${article.id}`,
      { body: { status: "review" } }
    );
    assert.equal(review.status, "review");

    const supportPublish = await org.support.client.request(
      "POST",
      `/api/itsm/knowledge/${article.id}/publish`,
      { body: { status: "published" } }
    );
    assert.equal(supportPublish.status, 403);

    const published = await org.lead.client.json(
      "POST",
      `/api/itsm/knowledge/${article.id}/publish`,
      { body: { status: "published" } }
    );
    assert.equal(published.status, "published");
    assert.equal(published.reviewer, org.lead.user.id);
    assert.ok(published.published_at);

    const requesterAfter = await org.requester.client.list("knowledge_articles");
    assert.equal(
      requesterAfter.items.length,
      0,
      "artikel internal tetap tidak terlihat requester"
    );

    const audit = await org.admin.list("audit_logs", {
      filter: `collection_name="knowledge_articles" && record_id="${article.id}"`,
    });
    assert.ok(audit.items.length >= 2);
  });

  it("artikel public yang dipublikasikan terlihat requester dan dapat dicari", async () => {
    const article = await org.support.client.json("POST", "/api/itsm/knowledge", {
      body: {
        title: "Reset password akun SIMRS",
        body: "Buka halaman lupa password, masukkan email terdaftar, lalu ikuti tautan reset.",
        visibility: "public",
        service: service.id,
      },
    });

    await org.lead.client.json(
      "POST",
      `/api/itsm/knowledge/${article.id}/publish`,
      { body: { status: "published" } }
    );

    const list = await org.requester.client.list("knowledge_articles", {
      filter: 'status="published"',
    });
    assert.ok(list.items.some((item) => item.id === article.id));

    const search = await org.requester.client.json(
      "GET",
      "/api/itsm/knowledge/search?q=password&limit=5"
    );
    assert.ok(search.items.some((item) => item.id === article.id));

    const detail = await org.requester.client.json(
      "GET",
      `/api/collections/knowledge_articles/records/${article.id}`
    );
    assert.equal(detail.id, article.id);
  });

  it("pencarian menampilkan known error dan workaround", async () => {
    const problem = await createProblem({
      title: "Koneksi SATUSEHAT terputus",
      description: "Problem known error untuk pencarian.",
    });

    await patchProblem(problem.id, {
      status: "known_error",
      root_cause: "Sertifikat endpoint SATUSEHAT kedaluwarsa.",
      workaround: "Perbarui sertifikat dan restart konektor SATUSEHAT.",
    });

    const article = await org.support.client.json("POST", "/api/itsm/knowledge", {
      body: {
        title: "SATUSEHAT tidak terkirim",
        body: "Jika SATUSEHAT tidak terkirim, periksa sertifikat dan konektor.",
        visibility: "public",
        service: service.id,
        problem: problem.id,
      },
    });

    await org.lead.client.json(
      "POST",
      `/api/itsm/knowledge/${article.id}/publish`,
      { body: { status: "published" } }
    );

    const search = await org.requester.client.json(
      "GET",
      "/api/itsm/knowledge/search?q=SATUSEHAT&limit=5"
    );
    const hit = search.items.find((item) => item.id === article.id);

    assert.ok(hit, "artikel known error harus muncul");
    assert.equal(hit.known_error, true);
    assert.match(hit.workaround, /sertifikat/i);
  });

  it("staf dapat mencari artikel internal yang sudah published", async () => {
    const article = await org.support.client.json("POST", "/api/itsm/knowledge", {
      body: {
        title: "SOP internal pemeliharaan server",
        body: "Langkah internal pemeriksaan server malam.",
        visibility: "internal",
      },
    });

    await org.lead.client.json(
      "POST",
      `/api/itsm/knowledge/${article.id}/publish`,
      { body: { status: "published" } }
    );

    const staffSearch = await org.support.client.json(
      "GET",
      "/api/itsm/knowledge/search?q=pemeliharaan&limit=5"
    );
    assert.ok(staffSearch.items.some((item) => item.id === article.id));

    const requesterSearch = await org.requester.client.json(
      "GET",
      "/api/itsm/knowledge/search?q=pemeliharaan&limit=5"
    );
    assert.equal(
      requesterSearch.items.some((item) => item.id === article.id),
      false,
      "artikel internal tidak boleh muncul untuk requester"
    );
  });

  it("item knowledge lintas tenant ditolak", async () => {
    const foreignService = await otherOrg.admin.create("services", {
      tenant: otherOrg.tenant.id,
      name: "Layanan lain",
      code: code("OTHER"),
      is_active: true,
    });

    const response = await org.support.client.request(
      "POST",
      "/api/itsm/knowledge",
      {
        body: {
          title: "Artikel lintas tenant",
          body: "Artikel ini memakai layanan dari rumah sakit lain.",
          visibility: "internal",
          service: foreignService.id,
        },
      }
    );

    assert.equal(response.status, 400);
  });
});
