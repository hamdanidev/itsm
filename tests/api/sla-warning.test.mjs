// Pengingat pra-SLA: tiket yang tenggatnya tinggal <= 30 menit mendapat satu
// notifikasi, audit, dan email; tiket yang masih jauh tidak diberi peringatan.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import {
  createTicket,
  seedOrg,
  ticketRecord,
  uniqueLabel,
} from "../lib/fixtures.mjs";

let org;

const soon = (minutes = 20) =>
  new Date(Date.now() + minutes * 60 * 1000).toISOString();
const later = (minutes = 240) =>
  new Date(Date.now() + minutes * 60 * 1000).toISOString();

async function scan() {
  return org.admin.json("POST", "/api/itsm/dev/sla/scan", { body: {} });
}

before(async () => {
  org = await seedOrg({
    label: uniqueLabel("sla-warn"),
    isolatedTenant: true,
  });
});

describe("pengingat pra-SLA", () => {
  it("mengingatkan respons sekali dan mengirim notifikasi + email", async () => {
    const ticket = await createTicket(org.requester.client, {
      impact: "patient_safety",
      title: "Server SIMRS tidak merespons",
      description: "Aplikasi pendaftaran tidak bisa diakses sejak pagi.",
    });

    const firstScan = await scan();
    assert.ok(firstScan.by_phase.response >= 1);

    const warned = await ticketRecord(org.admin, ticket.id);
    assert.ok(warned.response_warned_at, "penanda respons harus terisi");

    const notifications = await org.admin.list("notifications", {
      filter: `ticket="${ticket.id}" && title="SLA respons hampir lewat"`,
    });
    assert.equal(notifications.totalItems, 1);
    assert.equal(notifications.items[0].user, org.lead.user.id);

    const outbox = await org.admin.list("email_outbox", {
      filter: `ticket="${ticket.id}" && subject~"SLA respons hampir lewat"`,
    });
    assert.equal(outbox.totalItems, 1);
    assert.equal(outbox.items[0].status, "queued");

    const audits = await org.admin.list("audit_logs", {
      filter: `ticket="${ticket.id}" && action="sla_warn"`,
    });
    assert.equal(audits.totalItems, 1);
    assert.equal(audits.items[0].changes.field, "response_due_at");
    assert.ok(Number(audits.items[0].changes.minutes) >= 1);

    // Pemindaian berikutnya tidak boleh mengirim peringatan yang sama.
    await scan();
    const again = await ticketRecord(org.admin, ticket.id);
    const notificationsAgain = await org.admin.list("notifications", {
      filter: `ticket="${ticket.id}" && title="SLA respons hampir lewat"`,
    });
    const auditsAgain = await org.admin.list("audit_logs", {
      filter: `ticket="${ticket.id}" && action="sla_warn"`,
    });

    assert.equal(again.response_warned_at, warned.response_warned_at);
    assert.equal(notificationsAgain.totalItems, 1);
    assert.equal(auditsAgain.totalItems, 1);
  });

  it("tidak mengingatkan tenggat yang masih jauh", async () => {
    const ticket = await createTicket(org.requester.client, {
      impact: "operational",
      title: "Permintaan reset password staf",
      description: "Staf baru membutuhkan reset password akun SIMRS.",
    });

    const record = await ticketRecord(org.admin, ticket.id);
    assert.ok(record.response_due_at, "SLA respons harus dihitung");

    await scan();

    const after = await ticketRecord(org.admin, ticket.id);
    assert.equal(after.response_warned_at, "");
  });

  it("mengingatkan batas penyelesaian yang hampir lewat", async () => {
    const ticket = await createTicket(org.requester.client, {
      impact: "operational",
      title: "Printer farmasi perlu diperiksa",
      description: "Printer mengeluarkan label tetapi kadang tersangkut.",
    });

    await org.admin.update("tickets", ticket.id, {
      resolution_due_at: soon(),
      response_due_at: later(),
    });

    await scan();

    const after = await ticketRecord(org.admin, ticket.id);
    assert.ok(after.resolution_warned_at, "penanda penyelesaian harus terisi");

    const audits = await org.admin.list("audit_logs", {
      filter: `ticket="${ticket.id}" && action="sla_warn"`,
    });
    assert.equal(audits.totalItems, 1);
    assert.equal(audits.items[0].changes.field, "resolution_due_at");
  });

  it("mengingatkan approval yang hampir lewat tanpa menunggu assignee", async () => {
    const ticket = await createTicket(org.requester.client, {
      type: "service_request",
      impact: "operational",
      title: "Permintaan akses modul laporan",
      description: "Kepala unit membutuhkan akses laporan bulanan.",
    });

    await org.admin.update("tickets", ticket.id, {
      approval_due_at: soon(),
      approval_status: "pending",
      resolution_due_at: later(),
    });

    await scan();

    const after = await ticketRecord(org.admin, ticket.id);
    assert.ok(after.approval_warned_at, "penanda approval harus terisi");

    const audits = await org.admin.list("audit_logs", {
      filter: `ticket="${ticket.id}" && action="sla_warn"`,
    });
    assert.ok(
      audits.items.some((row) => row.changes.field === "approval_due_at"),
      "audit approval harus tercatat"
    );
  });
});
