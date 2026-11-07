/// <reference path="../pb_data/types.d.ts" />

// Backfill Increment A untuk tiket yang sudah ada:
// - `requested_for` diisi requester agar laporan/on-behalf punya nilai awal.
// - `approval_mode` diisi "default" agar tiket lama tetap memakai alur approval
//   yang sama seperti sebelumnya.
//
// `service` dan `service_item` sengaja dibiarkan kosong: tiket lama tidak bisa
// ditebak layanannya tanpa data historis. Admin dapat menautkannya lewat triage
// bila diperlukan.

migrate(
  (app) => {
    const tickets = app.findRecordsByFilter("tickets", "", "", 0, 0);

    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      const requester = String(ticket.get("requester") || "");

      if (!String(ticket.get("requested_for") || "") && requester) {
        ticket.set("requested_for", requester);
      }

      if (!String(ticket.get("approval_mode") || "")) {
        ticket.set("approval_mode", "default");
      }

      app.save(ticket);
    }
  },
  (app) => {
    const tickets = app.findRecordsByFilter("tickets", "", "", 0, 0);

    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      if (String(ticket.get("approval_mode") || "") === "default") {
        ticket.set("approval_mode", "");
      }
      app.save(ticket);
    }
  }
);
