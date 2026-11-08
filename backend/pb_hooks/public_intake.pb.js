// Intake publik lewat titik QR.
// Helper ada di lib/intake_public.js karena callback route berjalan di VM baru.

routerAdd("GET", "/api/itsm/public/intake/{token}", (e) => {
  var intakeLib = require(__hooks + "/lib/intake_public.js");
  var token = e.request.pathValue("token");
  var found = intakeLib.findPoint(e.app, token);
  var point = found.point;
  var tenant = found.tenant;
  var tenantId = String(tenant.id);

  var unit = null;
  try {
    unit = e.app.findRecordById("units", String(point.get("unit") || ""));
  } catch (err) {
    unit = null;
  }

  var services = e.app.findRecordsByFilter(
    "services",
    "tenant = {:tenant} && is_active = true",
    "name",
    0,
    0,
    { tenant: tenantId }
  );

  var items = e.app.findRecordsByFilter(
    "service_items",
    "tenant = {:tenant} && is_active = true",
    "sort,name",
    0,
    0,
    { tenant: tenantId }
  );

  var byService = {};
  for (var i = 0; i < items.length; i++) {
    var serviceId = String(items[i].get("service") || "");
    if (!byService[serviceId]) byService[serviceId] = [];
    byService[serviceId].push({
      id: items[i].id,
      name: String(items[i].get("name") || ""),
      description: String(items[i].get("description") || ""),
      approval_mode: String(items[i].get("approval_mode") || ""),
    });
  }

  var servicePayload = [];
  for (var j = 0; j < services.length; j++) {
    servicePayload.push({
      id: services[j].id,
      name: String(services[j].get("name") || ""),
      description: String(services[j].get("description") || ""),
      items: byService[services[j].id] || [],
    });
  }

  var logo = String(tenant.get("logo") || "");

  return e.json(200, {
    tenant: {
      name: String(tenant.get("name") || ""),
      code: String(tenant.get("code") || ""),
      logo_url: logo
        ? "/api/itsm/public/intake/" + encodeURIComponent(token) + "/logo"
        : "",
    },
    point: {
      name: String(point.get("name") || ""),
      location: String(point.get("location") || ""),
      unit_name: unit ? String(unit.get("name") || "") : "",
    },
    services: servicePayload,
    impacts: [
      {
        value: "patient_safety",
        label: "Keselamatan pasien",
        description: "Berpotensi membahayakan pasien atau menghentikan layanan klinis.",
      },
      {
        value: "clinical_workflow",
        label: "Alur kerja klinis",
        description: "Menghambat pendaftaran, farmasi, laboratorium, atau tindakan.",
      },
      {
        value: "operational",
        label: "Operasional",
        description: "Mengganggu pekerjaan, tetapi ada workaround.",
      },
      {
        value: "convenience",
        label: "Kenyamanan",
        description: "Tidak menghambat layanan; bersifat perbaikan atau kenyamanan.",
      },
    ],
    limits: { max_files: 3, max_file_mb: 10 },
  });
});

routerAdd("GET", "/api/itsm/public/intake/{token}/logo", (e) => {
  var intakeLib = require(__hooks + "/lib/intake_public.js");
  var found = intakeLib.findPoint(e.app, e.request.pathValue("token"));
  var tenant = found.tenant;
  var logo = String(tenant.get("logo") || "");

  if (!logo) throw new NotFoundError("Logo tidak tersedia");

  var collection = e.app.findCollectionByNameOrId("tenants");
  var directory =
    e.app.dataDir() + "/storage/" + collection.id + "/" + tenant.id;

  return e.fileFS($os.dirFS(directory), logo);
});

