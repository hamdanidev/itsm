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
