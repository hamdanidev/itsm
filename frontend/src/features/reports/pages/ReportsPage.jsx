import { useCallback, useEffect, useState } from "react";
import PageHeader from "../../../components/ui/PageHeader";
import EmptyState from "../../../components/ui/EmptyState";
import { useAuth } from "../../../app/providers/AuthProvider";
import { useTenant } from "../../../app/providers/TenantProvider";
import { isPlatformStaff, isLead } from "../../../lib/permissions";
import {
  downloadOperationsReportCsv,
  downloadSlaReportCsv,
  fetchIncidentStats,
  fetchOperationsReport,
  fetchReportSchedule,
  fetchSlaReport,
  getErrorMessage,
  runReportSchedule,
  updateReportSchedule,
} from "../../../lib/api";

const PRIORITY_LABELS = {
  critical: "Kritis",
  high: "Tinggi",
  normal: "Normal",
  low: "Rendah",
};

const TYPE_LABELS = {
  incident: "Incident",
  service_request: "Service Request",
  change_request: "Change Request",};

const STATUS_LABELS = {
  open: "Open",
  assigned: "Assigned",
  in_progress: "Dikerjakan",
  waiting: "Menunggu requester",
  resolved: "Resolved",
  closed: "Closed",
  reopened: "Reopened",
};

const PRESETS = [
  { label: "30 hari", days: 30 },
  { label: "90 hari", days: 90 },
  { label: "365 hari", days: 365 },
  { label: "Bulan ini", month: true },
];

function wibDateString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
  }).format(date);
}

function daysAgo(days) {
  return wibDateString(new Date(Date.now() - days * 86400000));
}

function startOfMonth() {
  const today = wibDateString();
  return `${today.slice(0, 7)}-01`;
}

function formatDuration(minutes) {
  if (minutes == null) return "—";

  const total = Math.round(minutes);
  if (total < 60) return `${total} mnt`;

  const hours = Math.floor(total / 60);
  const rest = total % 60;

  return rest ? `${hours} j ${rest} m` : `${hours} j`;
}

function formatPercent(value) {
  if (value == null) return "—";

  return `${value.toLocaleString("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })}%`;
}

