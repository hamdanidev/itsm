export function roleOf(user) {
  return user?.role || "requester";
}

export function isStaff(user) {
  return ["it_support", "it_lead"].includes(roleOf(user));
}

export function isLead(user) {
  return roleOf(user) === "it_lead";
}

export function roleLabel(user) {
  return {
    requester: "Requester",
    it_support: "IT Support",
    it_lead: "IT Lead",
  }[roleOf(user)] || "Requester";
}
