import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../../../components/ui/PageHeader";
import EmptyState from "../../../components/ui/EmptyState";
import Modal from "../../../components/ui/Modal";
import Pagination from "../../../components/ui/Pagination";
import { TableSkeleton } from "../../../components/ui/Skeleton";
import { pb } from "../../../lib/pocketbase";
import {
  createAsset,
  escapeFilterValue,
  getErrorMessage,
  updateAsset,
} from "../../../lib/api";
import { usePagedList, useDebouncedValue } from "../../../lib/pagedList";
import { useAuth } from "../../../app/providers/AuthProvider";
import { formErrorText, useAppForm } from "../../../lib/formik";
import { formatDate } from "../../../lib/format";

const TYPES = [
  ["workstation", "Workstation"],
  ["printer", "Printer"],
  ["server", "Server"],
  ["network", "Jaringan"],
  ["medical_device", "Alat medis"],
  ["license", "Lisensi"],
];

const STATUSES = [
  ["active", "Aktif"],
  ["maintenance", "Maintenance"],
  ["retired", "Nonaktif"],
];

const CRITICALITIES = [
  ["low", "Rendah"],
  ["medium", "Sedang"],
  ["high", "Tinggi"],
  ["critical", "Kritis"],
];

const TYPE_LABELS = Object.fromEntries(TYPES);
const STATUS_LABELS = Object.fromEntries(STATUSES);
const CRITICALITY_LABELS = Object.fromEntries(CRITICALITIES);

const EMPTY = {
  asset_no: "",
  name: "",
  type: "workstation",
  status: "active",
  criticality: "medium",
  location: "",
  unit: "",
  service: "",
  owner: "",
  warranty_end: "",
  notes: "",
};

function formFromRecord(record) {
  return {
    asset_no: record.asset_no || "",
    name: record.name || "",
    type: record.type || "workstation",
    status: record.status || "active",
    criticality: record.criticality || "medium",
    location: record.location || "",
    unit: record.unit || "",
    service: record.service || "",
    owner: record.owner || "",
    warranty_end: record.warranty_end
      ? String(record.warranty_end).slice(0, 10)
      : "",
    notes: record.notes || "",
  };
}

function statusTone(status) {
  if (status === "active") return "status-resolved";
  if (status === "maintenance") return "status-in_progress";
  return "lozenge--neutral";
}

