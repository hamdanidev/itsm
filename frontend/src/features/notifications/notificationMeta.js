export const NOTIF_ICONS = {
  assigned: "bi-person-check",
  comment: "bi-chat-left-text",
  status: "bi-arrow-right-circle",
  approval: "bi-patch-check",
  sla: "bi-exclamation-triangle",
  escalation: "bi-arrow-up-circle",
  incident: "bi-exclamation-octagon",
};

export function notificationIcon(type) {
  return NOTIF_ICONS[type] || "bi-bell";
}
