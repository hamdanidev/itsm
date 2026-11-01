import { useCallback, useEffect, useState } from "react";
import PageHeader from "../../../components/ui/PageHeader";
import EmptyState from "../../../components/ui/EmptyState";
import {
  downloadSlaReportCsv,
  fetchSlaReport,
  getErrorMessage,
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
  change_request: "Change Request",
};

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

export default function ReportsPage() {
  const [from, setFrom] = useState(() => daysAgo(89));
  const [to, setTo] = useState(() => wibDateString());
  const [bucket, setBucket] = useState("month");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (params) => {
    setLoading(true);
    setError("");

    try {
      const data = await fetchSlaReport(params);
      setReport(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load({ from: daysAgo(89), to: wibDateString(), bucket: "month" });
  }, [load]);

  function apply(next = {}) {
    const params = {
      from: next.from ?? from,
      to: next.to ?? to,
      bucket: next.bucket ?? bucket,
    };

    setFrom(params.from);
    setTo(params.to);
    setBucket(params.bucket);
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
      await downloadSlaReportCsv({ from, to });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setDownloading(false);
    }
  }

  const summary = report?.summary;
  const isEmpty = Boolean(report) && report.summary.total === 0;
  const trendMax = Math.max(1, ...(report?.trend || []).map((item) => item.created));

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Laporan" }]}
        title="Laporan SLA"
        description="Compliance, tren, dan waktu penyelesaian tiket per unit, prioritas, dan jenis."
        actions={
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
        }
      />

      <div className="report-filters">
        <div className="report-fields">
          <div className="report-field">
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

          <div className="report-field">
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

          <div className="report-field">
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
            className="btn btn-outline report-apply"
            type="button"
            onClick={() => apply()}
            disabled={loading}
          >
            <i className="bi bi-funnel" aria-hidden="true" />
            Terapkan
          </button>
        </div>

        <div className="report-presets">
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
                    <table className="admin-table report-table">
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
                                <td className="col-code">{item.ticket_no}</td>
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
    </>
  );
}
