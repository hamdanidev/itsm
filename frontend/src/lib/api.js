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

// ---------------------------------------------------------------------------
// Intake publik (QR) dan pengelolaan titik QR.
// ---------------------------------------------------------------------------

export async function fetchPublicIntake(token) {
  const response = await fetch(
    `${pb.baseURL}/api/itsm/public/intake/${encodeURIComponent(token)}`
  );

  return parseResponse(response);
}

export async function submitPublicIntake(token, payload, files = []) {
  const form = new FormData();
  form.append("payload", JSON.stringify(payload));

  for (const file of files) {
    form.append("files", file, file.name);
  }

  const response = await fetch(
    `${pb.baseURL}/api/itsm/public/intake/${encodeURIComponent(token)}`,
    { method: "POST", body: form }
  );

  return parseResponse(response);
}

export async function fetchIntakePoints() {
  return pb.send("/api/itsm/intake-points");
}

export async function createIntakePoint(payload) {
  return pb.send("/api/itsm/intake-points", { method: "POST", body: payload });
}

export async function updateIntakePoint(id, payload) {
  return pb.send(`/api/itsm/intake-points/${id}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function rotateIntakePoint(id) {
  return pb.send(`/api/itsm/intake-points/${id}/rotate`, { method: "POST" });
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

export async function triageTicket(ticketId, payload) {
  return pb.send(`/api/itsm/tickets/${ticketId}/triage`, {
    method: "POST",
    body: payload,
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

export async function createProblem(payload) {
  return pb.send("/api/itsm/problems", { method: "POST", body: payload });
}

export async function updateProblem(problemId, payload) {
  return pb.send(`/api/itsm/problems/${problemId}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function linkProblem(problemId, ticketId, relation = "caused_by") {
  return pb.send(`/api/itsm/problems/${problemId}/tickets`, {
    method: "POST",
    body: { ticket_id: ticketId, relation },
  });
}

export async function createKnowledge(payload) {
  return pb.send("/api/itsm/knowledge", { method: "POST", body: payload });
}

export async function updateKnowledge(articleId, payload) {
  return pb.send(`/api/itsm/knowledge/${articleId}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function publishKnowledge(articleId, status = "published") {
  return pb.send(`/api/itsm/knowledge/${articleId}/publish`, {
    method: "POST",
    body: { status },
  });
}

export async function searchKnowledge(params = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.service) query.set("service", params.service);
  if (params.limit) query.set("limit", String(params.limit));
  const text = query.toString();
  return pb.send(`/api/itsm/knowledge/search${text ? `?${text}` : ""}`);
}

export async function declareIncident(payload) {
  return pb.send("/api/itsm/incidents", { method: "POST", body: payload });
}

export async function updateIncident(incidentId, payload) {
  return pb.send(`/api/itsm/incidents/${incidentId}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function addIncidentUpdate(incidentId, payload) {
  return pb.send(`/api/itsm/incidents/${incidentId}/updates`, {
    method: "POST",
    body: payload,
  });
}

export async function linkIncidentTicket(
  incidentId,
  ticketId,
  relation = "impacted"
) {
  return pb.send(`/api/itsm/incidents/${incidentId}/tickets`, {
    method: "POST",
    body: { ticket_id: ticketId, relation },
  });
}

export async function fetchIncidentStats(params = {}) {
  const query = new URLSearchParams();
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.tenant) query.set("tenant", params.tenant);
  const text = query.toString();
  return pb.send(`/api/itsm/incidents/stats${text ? `?${text}` : ""}`);
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

export async function fetchOperationsReport(params = {}) {
  const query = reportQuery(params);
  return pb.send(`/api/itsm/reports/operations${query ? `?${query}` : ""}`);
}

async function downloadCsv(path, params, fallbackName) {
  const query = reportQuery(params);
  const response = await fetch(`${pb.baseURL}${path}${query ? `?${query}` : ""}`, {
    headers: { Authorization: pb.authStore.token },
  });

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
  const filename = match ? match[1] : fallbackName;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function downloadSlaReportCsv(params = {}) {
  return downloadCsv("/api/itsm/reports/sla.csv", params, "laporan-sla.csv");
}

export async function downloadOperationsReportCsv(params = {}) {
  return downloadCsv(
    "/api/itsm/reports/operations.csv",
    params,
    "laporan-operasional.csv"
  );
}

export async function fetchAssetOptions(tenantId = "") {
  const query = tenantId
    ? `?tenant=${encodeURIComponent(tenantId)}`
    : "";
  return pb.send(`/api/itsm/assets/options${query}`);
}

export async function fetchAsset(assetId) {
  return pb.send(`/api/itsm/assets/${assetId}`);
}

export async function createAsset(payload) {
  return pb.send("/api/itsm/assets", { method: "POST", body: payload });
}

export async function updateAsset(assetId, payload) {
  return pb.send(`/api/itsm/assets/${assetId}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function fetchTicketAssets(ticketId) {
  return pb.send(`/api/itsm/tickets/${ticketId}/assets`);
}

export async function linkTicketAsset(ticketId, assetId, relation = "affected") {
  return pb.send(`/api/itsm/tickets/${ticketId}/assets`, {
    method: "POST",
    body: { asset_id: assetId, relation },
  });
}

export async function unlinkTicketAsset(ticketId, assetId) {
  return pb.send(`/api/itsm/tickets/${ticketId}/assets/${assetId}`, {
    method: "DELETE",
  });
}

export async function fetchTicketCsat(ticketId) {
  return pb.send(`/api/itsm/tickets/${ticketId}/csat`);
}

export async function submitTicketCsat(ticketId, payload) {
  return pb.send(`/api/itsm/tickets/${ticketId}/csat`, {
    method: "POST",
    body: payload,
  });
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

export async function requestPasswordReset(email) {
  return pb.send("/api/itsm/auth/forgot-password", {
    method: "POST",
    body: { email },
  });
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

// ---------------------------------------------------------------------------
// Setup awal instalasi (first-run). Kedua route publik: dipakai sebelum ada akun.
// ---------------------------------------------------------------------------

export async function fetchSetupStatus() {
  return pb.send("/api/itsm/setup/status");
}

export async function submitSetup(payload) {
  return pb.send("/api/itsm/setup", { method: "POST", body: payload });
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

export async function fetchTenantAudit(params = {}) {
  const query = new URLSearchParams();

  for (const key of [
    "scope",
    "action",
    "actor",
    "q",
    "from",
    "to",
    "page",
    "perPage",
  ]) {
    if (params[key]) query.set(key, String(params[key]));
  }

  const text = query.toString();
  return pb.send(`/api/itsm/audit${text ? `?${text}` : ""}`);
}

// Query string untuk endpoint daftar berhalaman (page, perPage, q).
function pagedQuery(params = {}) {
  const query = new URLSearchParams();

  if (params.page) query.set("page", String(params.page));
  if (params.perPage) query.set("perPage", String(params.perPage));

  const search = String(params.q || "").trim();
  if (search) query.set("q", search);

  const text = query.toString();
  return text ? `?${text}` : "";
}

export async function fetchPlatformTenants(params = {}) {
  return pb.send(`/api/itsm/platform/tenants${pagedQuery(params)}`);
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

export async function fetchTeam(params = {}) {
  return pb.send(`/api/itsm/team${pagedQuery(params)}`);
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

export async function uploadTenantLogo(file) {
  const formData = new FormData();
  formData.append("logo", file);

  const response = await fetch(`${pb.baseURL}/api/itsm/tenant/logo`, {
    method: "POST",
    headers: { Authorization: pb.authStore.token },
    body: formData,
  });

  return parseResponse(response);
}

export async function removeTenantLogo() {
  return pb.send("/api/itsm/tenant/logo", { method: "DELETE" });
}

export async function fetchMailStatus() {
  return pb.send("/api/itsm/mail/status");
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
