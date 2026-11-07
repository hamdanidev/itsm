// Tim/bidang kerja untuk routing antrean. Nilai harus sama dengan
// `backend/pb_hooks/lib/constants.js` dan migrasi `1794600002_team_queue.js`.
export const TEAM_OPTIONS = [
  ["service_desk", "Service Desk"],
  ["application", "Aplikasi / SIMRS"],
  ["network", "Jaringan"],
  ["hardware", "Hardware"],
  ["database", "Database"],
  ["biomedical", "Alat Kesehatan"],
  ["other", "Lainnya"],
];

export function teamLabel(value) {
  const found = TEAM_OPTIONS.find(([key]) => key === value);
  return found ? found[1] : "—";
}
