// Insiden mayor: deklarasi, timeline komunikasi, tiket terdampak, resolusi,
// dan post-incident review (PIR).
//
// NOTE: callback route berjalan pada VM context baru, jadi helper dan konstanta
// harus di-require/dideklarasikan di dalam handler.


// ---------------------------------------------------------------------------
// Deklarasi insiden
// ---------------------------------------------------------------------------
routerAdd(
  "POST",
  "/api/itsm/incidents",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var audit = require(__hooks + "/lib/audit.js");
    var incidentLib = require(__hooks + "/lib/incident.js");
    var STAFF_ROLES = ["it_support", "it_lead"];
    var STATUS_TITLES = {
      declared: "Insiden mayor dideklarasikan",
      investigating: "Insiden mayor memasuki investigasi",
      mitigating: "Insiden mayor dalam mitigasi",
      monitoring: "Insiden mayor dalam pemantauan",
      resolved: "Insiden mayor telah dipulihkan",
      closed: "Insiden mayor ditutup",
    };

    function asIdList(value) {
      if (!value) return [];
      if (Array.isArray(value)) {
        return value.map((item) => String(item || "").trim()).filter(Boolean);
      }
      return String(value)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }

    var auth = guards.requireAuth(e);
    guards.assertStaff(auth);

    var body = e.requestInfo().body || {};
    var platform = guards.isPlatformStaff(auth);
    var tenantId = platform
      ? String(body.tenant || body.tenant_id || "")
      : String(auth.get("tenant") || "");

    if (!tenantId) {
      throw new BadRequestError("Rumah sakit wajib dipilih");
    }

    var title = guards.cleanText(body.title, 160);
    if (title.length < 5) {
      throw new BadRequestError("Judul insiden minimal 5 karakter");
    }

    var severity = String(body.severity || "sev2");
    if (incidentLib.SEVERITIES.indexOf(severity) < 0) {
      throw new BadRequestError("Severity insiden tidak valid");
    }

    var commanderId = String(body.commander || auth.id);
    var sourceTicketId = String(body.source_ticket || body.ticket_id || "");
    var serviceIds = asIdList(body.affected_services);

    var incident;

    $app.runInTransaction((txApp) => {
      try {
        txApp.findRecordById("tenants", tenantId);
      } catch (err) {
        throw new BadRequestError("Rumah sakit tidak ditemukan");
      }

      var commander;
      try {
        commander = txApp.findRecordById("users", commanderId);
      } catch (err) {
        throw new BadRequestError("Komandan insiden tidak ditemukan");
      }

      if (
        !commander.get("is_active") ||
        STAFF_ROLES.indexOf(String(commander.get("role") || "")) < 0
      ) {
        throw new BadRequestError("Komandan insiden harus staf IT yang aktif");
      }

      if (
        !commander.get("is_platform_staff") &&
        String(commander.get("tenant") || "") !== tenantId
      ) {
        throw new BadRequestError(
          "Komandan insiden harus staf rumah sakit yang sama"
        );
      }

      var validatedServices = [];
      var seenServices = {};

      for (var i = 0; i < serviceIds.length; i++) {
        var serviceId = serviceIds[i];
        if (seenServices[serviceId]) continue;

        var service;
        try {
          service = txApp.findRecordById("services", serviceId);
        } catch (err) {
          throw new BadRequestError("Layanan terdampak tidak ditemukan");
        }

        if (String(service.get("tenant") || "") !== tenantId) {
          throw new BadRequestError(
            "Layanan terdampak harus milik rumah sakit yang sama"
          );
        }

        seenServices[serviceId] = true;
        validatedServices.push(serviceId);
      }

      var sourceTicket = null;

      if (sourceTicketId) {
        sourceTicket = guards.findTicket(e, sourceTicketId);
        guards.assertTicketAccess(e, sourceTicket);

        if (String(sourceTicket.get("tenant") || "") !== tenantId) {
          throw new BadRequestError("Tiket sumber bukan milik rumah sakit ini");
        }
      }

      var incidentNo = incidentLib.generateNumber(txApp, tenantId, $security);
      if (!incidentNo) {
        throw new BadRequestError("Gagal membuat nomor insiden, coba lagi");
      }

      var collection = txApp.findCollectionByNameOrId("major_incidents");
      incident = new Record(collection);

      incident.set("tenant", tenantId);
      incident.set("incident_no", incidentNo);
      incident.set("title", title);
      incident.set("description", guards.cleanText(body.description, 10000));
      incident.set("severity", severity);
      incident.set("status", "declared");
      incident.set("commander", commander.id);
      incident.set("declared_by", auth.id);
      incident.set("impact_summary", guards.cleanText(body.impact_summary, 5000));
      incident.set("affected_services", validatedServices);
      incident.set("source_ticket", sourceTicket ? sourceTicket.id : "");
      incident.set("started_at", new Date().toISOString());
      txApp.save(incident);

      var meta = audit.requestMeta(e);

      if (sourceTicket) {
        incidentLib.linkTicket(txApp, incident, sourceTicket, "impacted");

        audit.write(txApp, {
          tenant: tenantId,
          actor: auth,
          ticket: sourceTicket,
          action: "incident_link",
          collection_name: "major_incidents",
          record_id: incident.id,
          changes: {
            incident_no: incidentNo,
            relation: "impacted",
          },
          ip: meta.ip,
          user_agent: meta.user_agent,
        });
      }

      audit.write(txApp, {
        tenant: tenantId,
        actor: auth,
        action: "incident_declare",
        collection_name: "major_incidents",
        record_id: incident.id,
        changes: {
          incident_no: incidentNo,
          title: title,
          severity: severity,
          commander: commander.id,
          services: validatedServices.length,
        },
        ip: meta.ip,
        user_agent: meta.user_agent,
      });

      incidentLib.broadcast(txApp, {
        tenant: tenantId,
        actor: auth.id,
        ticket: sourceTicket ? sourceTicket.id : "",
        title: STATUS_TITLES.declared,
        body: incidentNo + " · " + title,
      });
    });

    return e.json(201, incidentLib.response(incident));
  },
  $apis.requireAuth()
);

