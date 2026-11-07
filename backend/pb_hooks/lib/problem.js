// Helper problem management. Wajib di-require di dalam callback route karena
// callback berjalan pada VM context baru.

function linkTicket(app, problem, ticket, relation) {
  var existing = null;

  try {
    existing = app.findFirstRecordByFilter(
      "problem_tickets",
      "problem = {:problem} && ticket = {:ticket}",
      { problem: problem.id, ticket: ticket.id }
    );
  } catch (err) {
    existing = null;
  }

  if (!existing) {
    var collection = app.findCollectionByNameOrId("problem_tickets");
    existing = new Record(collection);
    existing.set("tenant", String(problem.get("tenant")));
    existing.set("problem", problem.id);
    existing.set("ticket", ticket.id);
    existing.set("relation", relation || "caused_by");
    app.save(existing);
  }

  ticket.set("problem", problem.id);
  ticket.set("last_activity_at", new Date().toISOString());
  app.save(ticket);

  return existing;
}

function response(problem) {
  return {
    id: problem.id,
    problem_no: String(problem.get("problem_no") || ""),
    title: String(problem.get("title") || ""),
    status: String(problem.get("status") || ""),
    service: String(problem.get("service") || ""),
    owner: String(problem.get("owner") || ""),
    root_cause: String(problem.get("root_cause") || ""),
    workaround: String(problem.get("workaround") || ""),
    permanent_fix: String(problem.get("permanent_fix") || ""),
    resolved_at: String(problem.get("resolved_at") || ""),
  };
}

module.exports = {
  linkTicket: linkTicket,
  response: response,
};
