module.exports = {
  TICKET_TYPES: ["incident", "service_request", "change_request"],
  PRIORITIES: ["critical", "high", "normal", "low"],
  IMPACTS: [
    "patient_safety",
    "clinical_workflow",
    "operational",
    "convenience",
  ],
  IMPACT_TO_PRIORITY: {
    patient_safety: "critical",
    clinical_workflow: "high",
    operational: "normal",
    convenience: "low",
  },
  STAFF_ROLES: ["it_support", "it_lead"],
  PRIORITY_LABELS: {
    critical: "Kritis",
    high: "Tinggi",
    normal: "Normal",
    low: "Rendah",
  },
};
