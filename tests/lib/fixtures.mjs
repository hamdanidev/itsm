// Fixtures bersama untuk test API dan e2e. Setiap organisasi uji punya unit,
// manajer unit, requester, support, dan lead sendiri supaya file test bisa
// berjalan paralel tanpa saling mengganggu.
import { ApiClient } from "./api-client.mjs";

export const PASSWORD = "RahasiaUji123!";

let seq = 0;

export function uniqueLabel(prefix = "uji") {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${process.pid}-${seq}`;
}

export function readEnv() {
  const url = process.env.PB_URL;

  if (!url) {
    throw new Error(
      "PB_URL belum di-set. Jalankan lewat `npm run test:api` atau `npm run test:e2e`."
    );
  }

  return {
    url,
    adminEmail: process.env.PB_ADMIN_EMAIL || "admin@uji.local",
    adminPassword: process.env.PB_ADMIN_PASSWORD || "RahasiaUji123!",
  };
}

export async function adminClient() {
  const { url, adminEmail, adminPassword } = readEnv();
  const admin = new ApiClient(url);
  await admin.loginSuperuser(adminEmail, adminPassword);
  return admin;
}

export async function createUser(
  admin,
  { email, name, role, unitId, tenantId, isActive = true }
) {
  return admin.create("users", {
    email,
    password: PASSWORD,
    passwordConfirm: PASSWORD,
    emailVisibility: true,
    verified: true,
    name,
    role,
    tenant: tenantId,
    unit: unitId,
    is_active: isActive,
  });
}

async function loggedIn(url, email) {
  const client = new ApiClient(url);
  const record = await client.login(email, PASSWORD);
  return { client, record };
}

export async function seedOrg({ label = uniqueLabel("org"), withManager = true } = {}) {
  const { url } = readEnv();
  const admin = await adminClient();

  const tenants = await admin.list("tenants", { filter: 'code="RS01"', perPage: 1 });
  const tenant = tenants.items[0];
  if (!tenant) throw new Error("Seed tenant RS01 tidak ditemukan; migrasi gagal?");

  const itUnits = await admin.list("units", { filter: 'code="IT"', perPage: 1 });
  const itUnit = itUnits.items[0];

  const unit = await admin.create("units", {
    tenant: tenant.id,
    name: `Unit ${label}`,
    code: `U${(Date.now().toString(36) + Math.random().toString(36).slice(2, 6))
      .toUpperCase()
      .slice(0, 12)}`,
    kind: "clinical",
    is_active: true,
  });

  const makeUser = async (kind, role, unitId, displayName) => {
    const email = `${kind}.${label}@uji.local`;
    const user = await createUser(admin, {
      email,
      name: displayName,
      role,
      unitId,
      tenantId: tenant.id,
    });
    const session = await loggedIn(url, email);
    return { user, email, ...session };
  };

  const manager = withManager
    ? await makeUser("manajer", "requester", unit.id, `Manajer ${label}`)
    : null;

  if (manager) {
    await admin.update("units", unit.id, { manager: manager.user.id });
  }

  const requester = await makeUser("requester", "requester", unit.id, `Pemohon ${label}`);
  const support = await makeUser("support", "it_support", itUnit.id, `Support ${label}`);
  const lead = await makeUser("lead", "it_lead", itUnit.id, `Lead ${label}`);

  return {
    admin,
    tenant,
    unit: { ...unit, manager: manager ? manager.user.id : "" },
    itUnit,
    manager,
    requester,
    support,
    lead,
  };
}

export async function ticketRecord(admin, id) {
  return admin.json("GET", `/api/collections/tickets/records/${id}`);
}

export async function approvalSteps(client, ticketId) {
  const list = await client.list("ticket_approvals", {
    filter: `ticket="${ticketId}"`,
    sort: "step",
  });
  return list.items;
}

let ticketSeq = 0;

export async function createTicket(client, overrides = {}) {
  ticketSeq += 1;

  const body = {
    type: "incident",
    title: `Tiket uji ${ticketSeq} ${Date.now()}`,
    description: `Deskripsi tiket uji otomatis nomor ${ticketSeq}, cukup panjang.`,
    impact: "operational",
    patient_data_confirmed: true,
    ...overrides,
  };

  return client.json("POST", "/api/itsm/tickets", { body });
}

export async function postComment(client, ticketId, body, visibility = "public") {
  return client.json("POST", `/api/itsm/tickets/${ticketId}/comments`, {
    body: { body, visibility },
  });
}

export async function assignTicket(client, ticketId, assignee) {
  return client.json("POST", `/api/itsm/tickets/${ticketId}/assign`, {
    body: { assignee },
  });
}

export async function transition(client, ticketId, status, extra = {}) {
  return client.json("POST", `/api/itsm/tickets/${ticketId}/transition`, {
    body: { status, ...extra },
  });
}

export async function decide(client, ticketId, decision, note = "") {
  return client.json("POST", `/api/itsm/tickets/${ticketId}/approval`, {
    body: { decision, note },
  });
}