routerAdd("POST", "/api/itsm/public/intake/{token}", (e) => {
  var intakeLib = require(__hooks + "/lib/intake_public.js");
  var guards = require(__hooks + "/lib/guards.js");
  var constants = require(__hooks + "/lib/constants.js");
  var sla = require(__hooks + "/lib/sla.js");
  var audit = require(__hooks + "/lib/audit.js");
  var notify = require(__hooks + "/lib/notify.js");
  var approvals = require(__hooks + "/lib/approvals.js");
  var mail = require(__hooks + "/lib/mail.js");

  var token = e.request.pathValue("token");
  var payload = intakeLib.parsePayload(e);
  var files = [];

  try {
    files = e.findUploadedFiles("files") || [];
  } catch (err) {
    files = [];
  }

  try {
    var single = e.findUploadedFiles("file") || [];
    files = files.concat(single);
  } catch (err) {
    // tidak ada field tunggal
  }

  if (files.length > 3) {
    throw new BadRequestError("Maksimal 3 lampiran per tiket");
  }

  for (var fi = 0; fi < files.length; fi++) {
    var size = Number(files[fi].size || 0);
    if (size > 10 * 1024 * 1024) {
      throw new BadRequestError("Ukuran setiap lampiran maksimal 10 MB");
    }

    var fileName = String(
      files[fi].originalName || files[fi].name || "lampiran"
    );
    var ext = fileName.split(".").pop().toLowerCase();
    if (
      ["pdf", "png", "jpg", "jpeg", "webp", "txt", "log"].indexOf(ext) < 0
    ) {
      throw new BadRequestError(
        "Tipe lampiran tidak didukung. Gunakan PDF, PNG, JPG, WEBP, TXT, atau LOG."
      );
    }
  }

  if (String(payload.honeypot || "").trim()) {
    throw new BadRequestError("Permintaan tidak valid");
  }

  if (payload.form_started_at) {
    var started = Number(payload.form_started_at);
    if (!isNaN(started)) {
      var elapsed = Date.now() - started;
      // Batas atas mencegah form lama dikirim ulang. Tidak ada batas bawah:
      // pengguna yang mengisi cepat (atau memakai autofill) tetap dilayani;
      // penyalahgunaan ditahan oleh honeypot, token, dan rate limit.
      if (elapsed > 24 * 60 * 60 * 1000) {
        throw new BadRequestError("Form sudah kedaluwarsa. Muat ulang halaman.");
      }
    }
  }

  var type = String(payload.type || "incident");
  if (["incident", "service_request"].indexOf(type) < 0) {
    throw new BadRequestError(
      "Perubahan harus diajukan oleh staf IT melalui portal internal"
    );
  }

  var title = guards.cleanText(payload.title, 160);
  var description = guards.cleanText(payload.description, 10000);
  var impact = String(payload.impact || "");

  if (title.length < 5) {
    throw new BadRequestError("Judul minimal 5 karakter");
  }
  if (description.length < 10) {
    throw new BadRequestError("Deskripsi minimal 10 karakter");
  }
  if (constants.IMPACTS.indexOf(impact) < 0) {
    throw new BadRequestError("Dampak tidak valid");
  }
  if (!intakeLib.isTrue(payload.patient_data_confirmed)) {
    throw new BadRequestError(
      "Konfirmasi bahwa tiket tidak memuat data pasien wajib dicentang"
    );
  }

  var reporterName = intakeLib.textOf(payload.reporter_name, 120);
  var reporterContact = intakeLib.textOf(payload.reporter_contact, 120);

  if (reporterName.length < 2) {
    throw new BadRequestError("Nama pelapor minimal 2 karakter");
  }
  if (!intakeLib.contactIsValid(reporterContact)) {
    throw new BadRequestError(
      "Isi email atau nomor telepon/WhatsApp yang valid agar tim IT bisa menghubungi Anda"
    );
  }

  var serviceId = String(payload.service || "");
  var serviceItemId = String(payload.service_item || "");

  if (!serviceId) {
    throw new BadRequestError("Pilih layanan yang sesuai");
  }

  var requestLocation = intakeLib.textOf(payload.location, 120);
  var found = intakeLib.findPoint(e.app, token);
  var point = found.point;
  var tenant = found.tenant;
  var tenantId = String(tenant.id);

  intakeLib.assertNotThrottled(e, point, tenantId);

  var priority = sla.priorityFromImpact(impact);
  var ticketNo = intakeLib.ticketNumber(type);
  var publicToken = intakeLib.newToken();
  var ticket;
  var due;
  var selectedService = null;
  var selectedItem = null;
  var unitId = String(point.get("unit") || "");

  $app.runInTransaction((txApp) => {
    var currentPoint = txApp.findRecordById("intake_points", point.id);

    if (!Boolean(currentPoint.get("is_active"))) throw intakeLib.publicNotFound();

    var currentTenant = txApp.findRecordById("tenants", tenantId);
    if (!Boolean(currentTenant.get("is_active"))) throw intakeLib.publicNotFound();

    var unit = txApp.findRecordById("units", unitId);
    if (String(unit.get("tenant")) !== tenantId) {
      throw new BadRequestError("Unit titik QR tidak valid");
    }
    if (!Boolean(unit.get("is_active"))) {
      throw new BadRequestError("Unit titik QR tidak aktif");
    }

    try {
      selectedService = txApp.findRecordById("services", serviceId);
    } catch (err) {
      throw new BadRequestError("Layanan tidak ditemukan");
    }

    if (
      String(selectedService.get("tenant")) !== tenantId ||
      !Boolean(selectedService.get("is_active"))
    ) {
      throw new BadRequestError("Layanan tidak aktif atau bukan milik rumah sakit ini");
    }

    if (serviceItemId) {
      try {
        selectedItem = txApp.findRecordById("service_items", serviceItemId);
      } catch (err) {
        throw new BadRequestError("Item layanan tidak ditemukan");
      }

      if (
        String(selectedItem.get("tenant")) !== tenantId ||
        !Boolean(selectedItem.get("is_active")) ||
        String(selectedItem.get("service")) !== String(selectedService.id)
      ) {
        throw new BadRequestError("Item layanan tidak sesuai");
      }
    }

    var approvalMode = "default";
    if (type === "incident") {
      approvalMode = "none";
    } else if (selectedItem) {
      approvalMode = String(selectedItem.get("approval_mode") || "lead");
    }

    if (constants.APPROVAL_MODES.indexOf(approvalMode) < 0) {
      approvalMode = "default";
    }

    var policy = null;

    if (selectedItem && selectedItem.get("sla_policy")) {
      try {
        policy = txApp.findRecordById(
          "sla_policies",
          String(selectedItem.get("sla_policy"))
        );
        if (
          String(policy.get("tenant")) !== tenantId ||
          !Boolean(policy.get("is_active"))
        ) {
          policy = null;
        }
      } catch (err) {
        policy = null;
      }
    }

    if (!policy && selectedService.get("default_sla")) {
      try {
        policy = txApp.findRecordById(
          "sla_policies",
          String(selectedService.get("default_sla"))
        );
        if (
          String(policy.get("tenant")) !== tenantId ||
          !Boolean(policy.get("is_active"))
        ) {
          policy = null;
        }
      } catch (err) {
        policy = null;
      }
    }

    if (!policy) {
      policy = sla.findPolicy(txApp, tenantId, type, priority);
    }

    var holidays = sla.loadHolidays(txApp, tenantId);
    due = sla.computeDue(new Date(), type, priority, policy, holidays);

    var collection = txApp.findCollectionByNameOrId("tickets");
    ticket = new Record(collection);
    ticket.set("ticket_no", ticketNo);
    ticket.set("tenant", tenantId);
    ticket.set("type", type);
    ticket.set("title", title);
    ticket.set("description", description);
    ticket.set("status", "open");
    ticket.set("source", "web");
    ticket.set("intake_channel", "qr");
    ticket.set("intake_ref", point.id);
    ticket.set("impact", impact);
    ticket.set("priority", priority);
    ticket.set("unit", unitId);
    ticket.set("patient_data_confirmed", true);
    ticket.set("approval_mode", approvalMode);
    ticket.set(
      "approval_status",
      type === "incident" || approvalMode === "none"
        ? "not_required"
        : "pending"
    );
    ticket.set("last_activity_at", new Date().toISOString());
    ticket.set("reporter_name", reporterName);
    ticket.set("reporter_contact", reporterContact);
    ticket.set("public_token", publicToken);

    if (selectedService) ticket.set("service", selectedService.id);
    if (selectedItem) ticket.set("service_item", selectedItem.id);
    if (selectedService && selectedService.get("team")) {
      ticket.set("team", String(selectedService.get("team")));
    }

    var location = String(currentPoint.get("location") || "") || requestLocation;
    if (location) ticket.set("location", location);

    if (policy) ticket.set("sla_policy", policy.id);
    if (due.response) ticket.set("response_due_at", due.response.toISOString());
    if (due.approval) ticket.set("approval_due_at", due.approval.toISOString());
    if (due.resolution) {
      ticket.set("resolution_due_at", due.resolution.toISOString());
    }

    var nextDue =
      type === "incident" ? due.resolution : due.approval || due.resolution;
    if (nextDue) ticket.set("next_due_at", nextDue.toISOString());

    ticket.set("sla_snapshot", due.snapshot);

    txApp.save(ticket);

    // Lampiran tamu. `uploader` kosong; field ini dibuat opsional oleh migrasi.
    for (var ai = 0; ai < files.length; ai++) {
      var attachmentCollection =
        txApp.findCollectionByNameOrId("ticket_attachments");
      var attachment = new Record(attachmentCollection);
      attachment.set("ticket", ticket.id);
      attachment.set("file", files[ai]);
      attachment.set(
        "original_name",
        String(files[ai].originalName || files[ai].name || "lampiran")
      );
      attachment.set("size", Number(files[ai].size || 0));
      attachment.set("visibility", "public");
      txApp.save(attachment);
    }

    if (type !== "incident" && approvalMode !== "none") {
      var flow = approvals.createFlow(
        txApp,
        ticket,
        due.approval ? due.approval.toISOString() : "",
        approvalMode
      );

      if (flow.length) {
        approvals.notifyStep(txApp, ticket, flow[0]);
      }
    }

    if (priority === "critical") {
      var leads = notify.approvalAlerts(txApp, tenantId);

      for (var li = 0; li < leads.length; li++) {
        notify.create(txApp, {
          tenant: tenantId,
          user: leads[li].id,
          ticket: ticket.id,
          actor: "",
          type: "sla",
          title: "Tiket kritis baru dari QR",
          body: ticketNo + " · " + title,
        });
      }
    }

    currentPoint.set("last_used_at", new Date().toISOString());
    txApp.save(currentPoint);

    var meta = audit.requestMeta(e);
    audit.write(txApp, {
      tenant: tenantId,
      actor: null,
      actor_role: "guest",
      ticket: ticket,
      action: "create",
      collection_name: "tickets",
      record_id: ticket.id,
      changes: {
        type: type,
        impact: impact,
        priority: priority,
        source: "web",
        channel: "qr",
        intake_ref: point.id,
        service: selectedService ? selectedService.id : "",
        service_item: selectedItem ? selectedItem.id : "",
        team: String(ticket.get("team") || ""),
        approval_mode: approvalMode,
        has_contact: true,
        attachments: files.length,
      },
      ip: meta.ip,
      user_agent: meta.user_agent,
    });
  });

  // Email konfirmasi hanya untuk kontak berupa email. Kegagalan antrean tidak
  // boleh membatalkan tiket yang sudah tersimpan.
  var receiptEmail = false;

  if (reporterContact.indexOf("@") >= 0) {
    try {
      receiptEmail = Boolean(
        mail.queueGuestReceipt(e.app, {
          tenantId: tenantId,
          ticketId: ticket.id,
          to: reporterContact,
          recipientName: reporterName,
          ticketNo: ticketNo,
          title: title,
          team:
            constants.TEAM_LABELS[String(ticket.get("team") || "")] ||
            "Tim IT rumah sakit",
          token: publicToken,
        })
      );
    } catch (err) {
      receiptEmail = false;
    }
  }

  return e.json(201, {
    ticket_no: ticketNo,
    public_token: publicToken,
    receipt_email: receiptEmail,
    status: "open",
    priority: priority,
    team: String(ticket.get("team") || ""),
    response_due_at: due.response ? due.response.toISOString() : "",
    resolution_due_at: due.resolution ? due.resolution.toISOString() : "",
    location: String(ticket.get("location") || ""),
  });
});
