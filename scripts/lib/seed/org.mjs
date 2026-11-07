// Menyiapkan organisasi demo: rumah sakit, akun, unit, layanan, aset, dan
// titik QR. Semua operasi idempoten supaya seed bisa dijalankan berulang kali.
import { ApiClient } from "./api.mjs";
import {
  ASSETS,
  INTAKE_POINTS,
  SERVICE_ROUTING,
  UNITS,
  USERS,
} from "./content.mjs";

function emailFor(hospital, user) {
  return `${user.local}@${hospital.domain}`;
}

export function unitCodeOf(user) {
  return user.unit || "";
}

export async function ensurePlatformAdmin(ctx) {
  const { admin, baseUrl, opts, log } = ctx;
  const email = `vendor.seed@${opts.emailDomain || "demo.local"}`;

  let user = await admin.findOne("users", `email="${email}"`);
  const payload = {
    email,
    name: "Admin Vendor Seed",
    role: "it_lead",
    is_platform_staff: true,
    is_active: true,
    verified: true,
    emailVisibility: true,
    email_opt_out: true,
    password: opts.password,
    passwordConfirm: opts.password,
  };

  if (!user) {
    user = await admin.create("users", payload);
    log.detail(`Akun platform dibuat: ${email}`);
  } else {
    user = await admin.update("users", user.id, {
      name: payload.name,
      role: payload.role,
      is_platform_staff: true,
      tenant: "",
      is_active: true,
      email_opt_out: true,
      password: opts.password,
      passwordConfirm: opts.password,
    });
  }

  const client = new ApiClient(baseUrl);
  await client.login(email, opts.password);

  return { user, client, email };
}

// Mode vendor: rumah sakit demo dibuat lewat Konsol Vendor agar data master
// default ikut ter-seed. Mode standalone: pakai satu rumah sakit yang ada.
export async function resolveTenant(ctx) {
  const { admin, platform, meta, hospital, opts, log } = ctx;

  if (meta.mode === "vendor") {
    let tenant = await admin.findOne("tenants", `code="${hospital.code}"`);

    if (!tenant) {
      const email = `lead.it@${hospital.domain}`;
      const created = await platform.json("POST", "/api/itsm/platform/tenants", {
        body: {
          name: hospital.name,
          code: hospital.code,
          timezone: hospital.timezone,
          is_active: true,
          seed_master: true,
          admin: {
            name: "Andi Pratama",
            email,
            password: opts.password,
            role: "it_lead",
            job_title: "Kepala IT",
          },
        },
      });

      tenant = created.tenant;
      log.detail(`Rumah sakit demo dibuat: ${tenant.name} (${tenant.code})`);
    } else {
      await platform.json(
        "POST",
        `/api/itsm/platform/tenants/${tenant.id}/seed`,
        { body: {} }
      );
    }

    return tenant;
  }

  const tenants = await admin.listAll("tenants", { sort: "created" });
  const tenant = tenants.find((item) => item.is_active) || tenants[0];

  if (!tenant) {
    throw new Error(
      "Tidak ada rumah sakit pada instalasi ini. Jalankan setup awal lebih dulu."
    );
  }

  return tenant;
}

export async function ensureUsers(ctx) {
  const { admin, tenant, hospital, opts } = ctx;
  const users = {};

  for (const user of USERS) {
    const email = emailFor(hospital, user);
    const existing = await admin.findOne("users", `email="${email}"`);
    const unit = ctx.units[user.unit];
    const payload = {
      email,
      name: user.name,
      role: user.role,
      tenant: tenant.id,
      unit: unit ? unit.id : "",
      job_title: user.jobTitle || "",
      team: user.team || "",
      is_active: true,
      is_platform_staff: false,
      email_opt_out: true,
      must_change_password: false,
      verified: true,
      emailVisibility: true,
      password: opts.password,
      passwordConfirm: opts.password,
    };

    if (existing) {
      const updated = await admin.update("users", existing.id, {
        name: payload.name,
        role: payload.role,
        tenant: tenant.id,
        unit: payload.unit,
        job_title: payload.job_title,
        team: payload.team,
        is_active: true,
        email_opt_out: true,
        must_change_password: false,
        password: payload.password,
        passwordConfirm: payload.password,
      });
      users[user.key] = { ...updated, key: user.key, email };
    } else {
      const created = await admin.create("users", payload);
      users[user.key] = { ...created, key: user.key, email };
    }
  }

  return users;
}

export async function loginUsers(ctx) {
  const sessions = {};

  for (const user of USERS) {
    const record = ctx.users[user.key];
    const client = new ApiClient(ctx.baseUrl);
    await client.login(record.email, ctx.opts.password);
    sessions[user.key] = client;
  }

  return sessions;
}

export function buildUnitMap(records) {
  const units = {};

  for (const unit of records) {
    units[unit.code] = unit;
  }

  return units;
}