// ---------------------------------------------------------------------------
// Perbarui status / komandan / PIR
// ---------------------------------------------------------------------------
routerAdd(
  "PATCH",
  "/api/itsm/incidents/{id}",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var audit = require(__hooks + "/lib/audit.js");
    var incidentLib = require(__hooks + "/lib/incident.js");
    var STAFF_ROLES = ["it_support", "it_lead"];
    var STATUS_TITLES = {
      declared: "Insiden mayor dideklarasikan",
      investigating: "Insiden mayor memasuki investigasi",
      mitigating: "Insiden mayor dalam mitigasi",
      monitoring: "Insiden mayor dalam pemantauan",
      resolved: "Insiden mayor telah dipulihkan",
      closed: "Insiden mayor ditutup",
    };

    function asIdList(value) {
      if (!value) return [];
      if (Array.isArray(value)) {
        return value.map((item) => String(item || "").trim()).filter(Boolean);
      }
      return String(value)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }

    var auth = guards.requireAuth(e);
    guards.assertStaff(auth);

    var incidentId = e.request.pathValue("id");
    var body = e.requestInfo().body || {};

    function has(key) {
      return Object.prototype.hasOwnProperty.call(body, key);
    }

    var result;

    $app.runInTransaction((txApp) => {
      var incident;

      try {
        incident = txApp.findRecordById("major_incidents", incidentId);
      } catch (err) {
        throw new NotFoundError("Insiden tidak ditemukan");
      }

      guards.assertSameTenant(auth, incident);

      var tenantId = String(incident.get("tenant") || "");
      var previousStatus = String(incident.get("status") || "");

      var nextStatus = has("status")
        ? String(body.status || "")
        : previousStatus;

      if (incidentLib.STATUSES.indexOf(nextStatus) < 0) {
        throw new BadRequestError("Status insiden tidak valid");
      }

      if (!incidentLib.canTransition(previousStatus, nextStatus)) {
        throw new BadRequestError(
          "Transisi status insiden tidak valid (" +
            previousStatus +
            " -> " +
            nextStatus +
            ")"
        );
      }

      if (has("title")) {
        var title = guards.cleanText(body.title, 160);
        if (title.length < 5) {
          throw new BadRequestError("Judul insiden minimal 5 karakter");
        }
        incident.set("title", title);
      }

      if (has("description")) {
        incident.set("description", guards.cleanText(body.description, 10000));
      }

      if (has("impact_summary")) {
        incident.set("impact_summary", guards.cleanText(body.impact_summary, 5000));
      }

      if (has("severity")) {
        var severity = String(body.severity || "");
        if (incidentLib.SEVERITIES.indexOf(severity) < 0) {
          throw new BadRequestError("Severity insiden tidak valid");
        }
        incident.set("severity", severity);
      }

      var previousCommander = String(incident.get("commander") || "");
      var commanderChanged = false;

      if (has("commander")) {
        var commanderId = String(body.commander || "");
        if (commanderId) {
          var commander;
          try {
            commander = txApp.findRecordById("users", commanderId);
          } catch (err) {
            throw new BadRequestError("Komandan insiden tidak ditemukan");
          }

          if (
            !commander.get("is_active") ||
            STAFF_ROLES.indexOf(String(commander.get("role") || "")) < 0
          ) {
            throw new BadRequestError("Komandan insiden harus staf IT yang aktif");
          }

          if (
            !commander.get("is_platform_staff") &&
            String(commander.get("tenant") || "") !== tenantId
          ) {
            throw new BadRequestError(
              "Komandan insiden harus staf rumah sakit yang sama"
            );
          }
        }

        incident.set("commander", commanderId);
        commanderChanged = commanderId !== previousCommander;
      }

      if (has("affected_services")) {
        var serviceIds = asIdList(body.affected_services);
        var validated = [];
        var seen = {};

        for (var i = 0; i < serviceIds.length; i++) {
          var serviceId = serviceIds[i];
          if (seen[serviceId]) continue;

          var service;
          try {
            service = txApp.findRecordById("services", serviceId);
          } catch (err) {
            throw new BadRequestError("Layanan terdampak tidak ditemukan");
          }

          if (String(service.get("tenant") || "") !== tenantId) {
            throw new BadRequestError(
              "Layanan terdampak harus milik rumah sakit yang sama"
            );
          }

          seen[serviceId] = true;
          validated.push(serviceId);
        }

        incident.set("affected_services", validated);
      }

      var resolutionSummary = has("resolution_summary")
        ? guards.cleanText(body.resolution_summary, 10000)
        : String(incident.get("resolution_summary") || "");
      var rootCause = has("root_cause")
        ? guards.cleanText(body.root_cause, 10000)
        : String(incident.get("root_cause") || "");
      var pirActions = has("pir_actions")
        ? guards.cleanText(body.pir_actions, 10000)
        : String(incident.get("pir_actions") || "");

      incident.set("resolution_summary", resolutionSummary);
      incident.set("root_cause", rootCause);
      incident.set("pir_actions", pirActions);

      var pirCompleted = body.pir_completed === true;
      var pirDone = false;

      if (pirCompleted) {
        if (!rootCause || !pirActions) {
          throw new BadRequestError(
            "PIR membutuhkan root cause dan aksi perbaikan"
          );
        }

        if (!incidentLib.dateText(incident.get("pir_completed_at"))) {
          incident.set("pir_completed_at", new Date().toISOString());
        }
        incident.set("pir_by", auth.id);
        pirDone = true;
      }

      var now = new Date().toISOString();

      if (nextStatus === "resolved") {
        if (!resolutionSummary) {
          throw new BadRequestError(
            "Resolusi insiden membutuhkan ringkasan pemulihan"
          );
        }
        if (previousStatus !== "resolved") {
          incident.set("resolved_at", now);
        }
      }

      if (nextStatus === "closed") {
        if (previousStatus !== "resolved") {
          throw new BadRequestError(
            "Insiden hanya dapat ditutup setelah berstatus resolved"
          );
        }
        if (!incidentLib.dateText(incident.get("pir_completed_at"))) {
          throw new BadRequestError(
            "PIR harus lengkap sebelum insiden ditutup"
          );
        }
        incident.set("closed_at", now);
      }

      if (nextStatus === "investigating" && previousStatus === "resolved") {
        // Insiden dibuka kembali: durasi pemulihan lama tidak dipakai lagi.
        incident.set("resolved_at", "");
      }

      incident.set("status", nextStatus);
      txApp.save(incident);

      var action = "incident_update";
      if (nextStatus === "resolved" && previousStatus !== "resolved") {
        action = "incident_resolve";
      } else if (nextStatus === "closed") {
        action = "incident_close";
      } else if (pirDone) {
        action = "incident_pir";
      }

      var meta = audit.requestMeta(e);
      audit.write(txApp, {
        tenant: tenantId,
        actor: auth,
        action: action,
        collection_name: "major_incidents",
        record_id: incident.id,
        changes: {
          status: { from: previousStatus, to: nextStatus },
          severity: has("severity") ? String(body.severity || "") : "",
          commander: has("commander")
            ? { from: previousCommander, to: String(body.commander || "") }
            : "",
          pir_completed: pirDone,
        },
        ip: meta.ip,
        user_agent: meta.user_agent,
      });

      if (nextStatus !== previousStatus) {
        incidentLib.broadcast(txApp, {
          tenant: tenantId,
          actor: auth.id,
          title: STATUS_TITLES[nextStatus] || "Insiden mayor diperbarui",
          body:
            String(incident.get("incident_no") || "") +
            " · " +
            String(incident.get("title") || ""),
        });
      }

      if (commanderChanged) {
        var newCommander = String(incident.get("commander") || "");
        if (newCommander && newCommander !== auth.id) {
          var notify = require(__hooks + "/lib/notify.js");
          notify.create(txApp, {
            tenant: tenantId,
            user: newCommander,
            actor: auth.id,
            type: "incident",
            title: "Anda ditunjuk sebagai komandan insiden",
            body:
              String(incident.get("incident_no") || "") +
              " · " +
              String(incident.get("title") || ""),
          });
        }
      }

      result = incident;
    });

    return e.json(200, incidentLib.response(result));
  },
  $apis.requireAuth()
);

