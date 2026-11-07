var STAFF_ROLES = ["it_support", "it_lead"];
var RESOLVER_ROLE = "resolver";
var VIEWER_ROLE = "viewer";

function requireAuth(e, options) {
  if (!e.auth) throw new UnauthorizedError("Authentication required");

  // Akun dengan password awal (dibuat Kepala IT) wajib mengganti password lebih
  // dulu. Hanya route ganti password sendiri yang boleh melewati gerbang ini.
  if (
    !(options && options.allowPendingPassword) &&
    e.auth.get("must_change_password")
  ) {
    throw new ForbiddenError("Ganti password Anda terlebih dahulu");
  }

  return e.auth;
}

function roleOf(auth) {
  return auth ? String(auth.get("role") || "") : "";
}

function isStaff(auth) {
  return STAFF_ROLES.indexOf(roleOf(auth)) >= 0;
}

function isLead(auth) {
  return roleOf(auth) === "it_lead";
}

// Resolver = teknisi/spesialis (programmer, jaringan, hardware, DBA, admin
// SIMRS). Bukan agent penuh: hanya tiket yang ditugaskan kepadanya.
function isResolver(auth) {
  return roleOf(auth) === RESOLVER_ROLE;
}

function isViewer(auth) {
  return roleOf(auth) === VIEWER_ROLE;
}

function isStaffOrResolver(auth) {
  return isStaff(auth) || isResolver(auth);
}

function assertStaff(auth) {
  if (!isStaff(auth)) throw new ForbiddenError("Staff role required");
}

function assertStaffOrResolver(auth) {
  if (!isStaffOrResolver(auth)) {
    throw new ForbiddenError("Staff or resolver role required");
  }
}

function assertLead(auth) {
  if (!isLead(auth)) throw new ForbiddenError("Kepala IT role required");
}

function assertReportReader(auth) {
  if (!isLead(auth) && !isViewer(auth)) {
    throw new ForbiddenError("Report access required");
  }
}

// Resolver hanya boleh mengerjakan tiket yang menjadi assignee-nya.
function isAssignedResolver(auth, ticket) {
  if (!isResolver(auth) || !ticket) return false;

  try {
    return String(ticket.get("assignee") || "") === String(auth.id || "");
  } catch (err) {
    return false;
  }
}

function teamOf(auth) {
  if (!auth) return "";

  try {
    return String(auth.get("team") || "");
  } catch (err) {
    return "";
  }
}

// Resolver boleh membaca tiket timnya (termasuk yang belum di-assign).
function isTeamResolver(auth, ticket) {
  if (!isResolver(auth) || !ticket) return false;

  var team = teamOf(auth);
  if (!team) return false;

  try {
    return String(ticket.get("team") || "") === team;
  } catch (err) {
    return false;
  }
}

// Resolver boleh mengambil tiket tim yang belum di-assign.
function canClaimTeamTicket(auth, ticket) {
  if (!isTeamResolver(auth, ticket)) return false;

  try {
    return !String(ticket.get("assignee") || "");
  } catch (err) {
    return false;
  }
}

// Dipakai untuk komentar/lampiran internal dan transisi tiket: agent penuh
// (Staff IT/Kepala IT) atau resolver yang memegang tiket tersebut.
function canWorkAsStaff(auth, ticket) {
  return isStaff(auth) || isAssignedResolver(auth, ticket);
}

// Scope akun platform (vendor). Orthogonal terhadap `role`: role menentukan
// boleh apa, scope menentukan di tenant mana. Fase 1 hanya membuka Konsol
// Vendor; akses tiket lintas tenant belum diberikan.
function isPlatformStaff(auth) {
  if (!auth) return false;

  try {
    return !!auth.get("is_platform_staff");
  } catch (err) {
    return false;
  }
}

function isPlatformAdmin(auth) {
  return isPlatformStaff(auth) && roleOf(auth) === "it_lead";
}

function assertPlatformStaff(auth) {
  if (!isPlatformStaff(auth)) {
    throw new ForbiddenError("Platform staff role required");
  }
}

