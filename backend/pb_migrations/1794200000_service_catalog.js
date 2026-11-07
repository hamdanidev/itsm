/// <reference path="../pb_data/types.d.ts" />

// Increment A: service catalog sebagai tulang punggung tiket.
//
// Koleksi `services` dan `service_items` sengaja sederhana: satu layanan punya
// beberapa item permintaan, dan setiap item menentukan mode approval + policy
// SLA. Tidak ada dynamic form builder di tahap ini; deskripsi item dipakai
// sebagai panduan saat membuat tiket.

migrate(
  (app) => {
    const AUTH =
      '@request.auth.id != "" && @request.auth.is_active = true';
    const TENANT = "tenant = @request.auth.tenant";
    const PLATFORM = "@request.auth.is_platform_staff = true";
    const LEAD = '@request.auth.role = "it_lead"';

    const timestamps = [
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ];

    const tenants = app.findCollectionByNameOrId("tenants");
    const users = app.findCollectionByNameOrId("users");
    const units = app.findCollectionByNameOrId("units");
    const policies = app.findCollectionByNameOrId("sla_policies");
    const tickets = app.findCollectionByNameOrId("tickets");

    const readRule = AUTH + " && (" + PLATFORM + " || " + TENANT + ")";

    // -----------------------------------------------------------------------
    // services
    // -----------------------------------------------------------------------
    const services = new Collection({
      type: "base",
      name: "services",
      listRule: readRule,
      viewRule: readRule,
      createRule: LEAD + " && @request.body.tenant = @request.auth.tenant",
      updateRule: LEAD + " && " + TENANT,
      deleteRule: null,
      fields: [
        {
          name: "tenant",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: tenants.id,
        },
        { name: "name", type: "text", required: true, max: 120 },
        { name: "code", type: "text", required: true, max: 20 },
        { name: "description", type: "text", max: 2000 },
        {
          name: "owner",
          type: "relation",
          maxSelect: 1,
          collectionId: users.id,
        },
        {
          name: "support_unit",
          type: "relation",
          maxSelect: 1,
          collectionId: units.id,
        },
        {
          name: "default_sla",
          type: "relation",
          maxSelect: 1,
          collectionId: policies.id,
        },
        { name: "is_active", type: "bool" },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_services_tenant_code ON services (tenant, code)",
        "CREATE INDEX idx_services_tenant_active ON services (tenant, is_active)",
      ],
    });
    services.fields.addMarshaledJSON(JSON.stringify(timestamps));
    app.save(services);

    // -----------------------------------------------------------------------
    // service_items
    // -----------------------------------------------------------------------
    const serviceItems = new Collection({
      type: "base",
      name: "service_items",
      listRule: readRule,
      viewRule: readRule,
      createRule: LEAD + " && @request.body.tenant = @request.auth.tenant",
      updateRule: LEAD + " && " + TENANT,
      deleteRule: null,
      fields: [
        {
          name: "tenant",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: tenants.id,
        },
        {
          name: "service",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: services.id,
        },
        { name: "name", type: "text", required: true, max: 120 },
        { name: "code", type: "text", required: true, max: 40 },
        { name: "description", type: "text", max: 2000 },
        {
          name: "approval_mode",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["none", "manager", "lead", "cab"],
        },
        {
          name: "sla_policy",
          type: "relation",
          maxSelect: 1,
          collectionId: policies.id,
        },
        { name: "sort", type: "number" },
        { name: "is_active", type: "bool" },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_service_items_tenant_service_code ON service_items (tenant, service, code)",
        "CREATE INDEX idx_service_items_service_active ON service_items (service, is_active)",
      ],
    });
    serviceItems.fields.addMarshaledJSON(JSON.stringify(timestamps));
    app.save(serviceItems);

    // -----------------------------------------------------------------------
    // tickets: kaitan ke layanan + pemohon sebenarnya + lokasi + mode approval
    // -----------------------------------------------------------------------
    tickets.fields.addMarshaledJSON(
      JSON.stringify([
        {
          name: "service",
          type: "relation",
          maxSelect: 1,
          collectionId: services.id,
        },
        {
          name: "service_item",
          type: "relation",
          maxSelect: 1,
          collectionId: serviceItems.id,
        },
        {
          name: "requested_for",
          type: "relation",
          maxSelect: 1,
          collectionId: users.id,
        },
        { name: "location", type: "text", max: 120 },
        {
          name: "approval_mode",
          type: "select",
          maxSelect: 1,
          values: ["default", "none", "manager", "lead", "cab"],
        },
      ])
    );

    const ticketIndexes = tickets.indexes || [];
    if (
      ticketIndexes.indexOf(
        "CREATE INDEX idx_tickets_service ON tickets (tenant, service, status)"
      ) < 0
    ) {
      ticketIndexes.push(
        "CREATE INDEX idx_tickets_service ON tickets (tenant, service, status)"
      );
    }
    tickets.indexes = ticketIndexes;
    app.save(tickets);

    // -----------------------------------------------------------------------
    // audit: aksi triage
    // -----------------------------------------------------------------------
    const audit = app.findCollectionByNameOrId("audit_logs");
    const action = audit.fields.getByName("action");

    if (action) {
      const values = (action.values || []).slice();
      if (values.indexOf("triage") < 0) {
        values.push("triage");
        action.values = values;
        app.save(audit);
      }
    }

    // -----------------------------------------------------------------------
    // Seed katalog default untuk tenant yang sudah ada.
    // -----------------------------------------------------------------------
    const SERVICE_SEEDS = [
      {
        code: "SIMRS",
        name: "SIMRS",
        description:
          "Aplikasi SIMRS dan modul klinis: pendaftaran, farmasi, laboratorium, radiologi, kasir, dan rekam medis.",
        items: [
          {
            code: "PERUBAHAN-KONFIG",
            name: "Perubahan konfigurasi SIMRS",
            description:
              "Perubahan parameter, template, atau konfigurasi modul SIMRS yang perlu persetujuan.",
            approval: "lead",
            sort: 10,
          },
        ],
      },
      {
        code: "INFRA",
        name: "Jaringan & Infrastruktur",
        description:
          "Jaringan, server, penyimpanan, dan infrastruktur yang menopang layanan rumah sakit.",
        items: [
          {
            code: "PERUBAHAN-JARINGAN",
            name: "Perubahan jaringan",
            description:
              "Perubahan konfigurasi jaringan, VLAN, firewall, atau akses internet.",
            approval: "lead",
            sort: 10,
          },
        ],
      },
      {
        code: "DEVICE",
        name: "Perangkat & Printer",
        description:
          "Workstation, printer, scanner, dan perangkat pendukung layanan.",
        items: [
          {
            code: "PERBAIKAN-PERANGKAT",
            name: "Perbaikan perangkat",
            description:
              "Permintaan perbaikan printer, workstation, atau perangkat pendukung.",
            approval: "none",
            sort: 10,
          },
        ],
      },
      {
        code: "ACCESS",
        name: "Akun & Akses",
        description:
          "Pembuatan akun, reset password, dan pengelolaan hak akses pengguna.",
        items: [
          {
            code: "AKUN-BARU",
            name: "Permintaan akun baru",
            description:
              "Pembuatan akun untuk pegawai baru. Sertakan nama, unit, dan masa berlaku.",
            approval: "manager",
            sort: 10,
          },
          {
            code: "RESET-PASSWORD",
            name: "Reset password",
            description:
              "Reset password akun SIMRS atau aplikasi internal. Tidak perlu approval.",
            approval: "none",
            sort: 20,
          },
          {
            code: "AKSES-TAMBAH",
            name: "Tambah atau ubah akses",
            description:
              "Permintaan tambahan akses modul, dengan persetujuan manajer unit.",
            approval: "manager",
            sort: 30,
          },
        ],
      },
      {
        code: "INTEGRASI",
        name: "SATUSEHAT & Integrasi",
        description:
          "Integrasi SATUSEHAT, BPJS, laboratorium, radiologi, dan sistem eksternal.",
        items: [
          {
            code: "AKSES-INTEGRASI",
            name: "Akses atau perubahan integrasi",
            description:
              "Permintaan kredensial, endpoint, atau perubahan integrasi eksternal.",
            approval: "lead",
            sort: 10,
          },
        ],
      },
      {
        code: "LAINNYA",
        name: "Layanan Lainnya",
        description:
          "Permintaan atau gangguan yang belum termasuk layanan di atas.",
        items: [],
      },
    ];

    function findFirst(collection, filter, params) {
      try {
        return app.findFirstRecordByFilter(collection, filter, params);
      } catch (err) {
        return null;
      }
    }

    const tenantsList = app.findRecordsByFilter("tenants", "", "", 0, 0);

    for (let t = 0; t < tenantsList.length; t++) {
      const tenantId = tenantsList[t].id;
      const itUnit = findFirst(
        "units",
        'tenant = {:tenant} && code = "IT"',
        { tenant: tenantId }
      );

      for (let s = 0; s < SERVICE_SEEDS.length; s++) {
        const seed = SERVICE_SEEDS[s];
        let service = findFirst(
          "services",
          "tenant = {:tenant} && code = {:code}",
          { tenant: tenantId, code: seed.code }
        );

        if (!service) {
          service = new Record(services);
          service.set("tenant", tenantId);
          service.set("name", seed.name);
          service.set("code", seed.code);
          service.set("description", seed.description);
          service.set("is_active", true);
          if (itUnit) service.set("support_unit", itUnit.id);
          app.save(service);
        }

        for (let i = 0; i < seed.items.length; i++) {
          const item = seed.items[i];
          const existingItem = findFirst(
            "service_items",
            "tenant = {:tenant} && service = {:service} && code = {:code}",
            { tenant: tenantId, service: service.id, code: item.code }
          );

          if (existingItem) continue;

          const record = new Record(serviceItems);
          record.set("tenant", tenantId);
          record.set("service", service.id);
          record.set("name", item.name);
          record.set("code", item.code);
          record.set("description", item.description);
          record.set("approval_mode", item.approval);
          record.set("sort", item.sort);
          record.set("is_active", true);
          app.save(record);
        }
      }
    }
  },
  (app) => {
    // Lepas relasi tiket dulu sebelum koleksi katalog dihapus.
    try {
      const tickets = app.findCollectionByNameOrId("tickets");
      for (const name of [
        "service",
        "service_item",
        "requested_for",
        "location",
        "approval_mode",
      ]) {
        if (tickets.fields.getByName(name)) {
          tickets.fields.removeByName(name);
        }
      }
      tickets.indexes = (tickets.indexes || []).filter(
        (index) => String(index).indexOf("idx_tickets_service") < 0
      );
      app.save(tickets);
    } catch (err) {
      // tickets tidak ada pada instalasi yang belum dimigrasi
    }

    for (const name of ["service_items", "services"]) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (err) {
        // collection may not exist
      }
    }

    try {
      const audit = app.findCollectionByNameOrId("audit_logs");
      const action = audit.fields.getByName("action");
      if (action) {
        action.values = (action.values || []).filter(
          (value) => value !== "triage"
        );
        app.save(audit);
      }
    } catch (err) {
      // audit_logs tidak ada
    }
  }
);
