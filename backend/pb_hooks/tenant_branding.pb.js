// Identitas rumah sakit: unggah/hapus logo oleh IT Lead, dan penyajian logo
// publik untuk halaman login pada instalasi standalone.
//
// File logo tetap disimpan di collection `tenants`; akses ke file itu mengikuti
// viewRule tenant (butuh login). Route publik di bawah hanya menyajikan logo
// rumah sakit aktif dan dinonaktifkan pada mode vendor agar tidak membocorkan
// identitas salah satu tenant.

routerAdd(
  "POST",
  "/api/itsm/tenant/logo",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var audit = require(__hooks + "/lib/audit.js");

    var auth = guards.requireAuth(e);
    guards.assertLead(auth);

    var tenantId = String(auth.get("tenant") || "");
    if (!tenantId) throw new BadRequestError("Akun tidak memiliki tenant");

    var files = e.findUploadedFiles("logo");
    if (!files || files.length !== 1) {
      throw new BadRequestError("Pilih satu file logo");
    }

    var tenant = e.app.findRecordById("tenants", tenantId);
    tenant.set("logo", files[0]);

    try {
      e.app.save(tenant);
    } catch (err) {
      throw new BadRequestError(
        "Logo tidak valid. Gunakan PNG, JPG, atau WEBP maksimal 2 MB."
      );
    }

    var meta = audit.requestMeta(e);
    audit.write(e.app, {
      tenant: tenantId,
      actor: auth,
      action: "update",
      collection_name: "tenants",
      record_id: tenant.id,
      changes: { field: "logo" },
      ip: meta.ip,
      user_agent: meta.user_agent,
    });

    return e.json(200, {
      tenant: {
        id: tenant.id,
        name: String(tenant.get("name") || ""),
        code: String(tenant.get("code") || ""),
        logo: String(tenant.get("logo") || ""),
      },
    });
  },
  $apis.requireAuth()
);

routerAdd(
  "DELETE",
  "/api/itsm/tenant/logo",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var audit = require(__hooks + "/lib/audit.js");

    var auth = guards.requireAuth(e);
    guards.assertLead(auth);

    var tenantId = String(auth.get("tenant") || "");
    if (!tenantId) throw new BadRequestError("Akun tidak memiliki tenant");

    var tenant = e.app.findRecordById("tenants", tenantId);
    tenant.set("logo", "");
    e.app.save(tenant);

    var meta = audit.requestMeta(e);
    audit.write(e.app, {
      tenant: tenantId,
      actor: auth,
      action: "update",
      collection_name: "tenants",
      record_id: tenant.id,
      changes: { field: "logo", removed: true },
      ip: meta.ip,
      user_agent: meta.user_agent,
    });

    return e.json(200, {
      tenant: {
        id: tenant.id,
        name: String(tenant.get("name") || ""),
        code: String(tenant.get("code") || ""),
        logo: "",
      },
    });
  },
  $apis.requireAuth()
);

routerAdd("GET", "/api/itsm/branding/logo", (e) => {
  var tenancy = require(__hooks + "/lib/tenancy.js");

  if (tenancy.isVendor()) {
    throw new NotFoundError("Logo tidak tersedia");
  }

  var rows = e.app.findRecordsByFilter(
    "tenants",
    "is_active = true",
    "",
    1,
    0
  );

  if (!rows.length) throw new NotFoundError("Logo tidak tersedia");

  var tenant = rows[0];
  var logo = String(tenant.get("logo") || "");

  if (!logo) throw new NotFoundError("Logo tidak tersedia");

  var collection = e.app.findCollectionByNameOrId("tenants");
  var directory =
    e.app.dataDir() + "/storage/" + collection.id + "/" + tenant.id;

  return e.fileFS($os.dirFS(directory), logo);
});
