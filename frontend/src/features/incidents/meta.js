export const SEVERITIES = [
  {
    value: "sev1",
    label: "SEV-1 · Kritis",
    short: "SEV-1",
    hint: "Layanan klinis berhenti total; seluruh rumah sakit terdampak.",
    tone: "lozenge--sev1",
  },
  {
    value: "sev2",
    label: "SEV-2 · Mayor",
    short: "SEV-2",
    hint: "Sebagian unit atau alur kerja klinis terganggu.",
    tone: "lozenge--sev2",
  },
  {
    value: "sev3",
    label: "SEV-3 · Minor",
    short: "SEV-3",
    hint: "Gangguan terbatas dengan workaround yang tersedia.",
    tone: "lozenge--sev3",
  },
];

export const SEVERITY_BY_VALUE = Object.fromEntries(
  SEVERITIES.map((item) => [item.value, item])
);

export function severityMeta(value) {
  return SEVERITY_BY_VALUE[value] || SEVERITY_BY_VALUE.sev3;
}

export const STATUS_META = {
  declared: { label: "Dideklarasikan", tone: "lozenge--neutral" },
  investigating: { label: "Investigasi", tone: "status-in_progress" },
  mitigating: { label: "Mitigasi", tone: "status-assigned" },
  monitoring: { label: "Pemantauan", tone: "status-waiting" },
  resolved: { label: "Dipulihkan", tone: "status-resolved" },
  closed: { label: "Ditutup", tone: "status-closed" },
};

export const ACTIVE_STATUSES = [
  "declared",
  "investigating",
  "mitigating",
  "monitoring",
];

export function statusMeta(value) {
  return STATUS_META[value] || { label: value, tone: "lozenge--neutral" };
}

export function isActiveStatus(value) {
  return ACTIVE_STATUSES.includes(value);
}

// Tombol status yang ditampilkan di detail. Resolve dan close punya alur
// sendiri (modal ringkasan / syarat PIR).
export const STATUS_ACTIONS = {
  declared: [
    { status: "investigating", label: "Investigasi" },
    { status: "mitigating", label: "Mitigasi" },
    { status: "monitoring", label: "Pemantauan" },
  ],
  investigating: [
    { status: "mitigating", label: "Mitigasi" },
    { status: "monitoring", label: "Pemantauan" },
  ],
  mitigating: [
    { status: "investigating", label: "Investigasi" },
    { status: "monitoring", label: "Pemantauan" },
  ],
  monitoring: [
    { status: "investigating", label: "Investigasi" },
    { status: "mitigating", label: "Mitigasi" },
  ],
  resolved: [{ status: "investigating", label: "Buka kembali" }],
  closed: [],
};

export const UPDATE_KINDS = [
  { value: "update", label: "Update" },
  { value: "decision", label: "Keputusan" },
  { value: "communication", label: "Komunikasi" },
];

export const VISIBILITIES = [
  { value: "internal", label: "Internal IT" },
  { value: "public", label: "Publik (pemilik tiket)" },
];

export const RELATIONS = [
  { value: "impacted", label: "Terdampak" },
  { value: "caused", label: "Penyebab" },
  { value: "related", label: "Terkait" },
];

export function relationLabel(value) {
  return RELATIONS.find((item) => item.value === value)?.label || value;
}
