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
  var collection = e.app.findCollectionByNameOrId("tickets");
  var allowed = false;

  try {
    allowed = e.app.canAccessRecord(ticket, e.requestInfo(), collection.viewRule);
  } catch (err) {
    allowed = false;
  }

  if (!allowed) throw new NotFoundError("Ticket not found");
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
  cleanText: cleanText,
  optionalDate: optionalDate,
};
