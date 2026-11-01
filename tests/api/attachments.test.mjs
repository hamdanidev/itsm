// Lampiran terproteksi: batas jumlah, visibilitas, dan akses file dengan token.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import {
  createTicket,
  readEnv,
  seedOrg,
  uniqueLabel,
} from "../lib/fixtures.mjs";

let org;
let ticket;

async function upload(client, ticketId, { visibility = "public", content = "isi lampiran" } = {}) {
  const form = new FormData();
  form.set("file", new Blob([content], { type: "text/plain" }), `uji-${Date.now()}.txt`);
  form.set("visibility", visibility);

  return client.json("POST", `/api/itsm/tickets/${ticketId}/attachments`, { form });
}

before(async () => {
  org = await seedOrg({ label: uniqueLabel("lampiran") });
  ticket = await createTicket(org.requester.client, {
    title: "Tiket dengan lampiran untuk uji",
    description: "Tiket ini dipakai menguji unggah dan unduh lampiran terproteksi.",
  });
});


describe("lampiran tiket", () => {
  it("pemohon dan staf bisa mengunggah, maksimal tiga file", async () => {
    await upload(org.requester.client, ticket.id, { content: "lampiran publik" });
    await upload(org.support.client, ticket.id, {
      visibility: "internal",
      content: "lampiran internal",
    });
    await upload(org.support.client, ticket.id, { content: "lampiran ketiga" });

    const form = new FormData();
    form.set("file", new Blob(["keempat"], { type: "text/plain" }), "keempat.txt");
    form.set("visibility", "public");
    const fourth = await org.support.client.request(
      "POST",
      `/api/itsm/tickets/${ticket.id}/attachments`,
      { form }
    );

    assert.equal(fourth.status, 400);
    assert.match(String(fourth.data.message), /3 attachments/);
  });

  it("requester tidak melihat lampiran internal", async () => {
    const asRequester = await org.requester.client.list("ticket_attachments", {
      filter: `ticket="${ticket.id}"`,
      perPage: 50,
    });
    const asSupport = await org.support.client.list("ticket_attachments", {
      filter: `ticket="${ticket.id}"`,
      perPage: 50,
    });

    assert.equal(asRequester.items.length, 2);
    assert.equal(asSupport.items.length, 3);
    assert.ok(asSupport.items.some((item) => item.visibility === "internal"));
    assert.ok(asRequester.items.every((item) => item.visibility === "public"));
  });

  it("requester tidak boleh menambah lampiran internal", async () => {
    const extraTicket = await createTicket(org.requester.client, {
      title: "Tiket untuk uji lampiran internal pemohon",
      description: "Memastikan pemohon tidak bisa menandai lampiran sebagai internal.",
    });

    const form = new FormData();
    form.set("file", new Blob(["rahasia"], { type: "text/plain" }), "rahasia.txt");
    form.set("visibility", "internal");

    const { status } = await org.requester.client.request(
      "POST",
      `/api/itsm/tickets/${extraTicket.id}/attachments`,
      { form }
    );

    assert.equal(status, 403);
  });

  it("file terproteksi hanya bisa diunduh dengan token", async () => {
    const attachments = await org.support.client.list("ticket_attachments", {
      filter: `ticket="${ticket.id}"`,
      perPage: 50,
    });
    const internal = attachments.items.find((item) => item.visibility === "internal");
    assert.ok(internal, "lampiran internal harus ada");

    const { token } = await org.support.client.json("POST", "/api/files/token");
    const url = `${readEnv().url}/api/files/${internal.collectionId}/${internal.id}/${internal.file}`;

    const withToken = await fetch(`${url}?token=${encodeURIComponent(token)}`);
    assert.equal(withToken.status, 200);
    assert.equal(await withToken.text(), "lampiran internal");

    const withoutToken = await fetch(url);
    assert.ok(
      [403, 404].includes(withoutToken.status),
      `tanpa token harus ditolak, dapat ${withoutToken.status}`
    );
  });
});
