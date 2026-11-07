import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PageHeader from "../../../components/ui/PageHeader";
import EmptyState from "../../../components/ui/EmptyState";
import { fetchAsset, getErrorMessage } from "../../../lib/api";
import {
  formatDate,
  formatDateTime,
  priorityLabel,
  statusLabel,
  typeLabel,
} from "../../../lib/format";

const TYPE_LABELS = {
  workstation: "Workstation",
  printer: "Printer",
  server: "Server",
  network: "Jaringan",
  medical_device: "Alat medis",
  license: "Lisensi",
};

const STATUS_LABELS = {
  active: "Aktif",
  maintenance: "Maintenance",
  retired: "Nonaktif",
};

const CRITICALITY_LABELS = {
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
  critical: "Kritis",
};

const RELATION_LABELS = {
  affected: "Terdampak",
  caused: "Penyebab",
  related: "Terkait",
};

function statusTone(status) {
  if (status === "active") return "status-resolved";
  if (status === "maintenance") return "status-in_progress";
  return "lozenge--neutral";
}

function InfoField({ label, value }) {
  return (
    <div className="detail-field">
      <div className="detail-label">{label}</div>
      <div className="detail-value">{value || "—"}</div>
    </div>
  );
}

export default function AssetDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await fetchAsset(id);
      setData(result);
      document.title = `${result.asset.asset_no} · Aset · Healthcare ITSM`;
    } catch (err) {
      setError(getErrorMessage(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="page-state">
        <span className="spinner spinner--dark spinner--lg" role="status" />
        <div className="centered-text">Memuat aset...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="list-panel">
        <EmptyState
          icon="bi-hdd-stack"
          title="Aset tidak ditemukan"
          description={error || "Aset ini tidak tersedia untuk rumah sakit Anda."}
          action={
            <Link className="btn btn-primary" to="/assets">
              Kembali ke daftar aset
            </Link>
          }
        />
      </div>
    );
  }

  const { asset, services, tickets, counts } = data;

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Ruang kerja" },
          { label: "Aset & CI", to: "/assets" },
          { label: asset.asset_no },
        ]}
        title={asset.name}
        description={`${TYPE_LABELS[asset.type] || asset.type} · ${asset.asset_no} · ${asset.location || "Lokasi belum diisi"}`}
        actions={
          <Link className="btn btn-outline" to="/assets">
            <i className="bi bi-arrow-left" aria-hidden="true" />
            Daftar aset
          </Link>
        }
      />

      {error && (
        <div className="alert alert--error" role="alert">
          <i className="bi bi-exclamation-triangle" aria-hidden="true" />
          <div>{error}</div>
        </div>
      )}

      <div className="problem-kpis">
        <div className="problem-kpi">
          <span>Status</span>
          <strong>
            <span className={`lozenge ${statusTone(asset.status)}`}>
              {STATUS_LABELS[asset.status] || asset.status}
            </span>
          </strong>
        </div>
        <div className="problem-kpi">
          <span>Criticality</span>
          <strong>{CRITICALITY_LABELS[asset.criticality] || asset.criticality}</strong>
        </div>
        <div className="problem-kpi">
          <span>Riwayat tiket</span>
          <strong>{counts.tickets}</strong>
        </div>
        <div className="problem-kpi">
          <span>Tiket aktif</span>
          <strong>{counts.open_tickets}</strong>
        </div>
      </div>

      <div className="detail-grid">
        <section className="panel">
          <div className="panel-head">
            <div className="panel-title">
              <i className="bi bi-info-circle" aria-hidden="true" />
              Informasi aset
            </div>
          </div>
          <div className="panel-body">
            <div className="meta-grid">
              <InfoField label="Nomor aset" value={asset.asset_no} />
              <InfoField
                label="Tipe"
                value={TYPE_LABELS[asset.type] || asset.type}
              />
              <InfoField label="Lokasi" value={asset.location} />
              <InfoField label="Garansi sampai" value={formatDate(asset.warranty_end)} />
              <InfoField label="Unit" value={asset.unit_name} />
              <InfoField label="Layanan utama" value={asset.service_name} />
              <InfoField label="Penanggung jawab" value={asset.owner_name} />
            </div>

            <div className="field-row" style={{ marginTop: 16 }}>
              <span className="form-label">Catatan</span>
              <div className="rich-text rich-text--plain">
                {asset.notes || "Belum ada catatan."}
              </div>
            </div>
          </div>
        </section>

        <aside className="detail-side">
          <section className="panel">
            <div className="panel-head">
              <div className="panel-title">
                <i className="bi bi-diagram-3" aria-hidden="true" />
                Service CI
              </div>
              <span className="panel-count">{services.length} layanan</span>
            </div>
            <div className="panel-body">
              {services.length === 0 ? (
                <div className="report-empty">
                  Aset belum ditautkan ke layanan. Isi layanan utama saat
                  mengedit aset.
                </div>
              ) : (
                <ul className="asset-service-list">
                  {services.map((item) => (
                    <li key={item.id}>
                      <span>{item.service_name || item.service}</span>
                      <span className="admin-sub">
                        {CRITICALITY_LABELS[item.criticality] || item.criticality}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </aside>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div className="panel-title">
            <i className="bi bi-clock-history" aria-hidden="true" />
            Riwayat tiket
          </div>
          <span className="panel-count">{tickets.length} tiket</span>
        </div>
        <div className="panel-body">
          {tickets.length === 0 ? (
            <div className="report-empty">
              Belum ada tiket yang tertaut ke aset ini.
            </div>
          ) : (
            <div className="issue-table-wrap">
              <table className="issue-table admin-table">
                <thead>
                  <tr>
                    <th>Tiket</th>
                    <th>Jenis</th>
                    <th className="col-status">Status</th>
                    <th>Prioritas</th>
                    <th>Relasi</th>
                    <th className="col-updated">Dibuat</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket) => (
                    <tr key={ticket.id}>
                      <td>
                        <Link className="issue-link" to={`/tickets/${ticket.id}`}>
                          <span className="issue-key">{ticket.ticket_no}</span>
                          <span className="issue-summary">{ticket.title}</span>
                        </Link>
                      </td>
                      <td>{typeLabel(ticket.type)}</td>
                      <td className="col-status">
                        <span className="lozenge lozenge--neutral">
                          {statusLabel(ticket.status)}
                        </span>
                      </td>
                      <td>{priorityLabel(ticket.priority)}</td>
                      <td>{RELATION_LABELS[ticket.relation] || ticket.relation}</td>
                      <td
                        className="col-updated nowrap"
                        title={formatDateTime(ticket.created)}
                      >
                        {formatDate(ticket.created)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
