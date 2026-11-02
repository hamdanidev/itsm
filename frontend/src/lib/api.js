import { pb } from "./pocketbase";

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getErrorMessage(error) {
  if (!error) return "Terjadi kesalahan. Silakan coba lagi.";

  if (error instanceof ApiError) return error.message;

  const response = error.response || error;
  const data = response?.data;

  if (data && typeof data === "object") {
    const firstKey = Object.keys(data)[0];
    const first = firstKey ? data[firstKey] : null;
    if (first?.message) return first.message;
  }

  return (
    response?.message ||
    error.message ||
    "Terjadi kesalahan. Silakan coba lagi."
  );
}

async function parseResponse(response) {
  const text = await response.text();
  let payload = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new ApiError(
      payload?.message || `Permintaan gagal (${response.status})`,
      response.status
    );
  }

  return payload;
}

export async function createTicket(payload) {
  return pb.send("/api/itsm/tickets", {
    method: "POST",
    body: payload,
  });
}

export async function createComment(ticketId, body, visibility) {
  return pb.send(`/api/itsm/tickets/${ticketId}/comments`, {
    method: "POST",
    body: { body, visibility },
  });
}

export async function assignTicket(ticketId, assignee) {
  return pb.send(`/api/itsm/tickets/${ticketId}/assign`, {
    method: "POST",
    body: { assignee },
  });
}

export async function transitionTicket(ticketId, payload) {
  return pb.send(`/api/itsm/tickets/${ticketId}/transition`, {
    method: "POST",
    body: payload,
  });
}

export async function decideTicketApproval(ticketId, decision, note) {
  return pb.send(`/api/itsm/tickets/${ticketId}/approval`, {
    method: "POST",
    body: { decision, note },
  });
}

export async function fetchTimeline(ticketId) {
  return pb.send(`/api/itsm/tickets/${ticketId}/timeline`);
}

export async function uploadAttachment(ticketId, file, visibility = "public") {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("visibility", visibility);

  const response = await fetch(
    `${pb.baseURL}/api/itsm/tickets/${ticketId}/attachments`,
    {
      method: "POST",
      headers: {
        Authorization: pb.authStore.token,
      },
      body: formData,
    }
  );

  return parseResponse(response);
}

export async function getAttachmentUrl(record) {
  const token = await pb.files.getToken();
  return pb.files.getURL(record, record.file, { token });
}

export function escapeFilterValue(value) {
  return String(value || "").replace(/["\\]/g, "");
}

export async function delegateTicketApproval(ticketId, delegate, note) {
  return pb.send(`/api/itsm/tickets/${ticketId}/approval`, {
    method: "POST",
    body: { decision: "delegated", delegate, note },
  });
}

function reportQuery(params = {}) {
  const query = new URLSearchParams();
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.bucket) query.set("bucket", params.bucket);
  // Akun vendor: kosong berarti gabungan semua rumah sakit.
  if (params.tenant) query.set("tenant", params.tenant);
  return query.toString();
}

export async function fetchSlaReport(params = {}) {
  const query = reportQuery(params);
  return pb.send(`/api/itsm/reports/sla${query ? `?${query}` : ""}`);
}

export async function downloadSlaReportCsv(params = {}) {
  const query = reportQuery(params);
  const response = await fetch(
    `${pb.baseURL}/api/itsm/reports/sla.csv${query ? `?${query}` : ""}`,
    { headers: { Authorization: pb.authStore.token } }
  );

  if (!response.ok) {
    const text = await response.text();
    let message = `Unduhan gagal (${response.status})`;
    try {
      message = JSON.parse(text)?.message || message;
    } catch {
      // response bukan JSON
    }
    throw new ApiError(message, response.status);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : "laporan-sla.csv";
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function fetchProfile() {
  return pb.send("/api/itsm/profile");
}

export async function updateProfile(payload) {
  return pb.send("/api/itsm/profile", { method: "PATCH", body: payload });
}

export async function changePassword(payload) {
  return pb.send("/api/itsm/profile/password", { method: "POST", body: payload });
}

export async function uploadAvatar(file) {
  const formData = new FormData();
  formData.append("avatar", file);

  const response = await fetch(`${pb.baseURL}/api/itsm/profile/avatar`, {
    method: "POST",
    headers: { Authorization: pb.authStore.token },
    body: formData,
  });

  return parseResponse(response);
}

export async function removeAvatar() {
  return pb.send("/api/itsm/profile/avatar", { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Konsol Vendor (platform). Semua route memerlukan akun `is_platform_staff`
// dan instalasi bertipe `TENANCY_MODE=vendor`; penolakan datang dari server.
// ---------------------------------------------------------------------------

export async function fetchAppMeta() {
  return pb.send("/api/itsm/app-meta");
}

export async function fetchPlatformAudit(params = {}) {
  const query = new URLSearchParams();

  for (const key of [
    "tenant",
    "action",
    "collection",
    "actor",
    "scope",
    "q",
    "from",
    "to",
    "page",
    "perPage",
  ]) {
    if (params[key]) query.set(key, String(params[key]));
  }

  const text = query.toString();
  return pb.send(`/api/itsm/platform/audit${text ? `?${text}` : ""}`);
}

export async function fetchPlatformTenants() {
  return pb.send("/api/itsm/platform/tenants");
}

export async function fetchPlatformTenant(tenantId) {
  return pb.send(`/api/itsm/platform/tenants/${tenantId}`);
}

export async function createPlatformTenant(payload) {
  return pb.send("/api/itsm/platform/tenants", {
    method: "POST",
    body: payload,
  });
}

export async function updatePlatformTenant(tenantId, payload) {
  return pb.send(`/api/itsm/platform/tenants/${tenantId}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function seedPlatformTenant(tenantId) {
  return pb.send(`/api/itsm/platform/tenants/${tenantId}/seed`, {
    method: "POST",
  });
}

export async function createPlatformTenantUser(tenantId, payload) {
  return pb.send(`/api/itsm/platform/tenants/${tenantId}/users`, {
    method: "POST",
    body: payload,
  });
}

export async function fetchTeam() {
  return pb.send("/api/itsm/team");
}

export async function createTeamMember(payload) {
  return pb.send("/api/itsm/team", { method: "POST", body: payload });
}

export async function updateTeamMember(userId, payload) {
  return pb.send(`/api/itsm/team/${userId}`, { method: "PATCH", body: payload });
}

export async function resetTeamPassword(userId) {
  return pb.send(`/api/itsm/team/${userId}/password`, { method: "POST" });
}

export async function fetchTenantMaster(tenantId) {
  return pb.send(`/api/itsm/platform/tenants/${tenantId}/master`);
}

export async function createTenantMaster(tenantId, kind, payload) {
  return pb.send(`/api/itsm/platform/tenants/${tenantId}/master/${kind}`, {
    method: "POST",
    body: payload,
  });
}

export async function updateTenantMaster(tenantId, kind, recordId, payload) {
  return pb.send(
    `/api/itsm/platform/tenants/${tenantId}/master/${kind}/${recordId}`,
    { method: "PATCH", body: payload }
  );
}

export async function updatePlatformTenantUser(tenantId, userId, payload) {
  return pb.send(`/api/itsm/platform/tenants/${tenantId}/users/${userId}`, {
    method: "PATCH",
    body: payload,
  });
}
