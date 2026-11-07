// Helper validasi katalog. Dipisah ke modul karena callback hook berjalan di
// VM context baru; fungsi top-level di file .pb.js tidak tersedia di dalam
// callback.

function sameTenant(app, collection, id, tenantId) {
  if (!id) return true;

  try {
    var record = app.findRecordById(collection, id);
    return String(record.get("tenant") || "") === tenantId;
  } catch (err) {
    return false;
  }
}

module.exports = {
  sameTenant: sameTenant,
};
