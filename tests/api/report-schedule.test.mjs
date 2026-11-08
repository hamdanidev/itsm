// Jadwal laporan SLA: simpan frekuensi, kirim manual, dan jalankan cron
// (lewat route development) dengan antrean email + audit.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import {
  createTicket,
  seedOrg,
  uniqueLabel,
} from "../lib/fixtures.mjs";

let org;

before(async () => {
  org = await seedOrg({
    label: uniqueLabel("report-schedule"),
    isolatedTenant: true,
  });

  await createTicket(org.requester.client, {
    title: "Tiket untuk laporan terjadwal",
    description: "Tiket ini dipakai untuk memastikan laporan berisi data.",
  });
});

describe("jadwal laporan SLA", () => {
  it("hanya Kepala IT yang dapat membaca dan mengubah jadwal", async () => {
    const support = await org.support.client.request(
      "GET",
      "/api/itsm/reports/schedule"
    );
    const requester = await org.requester.client.request(
      "GET",
      "/api/itsm/reports/schedule"
    );

    assert.equal(support.status, 403);
    assert.equal(requester.status, 403);

    const schedule = await org.lead.client.json(
      "GET",
      "/api/itsm/reports/schedule"
    );

    assert.equal(schedule.frequency, "off");
    assert.equal(schedule.recipients, 1);
  });

  it("menyimpan jadwal mingguan dan menghitung pengiriman berikutnya", async () => {
    const saved = await org.lead.client.json(
      "PATCH",
      "/api/itsm/reports/schedule",
      { body: { frequency: "weekly" } }
    );

    assert.equal(saved.frequency, "weekly");
    assert.ok(saved.next_at, "jadwal berikutnya harus dihitung");
    assert.ok(new Date(saved.next_at).getTime() > Date.now());

    const tenant = await org.admin.json(
      "GET",
      `/api/collections/tenants/records/${org.tenant.id}`
    );
    assert.equal(tenant.report_frequency, "weekly");
    assert.ok(tenant.report_next_at);

    const audits = await org.admin.list("audit_logs", {
      filter: `tenant="${org.tenant.id}" && action="report_schedule"`,
      sort: "-created",
    });
    assert.ok(audits.totalItems >= 1);
    assert.equal(audits.items[0].changes.frequency, "weekly");
  });

  it("kirim manual mengantrekan ringkasan laporan ke Kepala IT", async () => {
    const result = await org.lead.client.json(
      "POST",
      "/api/itsm/reports/schedule/run",
      { body: {} }
    );

    assert.equal(result.recipients, 1);
    assert.equal(result.sent, 1);

    const outbox = await org.admin.list("email_outbox", {
      filter: `tenant="${org.tenant.id}" && template="report"`,
      sort: "-created",
    });

    assert.equal(outbox.totalItems, 1);
    assert.equal(outbox.items[0].to, org.lead.email);
    assert.equal(outbox.items[0].status, "queued");
    assert.match(outbox.items[0].subject, /Laporan SLA manual/i);
    assert.match(outbox.items[0].text, /Total: 1/);
    assert.match(outbox.items[0].text, /\/reports/);
  });

  it("cron mengirim jadwal yang jatuh tempo dan menghitung ulang next_at", async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    await org.admin.update("tenants", org.tenant.id, {
      report_frequency: "monthly",
      report_next_at: past,
    });

    const result = await org.admin.json(
      "POST",
      "/api/itsm/dev/reports/scan",
      { body: {} }
    );

    assert.ok(result.tenants >= 1);
    assert.ok(result.sent >= 1);

    const tenant = await org.admin.json(
      "GET",
      `/api/collections/tenants/records/${org.tenant.id}`
    );
    assert.equal(tenant.report_frequency, "monthly");
    assert.ok(tenant.report_last_sent_at);
    assert.ok(
      new Date(tenant.report_next_at).getTime() > Date.now(),
      "next_at harus di masa depan"
    );

    const outbox = await org.admin.list("email_outbox", {
      filter: `tenant="${org.tenant.id}" && template="report"`,
      sort: "-created",
    });
    assert.ok(outbox.totalItems >= 2);
    assert.match(outbox.items[0].subject, /Laporan SLA bulanan/i);
  });

  it("menonaktifkan jadwal membersihkan next_at", async () => {
    const saved = await org.lead.client.json(
      "PATCH",
      "/api/itsm/reports/schedule",
      { body: { frequency: "off" } }
    );

    assert.equal(saved.frequency, "off");
    assert.equal(saved.next_at, "");

    const fresh = await org.admin.json(
      "GET",
      `/api/collections/tenants/records/${org.tenant.id}`
    );
    assert.equal(fresh.report_frequency, "off");
    assert.equal(fresh.report_next_at, "");
  });
});
