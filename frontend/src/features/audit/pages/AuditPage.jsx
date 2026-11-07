import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "../../../components/ui/PageHeader";
import EmptyState from "../../../components/ui/EmptyState";
import Modal from "../../../components/ui/Modal";
import { TableSkeleton } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../app/providers/AuthProvider";
import { useTenant } from "../../../app/providers/TenantProvider";
import { formatDateTime } from "../../../lib/format";
import { isPlatformAdmin, isPlatformStaff } from "../../../lib/permissions";
import {
  fetchPlatformAudit,
  fetchTenantAudit,
  getErrorMessage,
} from "../../../lib/api";

const ACTION_LABELS = {
  create: "Dibuat",
  update: "Diubah",
  transition: "Transisi status",
  assign: "Penugasan",
  approve: "Disetujui",
  reject: "Ditolak",
  comment: "Komentar",
  attachment: "Lampiran",
  login: "Login",
  sla_breach: "SLA lewat",
  escalate: "Eskalasi",
  delegate: "Delegasi",
  problem_link: "Tautan problem",
  knowledge_link: "Tautan pengetahuan",
  asset_create: "Aset dibuat",
  asset_update: "Aset diubah",
  asset_link: "Tautan aset",
  asset_unlink: "Lepas aset",
  csat: "CSAT",
  incident_declare: "Insiden dideklarasikan",
  incident_update: "Update insiden",
  incident_resolve: "Insiden pulih",
  incident_close: "Insiden ditutup",
  incident_link: "Tautan insiden",
  incident_pir: "PIR insiden",
};

const COLLECTION_LABELS = {
  tickets: "Tiket",
  ticket_comments: "Komentar",
  ticket_attachments: "Lampiran",
  ticket_approvals: "Approval",
  users: "Pengguna",
  units: "Unit",
  ticket_categories: "Kategori",
  sla_policies: "Kebijakan SLA",
  holidays: "Hari libur",
  tenants: "Rumah sakit",
  problems: "Problem",
  knowledge_articles: "Pengetahuan",
  assets: "Aset",
  major_incidents: "Insiden mayor",
  services: "Layanan",
};

const SCOPE_OPTIONS = [
  ["", "Semua aktor"],
  ["platform", "Vendor"],
  ["tenant", "Staf rumah sakit"],
  ["superuser", "Superuser"],
];

function wibDateString(date = new Date()) {
  const shifted = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return wibDateString(date);
}

function actionLabel(value) {
  return ACTION_LABELS[value] || value || "—";
}

function collectionLabel(value) {
  return COLLECTION_LABELS[value] || value || "—";
}

function actorLabel(item) {
  if (item.actor_name) return item.actor_name;
  if (item.actor_scope === "superuser") return "Superuser";
  return item.actor ? "(pengguna terhapus)" : "Sistem";
}

function scopeBadge(item) {
  if (item.actor_scope === "platform") {
    return <span className="lozenge status-in_progress">Vendor</span>;
  }
  if (item.actor_scope === "superuser") {
    return <span className="lozenge status-reopened">Superuser</span>;
  }
  return <span className="lozenge lozenge--neutral">Staf RS</span>;
}

