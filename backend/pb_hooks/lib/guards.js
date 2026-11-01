var STAFF_ROLES = ["it_support", "it_lead"];

function requireAuth(e) {
  if (!e.auth) throw new UnauthorizedError("Authentication required");
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

function assertStaff(auth) {
  if (!isStaff(auth)) throw new ForbiddenError("Staff role required");
}

function assertLead(auth) {
  if (!isLead(auth)) throw new ForbiddenError("IT Lead role required");
}

function assertSameTenant(auth, record) {
  if (!auth || !record) throw new NotFoundError("Record not found");
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
  if (String(auth.get("tenant") || "") !== String(ticket.get("tenant") || "")) {
    return false;
  }

  var userId = String(auth.id || "");
  if (!userId) return false;
  if (!auth.get("is_active")) return false;
  if (STAFF_ROLES.indexOf(String(auth.get("role") || "")) >= 0) return true;
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
  assertStaff: assertStaff,
  assertLead: assertLead,
  assertSameTenant: assertSameTenant,
  findTicket: findTicket,
  assertTicketAccess: assertTicketAccess,
  canAccessTicket: canAccessTicket,
  cleanText: cleanText,
  optionalDate: optionalDate,
};