// ---------------------------------------------------------------------------
// Update komunikasi
// ---------------------------------------------------------------------------
routerAdd(
  "POST",
  "/api/itsm/incidents/{id}/updates",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var audit = require(__hooks + "/lib/audit.js");
    var incidentLib = require(__hooks + "/lib/incident.js");

    var auth = guards.requireAuth(e);
    guards.assertStaff(auth);

    var incidentId = e.request.pathValue("id");
    var body = e.requestInfo().body || {};
    var text = guards.cleanText(body.body, 5000);

    if (text.length < 2) {
      throw new BadRequestError("Isi update minimal 2 karakter");
    }

    var kind = String(body.kind || "update");
    if (incidentLib.UPDATE_KINDS.indexOf(kind) < 0) {
      throw new BadRequestError("Jenis update tidak valid");
    }

    var visibility = String(body.visibility || "internal");
    if (incidentLib.VISIBILITIES.indexOf(visibility) < 0) {
      throw new BadRequestError("Visibilitas update tidak valid");
    }

    var result;

    $app.runInTransaction((txApp) => {
      var incident;

      try {
        incident = txApp.findRecordById("major_incidents", incidentId);
      } catch (err) {
        throw new NotFoundError("Insiden tidak ditemukan");
      }

      guards.assertSameTenant(auth, incident);

      var tenantId = String(incident.get("tenant") || "");
      var collection = txApp.findCollectionByNameOrId("incident_updates");
      var update = new Record(collection);

      update.set("tenant", tenantId);
      update.set("incident", incident.id);
      update.set("kind", kind);
      update.set("visibility", visibility);
      update.set("body", text);
      update.set("author", auth.id);
      txApp.save(update);

      var meta = audit.requestMeta(e);
      audit.write(txApp, {
        tenant: tenantId,
        actor: auth,
        action: "incident_update",
        collection_name: "major_incidents",
        record_id: incident.id,
        changes: {
          kind: kind,
          visibility: visibility,
          body: text.slice(0, 280),
        },
        ip: meta.ip,
        user_agent: meta.user_agent,
      });

      if (visibility === "public") {
        var label =
          String(incident.get("incident_no") || "") +
          " · " +
          String(incident.get("title") || "");

        incidentLib.broadcast(txApp, {
          tenant: tenantId,
          actor: auth.id,
          title: "Update insiden mayor",
          body: label + " — " + text.slice(0, 180),
        });

        var links = [];

        try {
          links = txApp.findRecordsByFilter(
            "major_incident_tickets",
            "incident = {:incident}",
            "created",
            200,
            0,
            { incident: incident.id }
          );
        } catch (err) {
          links = [];
        }

        for (var i = 0; i < links.length; i++) {
          var ticketId = String(links[i].get("ticket") || "");
          if (!ticketId) continue;

          try {
            incidentLib.notifyTicketOwners(
              txApp,
              txApp.findRecordById("tickets", ticketId),
              {
                actor: auth.id,
                title: "Update insiden mayor",
                body: label,
              }
            );
          } catch (err) {
            // tiket mungkin sudah dihapus; abaikan
          }
        }
      }

      result = update;
    });

    return e.json(201, incidentLib.responseUpdate(result));
  },
  $apis.requireAuth()
);

