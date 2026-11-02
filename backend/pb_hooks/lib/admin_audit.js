// Helper audit data master. Hook callback PocketBase berjalan di VM context
// baru, jadi fungsi top-level di file hook tidak tersedia — semua helper harus
// di-require dari modul ini di dalam callback.

var AUDIT_KEYS = [
  "name",
  "code",
  "kind",
  "ticket_type",
  "priority",
  "response_minutes",
  "approval_minutes",
  "resolution_minutes",
  "calendar_mode",
  "business_days",
  "business_start",
  "business_end",
  "version",
  "date",
  "is_active",
];

function fieldValue(record, key) {
  try {
    var value = record.get(key);
    return value == null ? "" : String(value);
  } catch (err) {
    return "";
  }
}

// Snapshot diambil sebelum e.next() agar nilai lama masih tersedia.
function snapshot(record) {
  var result = {};

  for (var i = 0; i < AUDIT_KEYS.length; i++) {
    result[AUDIT_KEYS[i]] = fieldValue(record, AUDIT_KEYS[i]);
  }

  return result;
}

function diff(before, after) {
  var changes = {};

  for (var i = 0; i < AUDIT_KEYS.length; i++) {
    var key = AUDIT_KEYS[i];
    if (before[key] !== after[key]) {
      changes[key] = { from: before[key], to: after[key] };
    }
  }

  return changes;
}

function write(e, action, before) {
  try {
    var audit = require(__hooks + "/lib/audit.js");
    var record = e.record;

    if (!record) return;

    // Superuser bukan record `users`, sehingga relasi `audit_logs.actor`
    // (khusus koleksi users) tidak bisa diisi. Catat sebagai aktor
    // "superuser" tanpa relasi agar perubahan data master tidak hilang.
    var info = null;
    try {
      info = e.requestInfo ? e.requestInfo() : null;
    } catch (err) {
      info = null;
    }

    var isSuperuser = !!(info && info.hasSuperuserAuth && info.hasSuperuserAuth());
    var auth = e.auth;

    if (!auth && !isSuperuser) return;

    var changes =
      action === "update" && before
        ? diff(before, snapshot(record))
        : { name: fieldValue(record, "name") };

    var payload = {
      tenant: record.get("tenant"),
      action: action,
      collection_name: String(record.collection().name),
      record_id: record.id,
      changes: changes,
    };

    if (isSuperuser) {
      payload.actor_role = "superuser";
    } else {
      payload.actor = auth;
    }

    audit.write(e.app, payload);
  } catch (err) {
    // Perubahan data master tidak boleh gagal hanya karena audit.
    console.log("Admin audit failed: " + String(err));
  }
}

module.exports = {
  snapshot: snapshot,
  write: write,
};
