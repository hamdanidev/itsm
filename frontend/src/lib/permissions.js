export function roleOf(user) {
  return user?.role || "requester";
}

export function isStaff(user) {
  return ["it_support", "it_lead"].includes(roleOf(user));
}

export function isLead(user) {
  return roleOf(user) === "it_lead";
}

// Scope akun platform (vendor). Orthogonal terhadap role: `role` menentukan
// boleh apa, `is_platform_staff` menentukan bahwa akun bekerja lintas tenant.
export function isPlatformStaff(user) {
  return Boolean(user?.is_platform_staff);
}

export function isPlatformAdmin(user) {
  return isPlatformStaff(user) && isLead(user);
}

export function roleLabel(user) {
  if (isPlatformStaff(user)) {
    return isLead(user) ? "Vendor Lead" : "Vendor Support";
  }

  return (
    {
      requester: "Requester",
      it_support: "IT Support",
      it_lead: "IT Lead",
    }[roleOf(user)] || "Requester"
  );
}

export function tenantRoleLabel(role) {
  return (
    {
      requester: "Requester",
      it_support: "IT Support",
      it_lead: "IT Lead",
    }[role] || "Requester"
  );
}