// ---------------------------------------------------------------------------
// Tautkan tiket terdampak
// ---------------------------------------------------------------------------
routerAdd(
  "POST",
  "/api/itsm/incidents/{id}/tickets",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var audit = require(__hooks + "/lib/audit.js");
    var incidentLib = require(__hooks + "/lib/incident.js");

    var auth = guards.requireAuth(e);
    guards.assertStaff(auth);

    var incidentId = e.request.pathValue("id");
    var body = e.requestInfo().body || {};
    var ticketId = String(body.ticket_id || "");
    var relation = String(body.relation || "impacted");

    if (!ticketId) {
      throw new BadRequestError("Tiket wajib dipilih");
    }

    if (incidentLib.RELATIONS.indexOf(relation) < 0) {
      throw new BadRequestError("Relasi tiket tidak valid");
    }

    var incident;
    var link;

    $app.runInTransaction((txApp) => {
      try {
        incident = txApp.findRecordById("major_incidents", incidentId);
      } catch (err) {
        throw new NotFoundError("Insiden tidak ditemukan");
      }

      guards.assertSameTenant(auth, incident);

      var ticket = guards.findTicket(e, ticketId);
      guards.assertTicketAccess(e, ticket);

      if (
        String(ticket.get("tenant") || "") !==
        String(incident.get("tenant") || "")
      ) {
        throw new BadRequestError("Tiket bukan milik rumah sakit ini");
      }

      link = incidentLib.linkTicket(txApp, incident, ticket, relation);

      var meta = audit.requestMeta(e);
      audit.write(txApp, {
        tenant: String(incident.get("tenant") || ""),
        actor: auth,
        ticket: ticket,
        action: "incident_link",
        collection_name: "major_incidents",
        record_id: incident.id,
        changes: {
          incident_no: String(incident.get("incident_no") || ""),
          relation: relation,
        },
        ip: meta.ip,
        user_agent: meta.user_agent,
      });

      incidentLib.notifyTicketOwners(txApp, ticket, {
        actor: auth.id,
        title: "Tiket Anda bagian dari insiden mayor",
        body: String(incident.get("incident_no") || ""),
      });
    });

    return e.json(200, {
      incident: incidentLib.response(incident),
      link: link ? link.id : "",
    });
  },
  $apis.requireAuth()
);

