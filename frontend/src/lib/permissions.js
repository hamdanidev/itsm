export const ROLE_LABELS = {
  requester: "Pemohon",
  it_support: "Staff IT",
  resolver: "Teknisi",
  it_lead: "Kepala IT",
  viewer: "Pengamat",
};

export function roleOf(user) {
  return user?.role || "requester";
}

export function isStaff(user) {
  return ["it_support", "it_lead"].includes(roleOf(user));
}

export function isLead(user) {
  return roleOf(user) === "it_lead";
}

// Teknisi/spesialis: programmer, jaringan, hardware, DBA, admin SIMRS.
// Bukan agent penuh; hanya tiket yang di-assign kepadanya.
export function isResolver(user) {
  return roleOf(user) === "resolver";
}

// Pengamat: akses baca laporan untuk pimpinan/auditor/DPO.
export function isViewer(user) {
  return roleOf(user) === "viewer";
}

export function isStaffOrResolver(user) {
  return isStaff(user) || isResolver(user);
}

// Scope akun platform (vendor). Orthogonal terhadap role: `role` menentukan
// boleh apa, `is_platform_staff` menentukan bahwa akun bekerja lintas tenant.
export function isPlatformStaff(user) {
  return Boolean(user?.is_platform_staff);
}

export function isPlatformAdmin(user) {
  return isPlatformStaff(user) && isLead(user);
}

export function canViewReports(user) {
  return isLead(user) || isViewer(user);
}

export function canTriage(user) {
  return isStaff(user);
}

export function canAssignOthers(user) {
  return isLead(user);
}

export function canClose(user) {
  return isStaff(user);
}

// Resolver hanya boleh mengerjakan tiket yang menjadi assignee-nya.
export function canWorkTicket(user, ticket) {
  if (isStaff(user)) return true;
  return isResolver(user) && Boolean(ticket) && ticket.assignee === user?.id;
}

export function roleLabel(user) {
  if (isPlatformStaff(user)) {
    return isLead(user) ? "Admin Vendor" : "Staf Vendor";
  }

  return ROLE_LABELS[roleOf(user)] || "Pemohon";
}

export function tenantRoleLabel(role) {
  return ROLE_LABELS[role] || "Pemohon";
}
