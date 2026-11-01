/// <reference path="../pb_data/types.d.ts" />

// Backfill tenggat tahap approval untuk tiket yang masih menunggu saat upgrade.
// Field date kosong bisa terbaca sebagai zero-date (0001-01-01), jadi guard
// "sudah terisi" harus memeriksa nilai itu, bukan sekadar truthiness.
migrate(
  (app) => {
    const pending = app.findRecordsByFilter(
      "ticket_approvals",
      'status = "pending"',
      "",
      0,
      0
    );

    for (const step of pending) {
      const current = String(step.get("due_at") || "");
      if (current && current.indexOf("0001-01-01") !== 0) continue;

      try {
        const ticket = app.findRecordById("tickets", step.get("ticket"));
        const raw = String(ticket.get("approval_due_at") || "");
        if (!raw) continue;

        const due = new Date(raw.replace(" ", "T"));
        if (isNaN(due.getTime())) continue;

        step.set("due_at", due.toISOString());
        app.save(step);
      } catch (err) {
        console.log("backfill step due gagal:", err);
      }
    }
  },
  (app) => {
    // Data backfill dibiarkan; kolomnya dihapus oleh down migration Stage 12.
  }
);