// ---------------------------------------------------------------------------
// Statistik untuk laporan
// ---------------------------------------------------------------------------
routerAdd(
  "GET",
  "/api/itsm/incidents/stats",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var incidentLib = require(__hooks + "/lib/incident.js");

    var auth = guards.requireAuth(e);
    guards.assertLead(auth);

    var query = e.requestInfo().query || {};
    var platform = guards.isPlatformStaff(auth);
    var tenantId = platform
      ? String(query.tenant || "")
      : String(auth.get("tenant") || "");

    var to = String(query.to || "").trim();
    var from = String(query.from || "").trim();

    if (!to) to = new Date().toISOString().slice(0, 10);
    if (!from) {
      from = new Date(Date.now() - 89 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
    }

    var fromIso = new Date(from + "T00:00:00+07:00").toISOString();
    var toIso = new Date(to + "T23:59:59+07:00").toISOString();

    var clauses = ["started_at >= {:from}", "started_at <= {:to}"];
    var params = { from: fromIso, to: toIso };

    if (tenantId) {
      clauses.push("tenant = {:tenant}");
      params.tenant = tenantId;
    }

    var records = $app.findRecordsByFilter(
      "major_incidents",
      clauses.join(" && "),
      "started_at",
      500,
      0,
      params
    );

    function minutesBetween(start, end) {
      if (!start || !end) return null;
      var a = new Date(String(start)).getTime();
      var b = new Date(String(end)).getTime();
      if (isNaN(a) || isNaN(b) || b < a) return null;
      return Math.round((b - a) / 60000);
    }

    function median(values) {
      if (!values.length) return null;
      var sorted = values.slice().sort((a, b) => a - b);
      var mid = Math.floor(sorted.length / 2);
      return sorted.length % 2
        ? sorted[mid]
        : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    }

    var bySeverity = { sev1: 0, sev2: 0, sev3: 0 };
    var durations = [];
    var trendMap = {};
    var totals = {
      total: records.length,
      active: 0,
      resolved: 0,
      closed: 0,
      pir_completed: 0,
    };

    for (var i = 0; i < records.length; i++) {
      var record = records[i];
      var status = String(record.get("status") || "");
      var severity = String(record.get("severity") || "");

      if (bySeverity[severity] !== undefined) bySeverity[severity] += 1;
      if (incidentLib.isActive(status)) totals.active += 1;
      if (status === "resolved") totals.resolved += 1;
      if (status === "closed") totals.closed += 1;
      if (incidentLib.dateText(record.get("pir_completed_at"))) totals.pir_completed += 1;

      var duration = minutesBetween(
        record.get("started_at"),
        record.get("resolved_at") || record.get("closed_at")
      );
      if (duration !== null) durations.push(duration);

      var started = String(record.get("started_at") || "").slice(0, 7);
      if (!started) continue;

      if (!trendMap[started]) {
        trendMap[started] = {
          key: started,
          total: 0,
          resolved: 0,
          pir_completed: 0,
        };
      }

      trendMap[started].total += 1;
      if (status === "resolved" || status === "closed") {
        trendMap[started].resolved += 1;
      }
      if (incidentLib.dateText(record.get("pir_completed_at"))) {
        trendMap[started].pir_completed += 1;
      }
    }

    var trend = Object.keys(trendMap)
      .sort()
      .map((key) => trendMap[key]);

    return e.json(200, {
      range: { from: from, to: to },
      totals: totals,
      by_severity: bySeverity,
      mttr_minutes: median(durations),
      trend: trend,
    });
  },
  $apis.requireAuth()
);


