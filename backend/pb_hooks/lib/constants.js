module.exports = {
  TICKET_TYPES: ["incident", "service_request", "change_request"],
  PRIORITIES: ["critical", "high", "normal", "low"],
  SOURCES: ["web", "whatsapp", "email", "phone"],
  APPROVAL_MODES: ["default", "none", "manager", "lead", "cab"],
  CHANGE_OUTCOMES: ["successful", "failed", "rolled_back", "partial"],
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
  // Role yang boleh menjadi assignee tiket: agent penuh + teknisi/spesialis.
  ASSIGNEE_ROLES: ["it_support", "it_lead", "resolver"],
  // Tim/bidang kerja untuk routing antrean. Disimpan sebagai select agar
  // sederhana; bisa dinaikkan menjadi koleksi `teams` bila perlu.
  TEAMS: [
    "service_desk",
    "application",
    "network",
    "hardware",
    "database",
    "biomedical",
    "other",
  ],
  TEAM_LABELS: {
    service_desk: "Service Desk",
    application: "Aplikasi / SIMRS",
    network: "Jaringan",
    hardware: "Hardware",
    database: "Database",
    biomedical: "Alat Kesehatan",
    other: "Lainnya",
  },
  PRIORITY_LABELS: {
    critical: "Kritis",
    high: "Tinggi",
    normal: "Normal",
    low: "Rendah",
  },
};