function AssetForm({
  modal,
  services,
  units,
  people,
  onClose,
  onSaved,
}) {
  const formik = useAppForm({
    initialValues: modal.record ? formFromRecord(modal.record) : { ...EMPTY },
    validate: (values) => {
      const errors = {};
      if (values.name.trim().length < 2) {
        errors.name = "Nama aset minimal 2 karakter.";
      }
      return errors;
    },
    onSubmit: async (values, helpers) => {
      helpers.setStatus("");

      const payload = {
        asset_no: values.asset_no.trim(),
        name: values.name.trim(),
        type: values.type,
        status: values.status,
        criticality: values.criticality,
        location: values.location.trim(),
        unit: values.unit,
        service: values.service,
        owner: values.owner,
        warranty_end: values.warranty_end,
        notes: values.notes.trim(),
      };

      try {
        if (modal.record) {
          await updateAsset(modal.record.id, payload);
          onSaved("Aset diperbarui.");
        } else {
          await createAsset(payload);
          onSaved("Aset ditambahkan.");
        }
        onClose();
      } catch (err) {
        helpers.setStatus(getErrorMessage(err));
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  const formError = formErrorText(formik);

  return (
    <Modal
      title={modal.record ? `Edit ${modal.record.name}` : "Tambah aset"}
      description="Aset/CI menghubungkan tiket dengan komponen yang terdampak. Nomor aset boleh dikosongkan agar dibuat otomatis."
      onClose={() => (formik.isSubmitting ? null : onClose())}
      wide
      footer={
        <>
          <button
            className="btn btn-subtle"
            type="button"
            onClick={onClose}
            disabled={formik.isSubmitting}
          >
            Batal
          </button>
          <button
            className="btn btn-primary"
            type="submit"
            form="asset-form"
            disabled={formik.isSubmitting}
          >
            {formik.isSubmitting ? "Menyimpan..." : "Simpan aset"}
          </button>
        </>
      }
    >
      <form id="asset-form" className="admin-form" onSubmit={formik.handleSubmit}>
        {formError && (
          <div className="alert alert--error" role="alert">
            <i className="bi bi-exclamation-triangle" aria-hidden="true" />
            <div>{formError}</div>
          </div>
        )}

        <div className="form-grid">
          <div>
            <label className="form-label" htmlFor="asset-name">
              Nama aset <span className="req">*</span>
            </label>
            <input
              id="asset-name"
              className="input"
              maxLength={160}
              placeholder="Contoh: Workstation pendaftaran 01"
              {...formik.getFieldProps("name")}
              required
            />
          </div>

          <div>
            <label className="form-label" htmlFor="asset-no">
              Nomor aset
            </label>
            <input
              id="asset-no"
              className="input"
              maxLength={32}
              placeholder="Otomatis bila kosong"
              {...formik.getFieldProps("asset_no")}
            />
          </div>
        </div>

        <div className="form-grid" style={{ marginTop: 16 }}>
          <div>
            <label className="form-label" htmlFor="asset-type">
              Tipe
            </label>
            <select
              id="asset-type"
              className="select"
              {...formik.getFieldProps("type")}
            >
              {TYPES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label" htmlFor="asset-status">
              Status
            </label>
            <select
              id="asset-status"
              className="select"
              {...formik.getFieldProps("status")}
            >
              {STATUSES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label" htmlFor="asset-criticality">
              Criticality
            </label>
            <select
              id="asset-criticality"
              className="select"
              {...formik.getFieldProps("criticality")}
            >
              {CRITICALITIES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-grid" style={{ marginTop: 16 }}>
          <div>
            <label className="form-label" htmlFor="asset-location">
              Lokasi
            </label>
            <input
              id="asset-location"
              className="input"
              maxLength={120}
              placeholder="Contoh: Gedung A / Pendaftaran"
              {...formik.getFieldProps("location")}
            />
          </div>

          <div>
            <label className="form-label" htmlFor="asset-warranty">
              Garansi sampai
            </label>
            <input
              id="asset-warranty"
              className="input"
              type="date"
              {...formik.getFieldProps("warranty_end")}
            />
          </div>
        </div>

        <div className="form-grid" style={{ marginTop: 16 }}>
          <div>
            <label className="form-label" htmlFor="asset-unit">
              Unit
            </label>
            <select
              id="asset-unit"
              className="select"
              {...formik.getFieldProps("unit")}
            >
              <option value="">Tanpa unit</option>
              {units.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label" htmlFor="asset-service">
              Layanan utama
            </label>
            <select
              id="asset-service"
              className="select"
              {...formik.getFieldProps("service")}
            >
              <option value="">Tanpa layanan</option>
              {services.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label" htmlFor="asset-owner">
              Penanggung jawab
            </label>
            <select
              id="asset-owner"
              className="select"
              {...formik.getFieldProps("owner")}
            >
              <option value="">Tanpa penanggung jawab</option>
              {people.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field-row" style={{ marginTop: 16 }}>
          <label className="form-label" htmlFor="asset-notes">
            Catatan
          </label>
          <textarea
            id="asset-notes"
            className="textarea"
            rows={3}
            maxLength={5000}
            placeholder="Konfigurasi, nomor inventaris, atau catatan pemeliharaan."
            {...formik.getFieldProps("notes")}
          />
        </div>
      </form>
    </Modal>
  );
}

export default function AssetsPage() {
  const { user } = useAuth();
  const [services, setServices] = useState([]);
  const [units, setUnits] = useState([]);
  const [people, setPeople] = useState([]);
  const [counts, setCounts] = useState({
    total: 0,
    active: 0,
    maintenance: 0,
    retired: 0,
  });
  const [optionsError, setOptionsError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modal, setModal] = useState(null);

  const tenant = user.tenant;
  const debouncedQuery = useDebouncedValue(query, 350);

  const filter = useMemo(() => {
    const parts = [`tenant = "${tenant}"`];
    const needle = debouncedQuery.trim();

    if (needle) {
      const value = escapeFilterValue(needle);
      parts.push(
        `(name ~ "${value}" || asset_no ~ "${value}" || location ~ "${value}")`
      );
    }

    if (typeFilter) parts.push(`type = "${escapeFilterValue(typeFilter)}"`);
    if (statusFilter) {
      parts.push(`status = "${escapeFilterValue(statusFilter)}"`);
    }

    return parts.join(" && ");
  }, [tenant, debouncedQuery, statusFilter, typeFilter]);

  const list = usePagedList({
    collection: "assets",
    filter,
    sort: "name",
    expand: "service,unit,owner",
  });
  const { setPage } = list;

  // Filter atau pencarian berubah -> kembali ke halaman pertama.
  useEffect(() => {
    setPage(1);
  }, [filter, setPage]);

  const loadOptions = useCallback(async () => {
    setOptionsError("");

    try {
      const [serviceList, unitList, peopleList] = await Promise.all([
        pb.collection("services").getFullList({
          filter: `tenant = "${tenant}" && is_active = true`,
          sort: "name",
        }),
        pb.collection("units").getFullList({
          filter: `tenant = "${tenant}" && is_active = true`,
          sort: "name",
        }),
        pb.collection("users").getFullList({
          filter: `tenant = "${tenant}" && is_active = true`,
          sort: "name",
        }),
      ]);

      setServices(serviceList);
      setUnits(unitList);
      setPeople(peopleList);
    } catch (err) {
      setOptionsError(getErrorMessage(err));
    }
  }, [tenant]);

  // Ringkasan dihitung di server agar tetap benar saat daftar dibagi per halaman.
  const loadCounts = useCallback(async () => {
    const base = `tenant = "${tenant}"`;

    try {
      const [total, active, maintenance, retired] = await Promise.all([
        pb.collection("assets").getList(1, 1, { filter: base, fields: "id" }),
        pb
          .collection("assets")
          .getList(1, 1, { filter: `${base} && status = "active"`, fields: "id" }),
        pb
          .collection("assets")
          .getList(1, 1, { filter: `${base} && status = "maintenance"`, fields: "id" }),
        pb
          .collection("assets")
          .getList(1, 1, { filter: `${base} && status = "retired"`, fields: "id" }),
      ]);

      setCounts({
        total: total.totalItems,
        active: active.totalItems,
        maintenance: maintenance.totalItems,
        retired: retired.totalItems,
      });
    } catch (err) {
      setOptionsError(getErrorMessage(err));
    }
  }, [tenant]);

  useEffect(() => {
    document.title = "Aset & CI · Healthcare ITSM";
    loadOptions();
    loadCounts();
  }, [loadOptions, loadCounts]);

  const error = optionsError || list.error;
  const hasFilters = Boolean(debouncedQuery.trim() || typeFilter || statusFilter);

  function saved(message) {
    setNotice(message);
    setModal(null);
    loadOptions();
    loadCounts();
    list.reload();
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Ruang kerja" }, { label: "Aset & CI" }]}
        title="Aset & CI"
        description="Register perangkat, server, jaringan, dan lisensi. Aset dapat ditautkan ke tiket dan layanan agar dampak insiden terlihat."
        actions={
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setModal({ record: null })}
          >
            <i className="bi bi-plus-lg" aria-hidden="true" />
            Tambah aset
          </button>
        }
      />

      {error && (
        <div className="alert alert--error" role="alert">
          <i className="bi bi-exclamation-triangle" aria-hidden="true" />
          <div>{error}</div>
        </div>
      )}

      {notice && (
        <div className="alert alert--success" role="status">
          <i className="bi bi-check-circle" aria-hidden="true" />
          <div>{notice}</div>
        </div>
      )}

      <div className="problem-kpis">
        <div className="problem-kpi">
          <span>Total aset</span>
          <strong>{counts.total}</strong>
        </div>
        <div className="problem-kpi">
          <span>Aktif</span>
          <strong>{counts.active}</strong>
        </div>
        <div className="problem-kpi">
          <span>Maintenance</span>
          <strong>{counts.maintenance}</strong>
        </div>
        <div className="problem-kpi">
          <span>Nonaktif</span>
          <strong>{counts.retired}</strong>
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-box">
          <i className="bi bi-search" aria-hidden="true" />
          <input
            className="input"
            type="search"
            placeholder="Cari nama, nomor aset, atau lokasi..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Cari aset"
          />
        </div>
        <select
          className="select toolbar-select"
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value)}
          aria-label="Filter tipe aset"
        >
          <option value="">Semua tipe</option>
          {TYPES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          className="select toolbar-select"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          aria-label="Filter status aset"
        >
          <option value="">Semua status</option>
          {STATUSES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <span className="list-count">{list.totalItems} aset</span>
      </div>

      <div className="list-panel">
        {list.loading ? (
          <TableSkeleton rows={5} />
        ) : list.items.length === 0 ? (
          <EmptyState
            icon="bi-hdd-stack"
            title={hasFilters ? "Tidak ada aset yang cocok" : "Belum ada aset"}
            description={
              hasFilters
                ? "Ubah kata kunci atau filter untuk melihat aset lain."
                : "Tambahkan perangkat atau layanan TI agar tiket dapat menunjukkan komponen yang terdampak."
            }
            action={
              hasFilters ? (
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setTypeFilter("");
                    setStatusFilter("");
                  }}
                >
                  Reset filter
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => setModal({ record: null })}
                >
                  Tambah aset
                </button>
              )
            }
          />
        ) : (
          <>
            <div className="issue-table-wrap">
              <table className="issue-table admin-table admin-table--fit">
                <thead>
                  <tr>
                    <th>Aset</th>
                    <th className="is-hide-sm">Tipe</th>
                    <th className="col-status">Status</th>
                    <th className="is-hide-sm">Layanan</th>
                    <th className="is-hide-sm">Lokasi</th>
                    <th className="col-updated is-hide-sm">Garansi</th>
                    <th className="col-actions">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {list.items.map((asset) => (
                    <tr key={asset.id}>
                      <td>
                        <Link className="issue-link" to={`/assets/${asset.id}`}>
                          <span className="issue-key">{asset.asset_no}</span>
                          <span className="issue-summary">{asset.name}</span>
                        </Link>
                        <div className="admin-sub">
                          {CRITICALITY_LABELS[asset.criticality] ||
                            asset.criticality}
                        </div>
                      </td>
                      <td className="is-hide-sm">
                        {TYPE_LABELS[asset.type] || asset.type}
                      </td>
                      <td className="col-status">
                        <span className={`lozenge ${statusTone(asset.status)}`}>
                          {STATUS_LABELS[asset.status] || asset.status}
                        </span>
                      </td>
                      <td className="is-hide-sm">
                        {asset.expand?.service?.name || "—"}
                      </td>
                      <td className="is-hide-sm">{asset.location || "—"}</td>
                      <td className="col-date is-hide-sm">
                        {formatDate(asset.warranty_end)}
                      </td>
                      <td className="col-actions">
                        <button
                          className="btn btn-subtle btn-sm"
                          type="button"
                          onClick={() => setModal({ record: asset })}
                        >
                          <i className="bi bi-pencil" aria-hidden="true" />
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={list.page}
              perPage={list.perPage}
              totalItems={list.totalItems}
              totalPages={list.totalPages}
              onPageChange={list.setPage}
              onPerPageChange={list.setPerPage}
              label="aset"
            />
          </>
        )}
      </div>

      {modal && (
        <AssetForm
          modal={modal}
          services={services}
          units={units}
          people={people}
          onClose={() => setModal(null)}
          onSaved={saved}
        />
      )}
    </>
  );
}
