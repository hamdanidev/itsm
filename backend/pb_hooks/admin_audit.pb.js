// Jejak audit untuk perubahan data master (unit, kategori, SLA, hari libur).
// Memakai request hook + e.next() agar aktor (e.auth) tersedia dan audit baru
// ditulis setelah record benar-benar tersimpan.
var ADMIN_COLLECTIONS = [
  "units",
  "ticket_categories",
  "sla_policies",
  "holidays",
];

for (var i = 0; i < ADMIN_COLLECTIONS.length; i++) {
  (function (name) {
    onRecordCreateRequest(function (e) {
      var audit = require(__hooks + "/lib/admin_audit.js");
      e.next();
      audit.write(e, "create");
    }, name);

    onRecordUpdateRequest(function (e) {
      var audit = require(__hooks + "/lib/admin_audit.js");
      var before = audit.snapshot(e.record.original());
      e.next();
      audit.write(e, "update", before);
    }, name);
  })(ADMIN_COLLECTIONS[i]);
}