function formatDate(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function Kpi({ icon, label, value, hint, tone = "" }) {
  return (
    <div className={`kpi-card is-static${tone ? ` is-${tone}` : ""}`}>
      <span className="kpi-head">
        <i className={`bi ${icon}`} aria-hidden="true" />
        {label}
      </span>
      <span className="kpi-value">{value}</span>
      <span className="kpi-hint">{hint}</span>
    </div>
  );
}

function ComplianceCell({ value }) {
  const tone =
    value == null ? "is-muted" : value >= 90 ? "is-ok" : value >= 70 ? "" : "is-bad";

  return <span className={`report-compliance ${tone}`}>{formatPercent(value)}</span>;
}

function GroupTable({ rows, label }) {
  if (!rows.length) {
    return <div className="report-empty">Belum ada data pada periode ini.</div>;
  }

  return (
    <div className="report-table-wrap">
      <table className="admin-table report-table">
        <thead>
          <tr>
            <th>{label}</th>
            <th className="col-num">Tiket</th>
            <th className="col-num">Selesai</th>
            <th className="col-num">Breach</th>
            <th className="col-num">Compliance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td>{row.name}</td>
              <td className="col-num">{row.summary.total}</td>
              <td className="col-num">{row.summary.resolved}</td>
              <td className="col-num">{row.summary.breached}</td>
              <td className="col-num">
                <ComplianceCell value={row.summary.compliance} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OperationsSection({ data, onDownload, downloading }) {
  if (!data) return null;

  const csat = data.csat || { count: 0, average: null, by_service: [] };
  const incidents = data.incidents || { total: 0, by_service: [] };
  const knowledge = data.knowledge || {};
  const sla = data.sla || {};

  return (
    <section className="panel report-panel" style={{ marginTop: 18 }}>
      <div className="panel-head">
        <div className="panel-title">
          <i className="bi bi-activity" aria-hidden="true" />
          Laporan operasional
        </div>
        <div className="panel-actions">
          <span className="panel-count">
            {data.range?.from} – {data.range?.to}
          </span>
          <button
            className="btn btn-outline btn-sm"
            type="button"
            onClick={onDownload}
            disabled={downloading}
          >
            {downloading ? (
              <span className="spinner spinner--dark" aria-hidden="true" />
            ) : (
              <i className="bi bi-download" aria-hidden="true" />
            )}
            Unduh CSV operasional
          </button>
        </div>
      </div>

      <div className="panel-body">
        <div className="kpi-grid">
          <Kpi
            icon="bi-star"
            label="CSAT"
            value={csat.average == null ? "—" : `${csat.average}/5`}
            hint={`${csat.count} respons`}
          />
          <Kpi
            icon="bi-ticket-detailed"
            label="Insiden"
            value={incidents.total}
            hint={`${incidents.by_service.length} layanan`}
          />
          <Kpi
            icon="bi-journal-text"
            label="Artikel terbit"
            value={knowledge.articles_published ?? 0}
            hint={`${knowledge.tickets_with_kb ?? 0} tiket tertaut KB`}
          />
          <Kpi
            icon="bi-link-45deg"
            label="KB link rate"
            value={formatPercent(knowledge.link_rate)}
            hint="Tiket pada periode"
          />
          <Kpi
            icon="bi-shield-check"
            label="Compliance SLA"
            value={formatPercent(sla.compliance)}
            hint={`${sla.breached ?? 0} breach`}
          />
        </div>

        <div className="report-grid">
          <section className="panel report-panel">
            <div className="panel-head">
              <div className="panel-title">Insiden per layanan</div>
            </div>
            <div className="panel-body">
              {incidents.by_service.length === 0 ? (
                <div className="report-empty">Belum ada insiden.</div>
              ) : (
                <div className="report-table-wrap">
                  <table className="admin-table report-table">
                    <thead>
                      <tr>
                        <th>Layanan</th>
                        <th className="col-num">Insiden</th>
                        <th className="col-num">Selesai</th>
                        <th className="col-num">Breach</th>
                        <th className="col-num">Compliance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incidents.by_service.map((item) => (
                        <tr key={item.name}>
                          <td>{item.name}</td>
                          <td className="col-num">{item.total}</td>
                          <td className="col-num">{item.resolved}</td>
                          <td className="col-num">{item.breached}</td>
                          <td className="col-num">
                            <ComplianceCell value={item.compliance} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          <section className="panel report-panel">
            <div className="panel-head">
              <div className="panel-title">CSAT per layanan</div>
            </div>
            <div className="panel-body">
              {csat.by_service.length === 0 ? (
                <div className="report-empty">Belum ada respons CSAT.</div>
              ) : (
                <div className="report-table-wrap">
                  <table className="admin-table report-table">
                    <thead>
                      <tr>
                        <th>Layanan</th>
                        <th className="col-num">Respons</th>
                        <th className="col-num">Rata-rata</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csat.by_service.map((item) => (
                        <tr key={item.name}>
                          <td>{item.name}</td>
                          <td className="col-num">{item.count}</td>
                          <td className="col-num">{item.average}/5</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          <section className="panel report-panel">
            <div className="panel-head">
              <div className="panel-title">Problem teratas</div>
            </div>
            <div className="panel-body">
              {data.top_problems.length === 0 ? (
                <div className="report-empty">Belum ada problem.</div>
              ) : (
                <div className="report-table-wrap">
                  <table className="admin-table report-table">
                    <thead>
                      <tr>
                        <th>Problem</th>
                        <th className="col-num">Tiket</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.top_problems.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <div className="admin-name">{item.title}</div>
                            <div className="admin-sub">{item.problem_no}</div>
                          </td>
                          <td className="col-num">{item.ticket_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>

        <p className="dash-note">
          Insiden dihitung dari tiket tipe incident pada periode. CSAT hanya
          dari respons yang dikirim pemohon setelah tiket selesai/ditutup.
          KB link rate adalah persentase tiket pada periode yang sudah
          ditautkan ke artikel pengetahuan.
        </p>
      </div>
    </section>
  );
}

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

function monthKeyLabel(key) {
  const [year, month] = String(key).split("-");
  const monthIndex = Number(month) - 1;
  return `${MONTH_SHORT[monthIndex] || month} ${year}`;
}

function IncidentStatsSection({ stats }) {
  if (!stats) return null;

  const totals = stats.totals || {};
  const trend = stats.trend || [];

  return (
    <section className="panel report-panel" style={{ marginTop: 18 }}>
      <div className="panel-head">
        <div className="panel-title">
          <i className="bi bi-exclamation-octagon" aria-hidden="true" />
          Insiden mayor
        </div>
        <span className="panel-count">
          {stats.range?.from} – {stats.range?.to}
        </span>
      </div>
      <div className="panel-body">
        <div className="problem-kpis incident-report-kpis">
          <div className="problem-kpi">
            <span>Total insiden</span>
            <strong>{totals.total ?? 0}</strong>
          </div>
          <div className="problem-kpi">
            <span>Aktif</span>
            <strong>{totals.active ?? 0}</strong>
          </div>
          <div className="problem-kpi">
            <span>MTTR (median)</span>
            <strong>{formatDuration(stats.mttr_minutes)}</strong>
          </div>
          <div className="problem-kpi">
            <span>PIR selesai</span>
            <strong>{totals.pir_completed ?? 0}</strong>
          </div>
        </div>

        {trend.length === 0 ? (
          <div className="report-empty">
            Belum ada insiden mayor pada rentang ini.
          </div>
        ) : (
          <div className="report-table-wrap">
            <table className="admin-table report-table">
              <thead>
                <tr>
                  <th>Periode</th>
                  <th className="col-num">Insiden</th>
                  <th className="col-num">Dipulihkan</th>
                  <th className="col-num">PIR</th>
                </tr>
              </thead>
              <tbody>
                {trend.map((row) => (
                  <tr key={row.key}>
                    <td>{monthKeyLabel(row.key)}</td>
                    <td className="col-num">{row.total}</td>
                    <td className="col-num">{row.resolved}</td>
                    <td className="col-num">{row.pir_completed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

export default function ReportsPage() {
  const { user } = useAuth();
  const { tenants } = useTenant();
  const isVendor = isPlatformStaff(user);
  const canSchedule = isLead(user) && !isVendor;

  const [from, setFrom] = useState(() => daysAgo(89));
  const [to, setTo] = useState(() => wibDateString());
  const [bucket, setBucket] = useState("month");
  // Kosong = gabungan semua rumah sakit (hanya berlaku untuk akun vendor).
  const [tenantFilter, setTenantFilter] = useState("");
  const [report, setReport] = useState(null);
  const [operations, setOperations] = useState(null);
  const [incidentStats, setIncidentStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [operationsDownloading, setOperationsDownloading] = useState(false);
  const [error, setError] = useState("");
  const [schedule, setSchedule] = useState(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleRunning, setScheduleRunning] = useState(false);
  const [scheduleNotice, setScheduleNotice] = useState("");
  const [scheduleError, setScheduleError] = useState("");

  const load = useCallback(async (params) => {
    setLoading(true);
    setError("");

    try {
      const [data, operational, incidents] = await Promise.all([
        fetchSlaReport(params),
        fetchOperationsReport(params),
        fetchIncidentStats(params).catch(() => null),
      ]);
      setReport(data);
      setOperations(operational);
      setIncidentStats(incidents);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load({ from: daysAgo(89), to: wibDateString(), bucket: "month" });
  }, [load]);

  useEffect(() => {
    if (!canSchedule) return undefined;

    let active = true;

    fetchReportSchedule()
      .then((data) => {
        if (active) setSchedule(data);
      })
      .catch((err) => {
        if (active) setScheduleError(getErrorMessage(err));
      });

    return () => {
      active = false;
    };
  }, [canSchedule]);

  function apply(next = {}) {
    const params = {
      from: next.from ?? from,
      to: next.to ?? to,
      bucket: next.bucket ?? bucket,
      tenant: next.tenant ?? tenantFilter,
    };

    setFrom(params.from);
    setTo(params.to);
    setBucket(params.bucket);
    if (next.tenant !== undefined) setTenantFilter(next.tenant);
    load(params);
  }

  function applyPreset(preset) {
    if (preset.month) {
      apply({ from: startOfMonth(), to: wibDateString() });
      return;
    }

    apply({ from: daysAgo(preset.days - 1), to: wibDateString() });
  }

  async function downloadCsv() {
    setDownloading(true);
    setError("");

    try {
      await downloadSlaReportCsv({ from, to, tenant: tenantFilter });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setDownloading(false);
    }
  }

  async function downloadOperations() {
    setOperationsDownloading(true);
    setError("");

    try {
      await downloadOperationsReportCsv({ from, to, tenant: tenantFilter });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setOperationsDownloading(false);
    }
  }

  function printReport() {
    document.body.classList.add("print-report");
    const cleanup = () => {
      document.body.classList.remove("print-report");
      window.removeEventListener("afterprint", cleanup);
    };

    window.addEventListener("afterprint", cleanup);
    window.print();
    window.setTimeout(cleanup, 1500);
  }

  async function saveSchedule(frequency) {
    setScheduleSaving(true);
    setScheduleNotice("");
    setScheduleError("");

    try {
      const data = await updateReportSchedule(frequency);
      setSchedule((current) => ({ ...current, ...data }));
      setScheduleNotice("Jadwal laporan disimpan.");
    } catch (err) {
      setScheduleError(getErrorMessage(err));
    } finally {
      setScheduleSaving(false);
    }
  }

  async function runSchedule() {
    setScheduleRunning(true);
    setScheduleNotice("");
    setScheduleError("");

    try {
      const result = await runReportSchedule();
      setSchedule((current) => ({
        ...current,
        last_sent_at: new Date().toISOString(),
      }));
      setScheduleNotice(
        result.sent
          ? `Laporan dikirim ke ${result.sent} Kepala IT.`
          : "Tidak ada email yang terkirim. Periksa konfigurasi SMTP atau penerima."
      );
    } catch (err) {
      setScheduleError(getErrorMessage(err));
    } finally {
      setScheduleRunning(false);
    }
  }

  const summary = report?.summary;
  const isEmpty = Boolean(report) && report.summary.total === 0;
  const trendMax = Math.max(1, ...(report?.trend || []).map((item) => item.created));
  // Laporan gabungan: breach perlu menyebut rumah sakitnya.
  const allTenants = report?.scope?.mode === "all";

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Laporan" }]}
        title={isVendor && !tenantFilter ? "Laporan SLA lintas RS" : "Laporan SLA"}
        description={
          isVendor
            ? "Compliance, tren, dan perbandingan SLA antar rumah sakit yang Anda layani."
            : "Compliance, tren, dan waktu penyelesaian tiket per unit, prioritas, dan jenis."
        }
        actions={
          <>
            <button
              className="btn btn-outline"
              type="button"
              onClick={printReport}
              disabled={loading}
            >
              <i className="bi bi-printer" aria-hidden="true" />
              Cetak / PDF
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={downloadCsv}
              disabled={downloading || loading}
            >
              {downloading ? (
                <span className="spinner" aria-hidden="true" />
              ) : (
                <i className="bi bi-download" aria-hidden="true" />
              )}
              Unduh CSV
            </button>
          </>
        }
      />

      <div className="filter-bar is-boxed">
        <div className="filter-fields">
          {isVendor && (
            <div className="filter-field">
              <label className="form-label" htmlFor="report-tenant">
                Rumah sakit
              </label>
              <select
                id="report-tenant"
                className="select"
                value={tenantFilter}
                onChange={(event) => setTenantFilter(event.target.value)}
              >
                <option value="">Semua rumah sakit</option>
                {tenants.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="filter-field">
            <label className="form-label" htmlFor="report-from">
              Dari
            </label>
            <input
              id="report-from"
              className="input"
              type="date"
              value={from}
              max={to}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>

          <div className="filter-field">
            <label className="form-label" htmlFor="report-to">
              Sampai
            </label>
            <input
              id="report-to"
              className="input"
              type="date"
              value={to}
              min={from}
              max={wibDateString()}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>

          <div className="filter-field">
            <label className="form-label" htmlFor="report-bucket">
              Tren
            </label>
            <select
              id="report-bucket"
              className="select"
              value={bucket}
              onChange={(event) => setBucket(event.target.value)}
            >
              <option value="month">Bulanan</option>
              <option value="week">Mingguan</option>
            </select>
          </div>

          <button
            className="btn btn-outline"
            type="button"
            onClick={() => apply()}
            disabled={loading}
          >
            <i className="bi bi-funnel" aria-hidden="true" />
            Terapkan
          </button>
        </div>

        <div className="report-presets filter-end">
          <span>Rentang cepat:</span>
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              className="btn btn-subtle"
              type="button"
              onClick={() => applyPreset(preset)}
              disabled={loading}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="alert alert--error" role="alert">
          <i className="bi bi-exclamation-triangle" aria-hidden="true" />
          <div>{error}</div>
        </div>
      )}

      {loading && !report && (
        <div className="page-state">
          <span className="spinner spinner--dark spinner--lg" role="status" />
          <div className="centered-text">Menghitung laporan...</div>
        </div>
      )}

      {report && (
        <>
          <div className="kpi-grid">
            <Kpi
              icon="bi-ticket-detailed"
              label="Tiket dibuat"
              value={summary.total}
              hint={`${report.range.from} – ${report.range.to}`}
            />
            <Kpi
              icon="bi-check2-circle"
              label="Selesai"
              value={summary.resolved}
              hint={`${formatPercent(
                summary.total ? (summary.resolved / summary.total) * 100 : null
              )} dari tiket dibuat`}
            />
            <Kpi
              icon="bi-shield-check"
              label="Compliance SLA"
              value={formatPercent(summary.compliance)}
              hint={`${summary.breached} tiket breach`}
              tone={summary.compliance != null && summary.compliance < 70 ? "danger" : ""}
            />
            <Kpi
              icon="bi-stopwatch"
              label="Median respons"
              value={formatDuration(summary.median_response_minutes)}
              hint="Waktu respons pertama"
            />
            <Kpi
              icon="bi-hourglass-split"
              label="Median resolusi"
              value={formatDuration(summary.median_resolution_minutes)}
              hint="Tiket yang selesai"
            />
          </div>

          {report.tenants && report.tenants.length > 0 && (
            <section className="panel report-panel">
              <div className="panel-head">
                <div className="panel-title">Perbandingan rumah sakit</div>
                <span className="panel-count">
                  {report.tenants.length} rumah sakit
                </span>
              </div>
              <div className="panel-body">
                <div className="report-table-wrap">
                  <table className="admin-table report-table">
                    <thead>
                      <tr>
                        <th>Rumah sakit</th>
                        <th className="col-num">Dibuat</th>
                        <th className="col-num">Selesai</th>
                        <th className="col-num">Breach</th>
                        <th className="col-num">Compliance</th>
                        <th className="col-num">Median respons</th>
                        <th className="col-num">Median resolusi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.tenants.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <span className="admin-name">{item.name}</span>
                            <div className="admin-sub">
                              <code>{item.code}</code>
                            </div>
                          </td>
                          <td className="col-num">{item.summary.total}</td>
                          <td className="col-num">{item.summary.resolved}</td>
                          <td className="col-num">{item.summary.breached}</td>
                          <td className="col-num">
                            <ComplianceCell value={item.summary.compliance} />
                          </td>
                          <td className="col-num">
                            {formatDuration(item.summary.median_response_minutes)}
                          </td>
                          <td className="col-num">
                            {formatDuration(item.summary.median_resolution_minutes)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {isEmpty ? (
            <div className="panel">
              <div className="panel-body">
                <EmptyState
                  icon="bi-bar-chart"
                  title="Belum ada tiket pada periode ini"
                  description="Coba perluas rentang tanggal atau pilih preset rentang cepat."
                />
              </div>
            </div>
          ) : (
            <>
              <section className="panel report-panel">
                <div className="panel-head">
                  <div className="panel-title">
                    Tren {report.range.bucket === "week" ? "mingguan" : "bulanan"}
                  </div>
                  <span className="panel-count">
                    {summary.total} tiket · {summary.breached} breach
                  </span>
                </div>
                <div className="panel-body">
                  <div className="report-table-wrap">
                    <table className="admin-table report-table report-table--trend">
                      <thead>
                        <tr>
                          <th>Periode</th>
                          <th className="col-num">Dibuat</th>
                          <th className="col-num">Selesai</th>
                          <th className="col-num">Breach</th>
                          <th className="col-num">Compliance</th>
                          <th className="report-bar-col">Volume</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.trend.map((item) => (
                          <tr key={item.key}>
                            <td>{item.label}</td>
                            <td className="col-num">{item.created}</td>
                            <td className="col-num">{item.resolved}</td>
                            <td className="col-num">{item.breached}</td>
                            <td className="col-num">
                              <ComplianceCell value={item.compliance} />
                            </td>
                            <td className="report-bar-col">
                              <span className="bar-track">
                                <span
                                  className="bar-fill"
                                  style={{
                                    width: `${Math.round(
                                      (item.created / trendMax) * 100
                                    )}%`,
                                  }}
                                />
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <div className="report-grid">
                <section className="panel report-panel">
                  <div className="panel-head">
                    <div className="panel-title">Per unit</div>
                    <span className="panel-count">{report.units.length} unit</span>
                  </div>
                  <div className="panel-body">
                    <GroupTable rows={report.units} label="Unit" />
                  </div>
                </section>

                <section className="panel report-panel">
                  <div className="panel-head">
                    <div className="panel-title">Per layanan</div>
                    <span className="panel-count">
                      {(report.services || []).length} layanan
                    </span>
                  </div>
                  <div className="panel-body">
                    <GroupTable
                      rows={report.services || []}
                      label="Layanan"
                    />
                  </div>
                </section>

                <section className="panel report-panel">
                  <div className="panel-head">
                    <div className="panel-title">Per prioritas</div>
                  </div>
                  <div className="panel-body">
                    <GroupTable
                      rows={report.priorities.map((row) => ({
                        ...row,
                        name: PRIORITY_LABELS[row.name] || row.name,
                      }))}
                      label="Prioritas"
                    />
                  </div>
                </section>

                <section className="panel report-panel">
                  <div className="panel-head">
                    <div className="panel-title">Per jenis tiket</div>
                  </div>
                  <div className="panel-body">
                    <GroupTable
                      rows={report.types.map((row) => ({
                        ...row,
                        name: TYPE_LABELS[row.name] || row.name,
                      }))}
                      label="Jenis"
                    />
                  </div>
                </section>

                <section className="panel report-panel">
                  <div className="panel-head">
                    <div className="panel-title">Breach terbaru</div>
                    <span className="panel-count">{report.breaches.length} tiket</span>
                  </div>
                  <div className="panel-body">
                    {report.breaches.length === 0 ? (
                      <div className="report-empty">
                        Tidak ada breach pada periode ini.
                      </div>
                    ) : (
                      <div className="report-table-wrap">
                        <table className="admin-table report-table">
                          <thead>
                            <tr>
                              <th>Tiket</th>
                              <th>Unit</th>
                              <th>Prioritas</th>
                              <th>Status</th>
                              <th>Breach pada</th>
                              <th className="col-num">Level</th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.breaches.map((item) => (
                              <tr key={`${item.ticket_no}-${item.breached_at}`}>
                                <td className="col-code">
                                  {item.ticket_no}
                                  {allTenants && item.tenant && (
                                    <div className="admin-sub">{item.tenant}</div>
                                  )}
                                </td>
                                <td>{item.unit}</td>
                                <td>{PRIORITY_LABELS[item.priority] || item.priority}</td>
                                <td>{STATUS_LABELS[item.status] || item.status}</td>
                                <td className="col-date">{formatDate(item.breached_at)}</td>
                                <td className="col-num">
                                  {item.escalation_level || 0}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </section>
              </div>

              <p className="dash-note">
                Compliance dihitung dari tiket yang dibuat pada rentang ini dan
                memiliki catatan breach (respons, approval, atau penyelesaian).
                Median respons memakai tiket yang sudah punya respons pertama;
                median resolusi hanya memakai tiket yang sudah selesai. Untuk
                detail per tiket, unduh CSV atau buka daftar tiket.
              </p>
            </>
          )}
        </>
      )}

      {canSchedule && (
        <section className="panel report-schedule">
          <div className="panel-head">
            <div className="panel-title">
              <i className="bi bi-calendar-check" aria-hidden="true" />
              Laporan terjadwal
            </div>
          </div>
          <div className="panel-body">
            <p className="report-schedule-intro">
              Kirim ringkasan SLA otomatis ke seluruh Kepala IT aktif. Pilih
              mingguan (Senin 07.00 WIB) atau bulanan (tanggal 1, 07.00 WIB).
            </p>

            <div className="report-schedule-controls">
              <select
                className="select"
                value={schedule?.frequency || "off"}
                onChange={(event) => {
                  setSchedule((current) => ({
                    ...current,
                    frequency: event.target.value,
                  }));
                  setScheduleNotice("");
                }}
                aria-label="Frekuensi laporan"
                disabled={scheduleSaving || scheduleRunning}
              >
                <option value="off">Nonaktif</option>
                <option value="weekly">Mingguan · Senin</option>
                <option value="monthly">Bulanan · tanggal 1</option>
              </select>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => saveSchedule(schedule?.frequency || "off")}
                disabled={scheduleSaving || scheduleRunning}
              >
                {scheduleSaving ? "Menyimpan..." : "Simpan jadwal"}
              </button>
              <button
                className="btn btn-outline"
                type="button"
                onClick={runSchedule}
                disabled={scheduleRunning || scheduleSaving}
              >
                {scheduleRunning ? "Mengirim..." : "Kirim sekarang"}
              </button>
            </div>

            <div className="report-schedule-meta">
              {schedule?.next_at && (
                <span>
                  Pengiriman berikutnya: <strong>{formatDate(schedule.next_at)}</strong>
                </span>
              )}
              {schedule?.last_sent_at && (
                <span>
                  Terakhir dikirim: <strong>{formatDate(schedule.last_sent_at)}</strong>
                </span>
              )}
              {schedule?.recipients != null && (
                <span>
                  Penerima: <strong>{schedule.recipients} Kepala IT</strong>
                </span>
              )}
            </div>

            {scheduleError && (
              <div className="alert alert--error" role="alert">
                <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                <div>{scheduleError}</div>
              </div>
            )}
            {scheduleNotice && (
              <div className="alert alert--success" role="status">
                <i className="bi bi-check-circle" aria-hidden="true" />
                <div>{scheduleNotice}</div>
              </div>
            )}
          </div>
        </section>
      )}

      <IncidentStatsSection stats={incidentStats} />

      <OperationsSection
        data={operations}
        onDownload={downloadOperations}
        downloading={operationsDownloading}
      />
    </>
  );
}