function assertPlatformAdmin(auth) {
  if (!isPlatformAdmin(auth)) {
    throw new ForbiddenError("Platform admin role required");
  }
}

function assertSameTenant(auth, record) {
  if (!auth || !record) throw new NotFoundError("Record not found");

  // Vendor melayani semua rumah sakit. Batas tenant tidak berlaku untuk scope
  // platform; kewenangan tulis tetap diperiksa per route.
  if (isPlatformStaff(auth)) return;

  if (String(auth.get("tenant")) !== String(record.get("tenant"))) {
    throw new NotFoundError("Record not found");
  }
}

function findTicket(e, id) {
  var ticket;
  try {
    ticket = e.app.findRecordById("tickets", id);
  } catch (err) {
    throw new NotFoundError("Ticket not found");
  }
  assertSameTenant(e.auth, ticket);
  return ticket;
}

function assertTicketAccess(e, ticket) {
  if (!canAccessTicket(e, ticket)) {
    throw new NotFoundError("Ticket not found");
  }
}

// Cek akses tiket di server. Manual, bukan canAccessRecord(), karena rule
// dengan relasi `delegates` tidak selalu bisa dievaluasi oleh canAccessRecord;
// API rules tetap menjadi lapisan pertama untuk akses REST langsung.
function canAccessTicket(e, ticket) {
  var auth = e.auth;
  if (!auth || !ticket) return false;

  var userId = String(auth.id || "");
  if (!userId) return false;
  if (!auth.get("is_active")) return false;

  // Scope platform: vendor dapat membuka tiket tenant mana pun.
  if (isPlatformStaff(auth)) return true;

  if (String(auth.get("tenant") || "") !== String(ticket.get("tenant") || "")) {
    return false;
  }

  if (STAFF_ROLES.indexOf(String(auth.get("role") || "")) >= 0) return true;
  if (isTeamResolver(auth, ticket)) return true;
  if (String(ticket.get("requester") || "") === userId) return true;
  if (String(ticket.get("assignee") || "") === userId) return true;

  var delegates = ticket.get("delegates");
  if (delegates) {
    for (var i = 0; i < delegates.length; i++) {
      if (String(delegates[i]) === userId) return true;
    }
  }

  var unitId = String(ticket.get("unit") || "");
  if (unitId) {
    try {
      var unit = e.app.findRecordById("units", unitId);
      if (String(unit.get("manager") || "") === userId) return true;
    } catch (err) {
      return false;
    }
  }

  return false;
}

function cleanText(value, maxLength) {
  var text = String(value == null ? "" : value).trim();
  if (maxLength && text.length > maxLength) {
    throw new BadRequestError("Text exceeds maximum length of " + maxLength);
  }
  return text;
}

function optionalDate(value, fieldName) {
  if (value == null || String(value).trim() === "") return "";
  var date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new BadRequestError("Invalid date for " + fieldName);
  }
  return date.toISOString();
}

module.exports = {
  requireAuth: requireAuth,
  roleOf: roleOf,
  isStaff: isStaff,
  isLead: isLead,
  isResolver: isResolver,
  isViewer: isViewer,
  isStaffOrResolver: isStaffOrResolver,
  assertStaff: assertStaff,
  assertStaffOrResolver: assertStaffOrResolver,
  assertLead: assertLead,
  assertReportReader: assertReportReader,
  isAssignedResolver: isAssignedResolver,
  canWorkAsStaff: canWorkAsStaff,
  teamOf: teamOf,
  isTeamResolver: isTeamResolver,
  canClaimTeamTicket: canClaimTeamTicket,
  isPlatformStaff: isPlatformStaff,
  isPlatformAdmin: isPlatformAdmin,
  assertPlatformStaff: assertPlatformStaff,
  assertPlatformAdmin: assertPlatformAdmin,
  assertSameTenant: assertSameTenant,
  findTicket: findTicket,
  assertTicketAccess: assertTicketAccess,
  canAccessTicket: canAccessTicket,
  cleanText: cleanText,
  optionalDate: optionalDate,
};