export async function loadMaster(ctx) {
  const { admin } = ctx;

  const units = buildUnitMap(await admin.listAll("units", { perPage: 200 }));
  const services = await admin.listAll("services", { perPage: 200 });
  const items = await admin.listAll("service_items", { perPage: 200 });
  const categories = await admin.listAll("ticket_categories", { perPage: 200 });

  const missingUnits = Object.keys(UNITS).filter((code) => !units[code]);
  const missingServices = Object.keys(SERVICE_ROUTING).filter(
    (code) => !services.find((service) => service.code === code)
  );

  if (missingUnits.length || missingServices.length) {
    throw new Error(
      "Data master rumah sakit belum lengkap" +
        (missingUnits.length ? ` (unit: ${missingUnits.join(", ")})` : "") +
        (missingServices.length
          ? ` (layanan: ${missingServices.join(", ")})`
          : "") +
        ". Jalankan setup awal atau seed data master lebih dulu."
    );
  }

  const serviceByCode = {};
  for (const service of services) serviceByCode[service.code] = service;

  const itemByCode = {};
  for (const item of items) itemByCode[item.code] = item;

  const categoryByCode = {};
  for (const category of categories) categoryByCode[category.code] = category;

  ctx.units = units;
  ctx.services = serviceByCode;
  ctx.items = itemByCode;
  ctx.categories = categoryByCode;
}

export async function applyMaster(ctx) {
  const { admin } = ctx;

  // Manajer unit = approver tahap pertama.
  for (const [code, config] of Object.entries(UNITS)) {
    const unit = ctx.units[code];
    const manager = ctx.users[config.manager];
    if (!unit || !manager) continue;
    if (unit.manager !== manager.id) {
      await admin.update("units", unit.id, { manager: manager.id });
      unit.manager = manager.id;
    }
  }

  // Tim default layanan menentukan antrean teknisi.
  const itUnit = ctx.units.IT;
  for (const service of Object.values(ctx.services)) {
    const routing = SERVICE_ROUTING[service.code];
    if (!routing) continue;

    const owner = ctx.users[routing.owner];
    const patch = {};
    if (service.team !== routing.team) patch.team = routing.team;
    if (owner && service.owner !== owner.id) patch.owner = owner.id;
    if (itUnit && service.support_unit !== itUnit.id) {
      patch.support_unit = itUnit.id;
    }

    if (Object.keys(patch).length) {
      await admin.update("services", service.id, patch);
      Object.assign(service, patch);
    }
  }
}

export async function ensureAssets(ctx) {
  const { admin, sessions, log } = ctx;
  const lead = sessions.lead;
  const assets = {};

  for (const asset of ASSETS) {
    const existing = await admin.findOne(
      "assets",
      `tenant="${ctx.tenant.id}" && asset_no="${asset.assetNo}"`
    );

    if (existing) {
      assets[asset.assetNo] = existing;
      continue;
    }

    const unit = ctx.units[asset.unit];
    const service = ctx.services[asset.service];
    const owner = ctx.users[asset.owner];

    try {
      const created = await lead.json("POST", "/api/itsm/assets", {
        body: {
          asset_no: asset.assetNo,
          name: asset.name,
          type: asset.type,
          status: asset.status,
          criticality: asset.criticality,
          location: asset.location,
          notes: asset.notes || "",
          unit: unit ? unit.id : "",
          service: service ? service.id : "",
          owner: owner ? owner.id : "",
          warranty_end: asset.warrantyEnd || "",
        },
      });

      assets[asset.assetNo] = created;
    } catch (error) {
      log.warn(`Aset ${asset.assetNo} gagal dibuat: ${error.message}`);
    }
  }

  ctx.assets = assets;
}

export async function ensureIntakePoints(ctx) {
  const { sessions, log } = ctx;
  const lead = sessions.lead;
  const result = await lead.get("/api/itsm/intake-points");
  const existing = {};

  for (const point of result.items || []) existing[point.name] = point;

  const points = [];

  for (const definition of INTAKE_POINTS) {
    let point = existing[definition.name];

    if (!point) {
      try {
        const created = await lead.json("POST", "/api/itsm/intake-points", {
          body: {
            name: definition.name,
            unit: ctx.units[definition.unit].id,
            location: definition.location,
            max_per_hour: definition.maxPerHour,
          },
        });
        point = created.point;
      } catch (error) {
        log.warn(`Titik QR "${definition.name}" gagal dibuat: ${error.message}`);
        continue;
      }
    }

    points.push(point);
  }

  ctx.points = points;
}

export async function prepareOrganisation(ctx) {
  await loadMaster(ctx);
  ctx.users = await ensureUsers(ctx);
  ctx.userKeyById = {};
  for (const [key, user] of Object.entries(ctx.users)) {
    ctx.userKeyById[user.id] = key;
  }
  await applyMaster(ctx);
  ctx.sessions = await loginUsers(ctx);
  await ensureAssets(ctx);
  await ensureIntakePoints(ctx);
}