export default function AuditPage() {
  const { user } = useAuth();
  const { tenants } = useTenant();
  const isPlatform = isPlatformStaff(user);
  const isAdmin = isPlatformAdmin(user);

  const [filters, setFilters] = useState({
    from: daysAgo(29),
    to: wibDateString(),
    tenant: "",
    scope: "",
    action: "",
    actor: "",
    q: "",
  });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({
    items: [],
    totalItems: 0,
    totalPages: 0,
    page: 1,
    perPage: 25,
    actors: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);

  const load = useCallback(async (nextFilters, nextPage) => {
    setLoading(true);
    setError("");

    try {
      const request = isPlatform ? fetchPlatformAudit : fetchTenantAudit;
      const payload = await request({
        ...nextFilters,
        page: nextPage,
        perPage: 25,
      });
      setData(payload);
    } catch (err) {
      setError(getErrorMessage(err));
      setData({
        items: [],
        totalItems: 0,
        totalPages: 0,
        page: 1,
        perPage: 25,
        actors: [],
      });
    } finally {
      setLoading(false);
    }
  }, [isPlatform]);

  useEffect(() => {
    document.title = isPlatform ? "Audit · Konsol Vendor" : "Audit · Healthcare ITSM";
    load(filters, 1);
    // Muat sekali saat halaman dibuka; filter berikutnya lewat tombol Terapkan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, isPlatform]);

  function setField(key, value) {
    setFilters((current) => {
      const next = { ...current, [key]: value };
      // Aktor bergantung pada rumah sakit; ganti RS berarti reset aktor.
      if (key === "tenant") next.actor = "";
      return next;
    });
  }

  function apply() {
    setPage(1);
    load(filters, 1);
  }

  function goToPage(nextPage) {
    setPage(nextPage);
    load(filters, nextPage);
  }

  const actions = useMemo(
    () => Object.keys(ACTION_LABELS),
    []
  );

  const actorOptions = data.actors || [];

  return (
    <>
      <PageHeader
        breadcrumb={
          isPlatform
            ? [{ label: "Vendor" }, { label: "Audit" }]
            : [{ label: "Audit" }]
        }
        title="Audit"
        description={
          isPlatform
            ? "Jejak aktivitas lintas rumah sakit: siapa mengubah apa, di tiket atau data master mana, dan kapan."
            : "Jejak aktivitas rumah sakit Anda: siapa mengubah apa, di tiket atau data master mana, dan kapan."
        }
      />

      {error && (
        <div className="alert alert--error" role="alert">
          <i className="bi bi-exclamation-triangle" aria-hidden="true" />
          <div>{error}</div>
        </div>
      )}

      <div className="filter-bar is-boxed">
        <div className="filter-fields">
          {isPlatform && (
            <div className="filter-field">
              <label className="form-label" htmlFor="audit-tenant">
                Rumah sakit
              </label>
              <select
                id="audit-tenant"
                className="select"
                value={filters.tenant}
                onChange={(event) => setField("tenant", event.target.value)}
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
            <label className="form-label" htmlFor="audit-actor">
              Aktor
            </label>
            <select
              id="audit-actor"
              className="select"
              value={filters.actor}
              onChange={(event) => setField("actor", event.target.value)}
            >
              <option value="">Semua aktor</option>
              {actorOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.platform ? " · Vendor" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-field">
            <label className="form-label" htmlFor="audit-scope">
              Cakupan
            </label>
            <select
              id="audit-scope"
              className="select"
              value={filters.scope}
              onChange={(event) => setField("scope", event.target.value)}
            >
              {SCOPE_OPTIONS.map(([value, label]) => (
                <option key={value || "all"} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-field">
            <label className="form-label" htmlFor="audit-action">
              Aksi
            </label>
            <select
              id="audit-action"
              className="select"
              value={filters.action}
              onChange={(event) => setField("action", event.target.value)}
            >
              <option value="">Semua aksi</option>
              {actions.map((value) => (
                <option key={value} value={value}>
                  {actionLabel(value)}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-field">
            <label className="form-label" htmlFor="audit-from">
              Dari
            </label>
            <input
              id="audit-from"
              className="input"
              type="date"
              value={filters.from}
              max={filters.to}
              onChange={(event) => setField("from", event.target.value)}
            />
          </div>

          <div className="filter-field">
            <label className="form-label" htmlFor="audit-to">
              Sampai
            </label>
            <input
              id="audit-to"
              className="input"
              type="date"
              value={filters.to}
              min={filters.from}
              max={wibDateString()}
              onChange={(event) => setField("to", event.target.value)}
            />
          </div>

          <div className="filter-field">
            <label className="form-label" htmlFor="audit-q">
              Cari nomor tiket
            </label>
            <input
              id="audit-q"
              className="input"
              value={filters.q}
              placeholder="Contoh: INC-20261102"
              onChange={(event) => setField("q", event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  apply();
                }
              }}
            />
          </div>

          <button
            className="btn btn-outline"
            type="button"
            onClick={apply}
            disabled={loading}
          >
            <i className="bi bi-funnel" aria-hidden="true" />
            Terapkan
          </button>
        </div>

        <span className="list-count">
          {loading ? "Memuat..." : `${data.totalItems} aktivitas`}
        </span>
      </div>

      <div className="list-panel">
        {loading ? (
          <TableSkeleton rows={5} />
        ) : data.items.length === 0 ? (
          <EmptyState
            icon="bi-clipboard-data"
            title="Belum ada aktivitas"
            description={
              isAdmin
                ? "Tidak ada aktivitas yang cocok dengan filter pada rentang ini."
                : "Coba perluas rentang tanggal atau ubah filter."
            }
          />
        ) : (
          <div className="issue-table-wrap">
            <table className="issue-table admin-table">
              <thead>
                <tr>
                  <th className="col-created">Waktu</th>
                  <th>Rumah sakit</th>
                  <th>Aktor</th>
                  <th>Aksi</th>
                  <th>Objek</th>
                  <th className="col-actions" aria-label="Detail" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id} onClick={() => setDetail(item)}>
                    <td className="col-created nowrap">
                      {formatDateTime(item.created)}
                    </td>
                    <td>
                      <span className="admin-name">
                        {item.tenant_name || "—"}
                      </span>
                      <div className="admin-sub">
                        <code>{item.tenant_code || "—"}</code>
                      </div>
                    </td>
                    <td>
                      <span className="admin-name">{actorLabel(item)}</span>
                      <div className="admin-sub">{scopeBadge(item)}</div>
                    </td>
                    <td>
                      <span className="admin-name">
                        {actionLabel(item.action)}
                      </span>
                      <div className="admin-sub">
                        {collectionLabel(item.collection_name)}
                      </div>
                    </td>
                    <td>
                      {item.ticket_no ? (
                        <code>{item.ticket_no}</code>
                      ) : (
                        <span className="muted">
                          {item.record_id || "—"}
                        </span>
                      )}
                    </td>
                    <td className="col-actions">
                      <button
                        className="row-action"
                        type="button"
                        aria-label="Lihat detail audit"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDetail(item);
                        }}
                      >
                        <i className="bi bi-chevron-right" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data.totalPages > 1 && (
        <div className="pagination">
          <span className="pagination-info">
            Menampilkan {(page - 1) * (data.perPage || 25) + 1}–
            {Math.min(page * (data.perPage || 25), data.totalItems)} dari{" "}
            {data.totalItems} aktivitas
          </span>
          <div className="pagination-controls">
            <button
              className="page-btn"
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => goToPage(page - 1)}
              aria-label="Halaman sebelumnya"
            >
              <i className="bi bi-chevron-left" aria-hidden="true" />
            </button>
            <span className="pagination-page">
              Halaman {page} / {Math.max(data.totalPages, 1)}
            </span>
            <button
              className="page-btn"
              type="button"
              disabled={page >= data.totalPages || loading}
              onClick={() => goToPage(page + 1)}
              aria-label="Halaman berikutnya"
            >
              <i className="bi bi-chevron-right" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {detail && (
        <Modal
          title={`${actionLabel(detail.action)} · ${
            detail.ticket_no || collectionLabel(detail.collection_name)
          }`}
          description={formatDateTime(detail.created)}
          onClose={() => setDetail(null)}
          wide
          footer={
            <button
              className="btn btn-subtle"
              type="button"
              onClick={() => setDetail(null)}
            >
              Tutup
            </button>
          }
        >
          <div className="meta-grid meta-grid--3">
            <div className="detail-field">
              <div className="detail-label">Rumah sakit</div>
              <div className="detail-value">
                {detail.tenant_name || "—"}{" "}
                <span className="muted">{detail.tenant_code}</span>
              </div>
            </div>
            <div className="detail-field">
              <div className="detail-label">Aktor</div>
              <div className="detail-value">
                {actorLabel(detail)}{" "}
                <span className="muted">{detail.actor_role || ""}</span>
              </div>
            </div>
            <div className="detail-field">
              <div className="detail-label">Koleksi</div>
              <div className="detail-value">
                {collectionLabel(detail.collection_name)}
              </div>
            </div>
          </div>

          <div className="meta-grid" style={{ marginTop: 16 }}>
            <div className="detail-field">
              <div className="detail-label">Record</div>
              <div className="detail-value">
                <code>{detail.record_id || "—"}</code>
              </div>
            </div>
            <div className="detail-field">
              <div className="detail-label">Tiket</div>
              <div className="detail-value">
                {detail.ticket_no ? (
                  <code>{detail.ticket_no}</code>
                ) : (
                  <span className="muted">—</span>
                )}
              </div>
            </div>
          </div>

          <div className="meta-grid" style={{ marginTop: 16 }}>
            <div className="detail-field">
              <div className="detail-label">IP</div>
              <div className="detail-value">
                <code>{detail.ip || "—"}</code>
              </div>
            </div>
            <div className="detail-field">
              <div className="detail-label">User agent</div>
              <div className="detail-value">
                <span className="muted">{detail.user_agent || "—"}</span>
              </div>
            </div>
          </div>

          <div className="field-row" style={{ marginTop: 16 }}>
            <span className="form-label">Perubahan</span>
            <pre className="audit-changes">
              {JSON.stringify(detail.changes || {}, null, 2)}
            </pre>
          </div>
        </Modal>
      )}
    </>
  );
}
