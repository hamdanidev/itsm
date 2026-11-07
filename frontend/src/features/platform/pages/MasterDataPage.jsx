import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import PageHeader from "../../../components/ui/PageHeader";
import EmptyState from "../../../components/ui/EmptyState";
import Modal from "../../../components/ui/Modal";
import { useAuth } from "../../../app/providers/AuthProvider";
import { useTenant } from "../../../app/providers/TenantProvider";
import { formatDate } from "../../../lib/format";
import { isPlatformAdmin, tenantRoleLabel } from "../../../lib/permissions";
import { formErrorText, useAppForm } from "../../../lib/formik";
import {
  createTenantMaster,
  fetchTenantMaster,
  getErrorMessage,
  updateTenantMaster,
} from "../../../lib/api";

const TABS = [
  { key: "units", label: "Unit" },
  { key: "categories", label: "Kategori" },
  { key: "policies", label: "Kebijakan SLA" },
  { key: "holidays", label: "Hari libur" },
];

const TYPE_RANK = { incident: 0, service_request: 1, change_request: 2 };
const PRIORITY_RANK = { critical: 0, high: 1, normal: 2, low: 3 };

const EMPTY_FORM = {
  units: { name: "", code: "", kind: "clinical", manager: "", is_active: true },
  categories: { name: "", code: "", kind: "all", is_active: true },
  policies: {
    name: "",
    ticket_type: "incident",
    priority: "normal",
    response_minutes: 120,
    approval_minutes: 0,
    resolution_minutes: 960,
    calendar_mode: "business_hours",
    business_days: [1, 2, 3, 4, 5],
    business_start: "08:00",
    business_end: "17:00",
    version: 1,
    is_active: true,
  },
  holidays: { date: "", name: "", is_active: true },
};

const KIND_LABELS = {
  units: { singular: "unit", plural: "Unit" },
  categories: { singular: "kategori", plural: "Kategori" },
  policies: { singular: "kebijakan SLA", plural: "Kebijakan SLA" },
  holidays: { singular: "hari libur", plural: "Hari libur" },
};

function formFromRecord(kind, record) {
  const base = {
    name: record.name || "",
    is_active: Boolean(record.is_active),
  };

  if (kind === "units") {
    return {
      ...base,
      code: record.code || "",
      kind: record.kind || "clinical",
      manager: record.manager || "",
    };
  }

  if (kind === "categories") {
    return { ...base, code: record.code || "", kind: record.kind || "all" };
  }

  if (kind === "policies") {
    return {
      ...base,
      ticket_type: record.ticket_type || "incident",
      priority: record.priority || "normal",
      response_minutes: Number(record.response_minutes) || 0,
      approval_minutes: Number(record.approval_minutes) || 0,
      resolution_minutes: Number(record.resolution_minutes) || 0,
      calendar_mode: record.calendar_mode || "business_hours",
      business_days: Array.isArray(record.business_days)
        ? record.business_days
        : [1, 2, 3, 4, 5],
      business_start: record.business_start || "08:00",
      business_end: record.business_end || "17:00",
      version: Number(record.version) || 1,
    };
  }

  return { ...base, date: String(record.date || "").slice(0, 10) };
}

function sortPolicies(items) {
  return [...items].sort(
    (a, b) =>
      (TYPE_RANK[a.ticket_type] ?? 9) - (TYPE_RANK[b.ticket_type] ?? 9) ||
      (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)
  );
}

function ActiveLozenge({ active }) {
  return (
    <span
      className={`lozenge ${active ? "status-resolved" : "lozenge--neutral"}`}
    >
      {active ? "Aktif" : "Nonaktif"}
    </span>
  );
}

function formatMinutes(value) {
  const minutes = Number(value) || 0;
  if (minutes <= 0) return "—";
  if (minutes < 60) return `${minutes} mnt`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} jam`;
}

export default function MasterDataPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { isPlatformScope, activeTenantId, setActiveTenant, tenants } = useTenant();
  const navigate = useNavigate();
  const canManage = isPlatformAdmin(user);

  const [data, setData] = useState(null);
  const [tab, setTab] = useState("units");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [modal, setModal] = useState(null);
  const [busyId, setBusyId] = useState("");

  const formInitialValues = useMemo(() => {
    if (modal?.record) return formFromRecord(modal.tab, modal.record);
    return { ...EMPTY_FORM[modal?.tab || tab] };
  }, [modal?.record?.id, modal?.tab, tab]);

  const formik = useAppForm({
    enableReinitialize: true,
    initialValues: formInitialValues,
    onSubmit: async (values, helpers) => {
      helpers.setStatus("");

      const payload = { ...values };

      if (modal.tab === "units" || modal.tab === "categories") {
        payload.code = String(values.code || "").trim().toUpperCase();
      }
      if (modal.tab === "policies") {
        payload.response_minutes = Number(values.response_minutes);
        payload.approval_minutes = Number(values.approval_minutes);
        payload.resolution_minutes = Number(values.resolution_minutes);
        payload.version = Number(values.version);
        payload.business_days = values.business_days;
      }

      try {
        if (modal.record) {
          await updateTenantMaster(id, modal.tab, modal.record.id, payload);
        } else {
          await createTenantMaster(id, modal.tab, payload);
        }

        setModal(null);
        setNotice(
          modal.record ? "Perubahan disimpan." : "Data baru ditambahkan."
        );
        formik.resetForm();
        await load();
      } catch (err) {
        helpers.setStatus(getErrorMessage(err));
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  const form = formik.values;
  const formError = formErrorText(formik);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      setData(await fetchTenantMaster(id));
    } catch (err) {
      setError(getErrorMessage(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    document.title = "Data master · Konsol Vendor";
    load();
  }, [load]);

  // Halaman ini terikat ke satu rumah sakit. Selaraskan pemilih tenant sekali
  // per rumah sakit agar sidebar dan judul tidak menunjuk RS yang berbeda.
  const syncedTenantRef = useRef("");

  useEffect(() => {
    if (!isPlatformScope || !data) return;
    if (!tenants.length) return;

    const tenantId = String(data.tenant.id || "");
    if (!tenantId || syncedTenantRef.current === tenantId) return;

    syncedTenantRef.current = tenantId;

    if (tenantId !== activeTenantId) setActiveTenant(tenantId);
  }, [isPlatformScope, data, tenants, activeTenantId, setActiveTenant]);

  const items = useMemo(() => {
    if (!data) return [];
    if (tab === "policies") return sortPolicies(data.policies || []);
    return data[tab] || [];
  }, [data, tab]);

  function setField(key, value) {
    formik.setFieldValue(key, value);
  }

  function openCreate() {
    formik.setStatus("");
    setModal({ tab, record: null });
  }

  function openEdit(record) {
    formik.setStatus("");
    setModal({ tab, record });
  }

  async function toggleActive(record) {
    setBusyId(record.id);
    setError("");

    try {
      await updateTenantMaster(id, tab, record.id, {
        is_active: !record.is_active,
      });
      setNotice(
        `${record.name} ${record.is_active ? "dinonaktifkan" : "diaktifkan"}.`
      );
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId("");
    }
  }

  function toggleDay(day) {
    const days = form.business_days.includes(day)
      ? form.business_days.filter((value) => value !== day)
      : [...form.business_days, day].sort((a, b) => a - b);

    formik.setFieldValue("business_days", days);
  }

  if (loading && !data) {
    return (
      <div className="page-state">
        <span className="spinner spinner--dark spinner--lg" role="status" />
        <div className="centered-text">Memuat data master...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <>
        <PageHeader
          breadcrumb={[
            { label: "Konsol Vendor", to: "/platform" },
            { label: "Data master" },
          ]}
          title="Data master"
        />
        <div className="alert alert--error" role="alert">
          <i className="bi bi-exclamation-triangle" aria-hidden="true" />
          <div>{error || "Rumah sakit tidak ditemukan."}</div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Konsol Vendor", to: "/platform" },
          { label: data.tenant.name },
          { label: "Data master" },
        ]}
        title={`Data master ${data.tenant.name}`}
        description={`Kode ${data.tenant.code} · Unit, kategori, kebijakan SLA, dan hari libur yang dipakai tiket rumah sakit ini.`}
        actions={
          <>
            <Link className="btn btn-subtle" to="/platform">
              <i className="bi bi-arrow-left" aria-hidden="true" />
              Konsol Vendor
            </Link>
            {canManage && (
              <button className="btn btn-primary" type="button" onClick={openCreate}>
                <i className="bi bi-plus-lg" aria-hidden="true" />
                Tambah {KIND_LABELS[tab].singular}
              </button>
            )}
          </>
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

      <div className="tabs" role="tablist" aria-label="Jenis data master">
        {TABS.map((item) => (
          <button
            key={item.key}
            className={`tab${tab === item.key ? " is-active" : ""}`}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => {
              setTab(item.key);
              setNotice("");
            }}
          >
            {item.label}
            <span className="tab-count">
              {(data[item.key] || []).length}
            </span>
          </button>
        ))}
      </div>

      <div className="list-panel admin-panel">
        {items.length === 0 ? (
          <EmptyState
            icon="bi-sliders"
            title={`Belum ada ${KIND_LABELS[tab].singular}`}
            description="Tambahkan data pertama agar dapat dipakai pada tiket baru."
            action={
              canManage ? (
                <button className="btn btn-primary" type="button" onClick={openCreate}>
                  <i className="bi bi-plus-lg" aria-hidden="true" />
                  Tambah {KIND_LABELS[tab].singular}
                </button>
              ) : null
            }
          />
        ) : (
          <div className="issue-table-wrap">
            <table className="issue-table admin-table">
              <thead>{renderHead(tab)}</thead>
              <tbody>
                {items.map((record) => (
                  <tr
                    key={record.id}
                    className={record.is_active ? "" : "is-inactive"}
                  >
                    {renderCells(tab, record, data)}
                    <td className="col-actions">
                      {canManage ? (
                        <div className="admin-actions">
                          <button
                            className="btn btn-subtle btn-sm"
                            type="button"
                            onClick={() => openEdit(record)}
                          >
                            <i className="bi bi-pencil" aria-hidden="true" />
                            Edit
                          </button>
                          <button
                            className="btn btn-subtle btn-sm"
                            type="button"
                            disabled={busyId === record.id}
                            onClick={() => toggleActive(record)}
                          >
                            {busyId === record.id ? (
                              <span
                                className="spinner spinner--dark"
                                aria-hidden="true"
                              />
                            ) : (
                              <i
                                className={`bi ${
                                  record.is_active
                                    ? "bi-pause-circle"
                                    : "bi-play-circle"
                                }`}
                                aria-hidden="true"
                              />
                            )}
                            {record.is_active ? "Nonaktifkan" : "Aktifkan"}
                          </button>
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="admin-note">
        <i className="bi bi-info-circle" aria-hidden="true" />
        Data master tidak dihapus permanen. Nonaktifkan agar riwayat tiket lama
        tetap valid. Perubahan berlaku untuk tiket baru.
      </p>

      {modal && (
        <Modal
          title={`${modal.record ? "Edit" : "Tambah"} ${KIND_LABELS[modal.tab].singular}`}
          description={`Berlaku untuk ${data.tenant.name}.`}
          onClose={() => (formik.isSubmitting ? null : setModal(null))}
          wide={modal.tab === "policies"}
          footer={
            <>
              <button
                className="btn btn-subtle"
                type="button"
                onClick={() => setModal(null)}
                disabled={formik.isSubmitting}
              >
                Batal
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                form="master-form"
                disabled={formik.isSubmitting}
              >
                {formik.isSubmitting ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    Menyimpan...
                  </>
                ) : (
                  "Simpan"
                )}
              </button>
            </>
          }
        >
          <form
            id="master-form"
            className="admin-form"
            onSubmit={formik.handleSubmit}
          >
            {formError && (
              <div className="alert alert--error" role="alert">
                <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                <div>{formError}</div>
              </div>
            )}

            {renderForm(modal.tab, form, data, setField, toggleDay)}
          </form>
        </Modal>
      )}
    </>
  );
}

function renderHead(kind) {
  if (kind === "units") {
    return (
      <tr>
        <th>Nama unit</th>
        <th className="col-code">Kode</th>
        <th>Jenis</th>
        <th>Manajer</th>
        <th className="col-status">Status</th>
        <th className="col-actions">Aksi</th>
      </tr>
    );
  }

  if (kind === "categories") {
    return (
      <tr>
        <th>Nama kategori</th>
        <th className="col-code">Kode</th>
        <th>Jenis tiket</th>
        <th className="col-status">Status</th>
        <th className="col-actions">Aksi</th>
      </tr>
    );
  }

  if (kind === "policies") {
    return (
      <tr>
        <th>Kebijakan</th>
        <th>Tipe</th>
        <th>Prioritas</th>
        <th className="col-num">Respons</th>
        <th className="col-num">Approval</th>
        <th className="col-num">Penyelesaian</th>
        <th>Kalender</th>
        <th className="col-status">Status</th>
        <th className="col-actions">Aksi</th>
      </tr>
    );
  }

  return (
    <tr>
      <th>Tanggal</th>
      <th>Nama</th>
      <th className="col-status">Status</th>
      <th className="col-actions">Aksi</th>
    </tr>
  );
}

function renderCells(kind, record, data) {
  if (kind === "units") {
    const manager = (data.users || []).find((item) => item.id === record.manager);

    return (
      <>
        <td>
          <span className="admin-name">{record.name}</span>
        </td>
        <td className="col-code">
          <code>{record.code}</code>
        </td>
        <td>
          {data.options.unit_kinds.includes(record.kind)
            ? {
                clinical: "Klinis",
                support: "Penunjang",
                management: "Manajemen",
              }[record.kind]
            : record.kind}
        </td>
        <td>
          {manager?.name || <span className="muted">Belum ada</span>}
        </td>
        <td className="col-status">
          <ActiveLozenge active={record.is_active} />
        </td>
      </>
    );
  }

  if (kind === "categories") {
    return (
      <>
        <td>
          <span className="admin-name">{record.name}</span>
        </td>
        <td className="col-code">
          <code>{record.code}</code>
        </td>
        <td>
          {{
            all: "Semua tipe",
            incident: "Incident",
            service_request: "Service Request",
            change_request: "Change Request",
          }[record.kind] || record.kind}
        </td>
        <td className="col-status">
          <ActiveLozenge active={record.is_active} />
        </td>
      </>
    );
  }

  if (kind === "policies") {
    return (
      <>
        <td>
          <span className="admin-name">{record.name}</span>
          <div className="admin-sub">versi {record.version}</div>
        </td>
        <td>
          {
            {
              incident: "Incident",
              service_request: "Service Request",
              change_request: "Change Request",
            }[record.ticket_type]
          }
        </td>
        <td>
          {
            {
              critical: "Kritis",
              high: "Tinggi",
              normal: "Normal",
              low: "Rendah",
            }[record.priority]
          }
        </td>
        <td className="col-num">{formatMinutes(record.response_minutes)}</td>
        <td className="col-num">{formatMinutes(record.approval_minutes)}</td>
        <td className="col-num">{formatMinutes(record.resolution_minutes)}</td>
        <td>
          {record.calendar_mode === "24x7" ? "24x7" : "Jam kerja"}
        </td>
        <td className="col-status">
          <ActiveLozenge active={record.is_active} />
        </td>
      </>
    );
  }

  return (
    <>
      <td className="nowrap">{record.date || "—"}</td>
      <td>
        <span className="admin-name">{record.name}</span>
      </td>
      <td className="col-status">
        <ActiveLozenge active={record.is_active} />
      </td>
    </>
  );
}

function renderForm(kind, form, data, setField, toggleDay) {
  if (kind === "units" || kind === "categories") {
    const isUnit = kind === "units";
    const kinds = isUnit ? data.options.unit_kinds : data.options.category_kinds;
    const kindLabels = isUnit
      ? { clinical: "Klinis", support: "Penunjang", management: "Manajemen" }
      : {
          all: "Semua tipe",
          incident: "Incident",
          service_request: "Service Request",
          change_request: "Change Request",
        };

    return (
      <>
        <div className="field-row">
          <label className="form-label" htmlFor="master-name">
            Nama <span className="req">*</span>
          </label>
          <input
            id="master-name"
            className="input"
            value={form.name}
            onChange={(event) => setField("name", event.target.value)}
            maxLength={120}
            required
          />
        </div>

        <div className="form-grid" style={{ marginTop: 16 }}>
          <div>
            <label className="form-label" htmlFor="master-code">
              Kode <span className="req">*</span>
            </label>
            <input
              id="master-code"
              className="input"
              value={form.code}
              onChange={(event) => setField("code", event.target.value)}
              maxLength={20}
              placeholder="Contoh: IGD"
              required
            />
            <div className="hint">Unik per rumah sakit, otomatis huruf besar.</div>
          </div>

          <div>
            <label className="form-label" htmlFor="master-kind">
              {isUnit ? "Jenis unit" : "Jenis tiket"}
            </label>
            <select
              id="master-kind"
              className="select"
              value={form.kind}
              onChange={(event) => setField("kind", event.target.value)}
            >
              {kinds.map((value) => (
                <option key={value} value={value}>
                  {kindLabels[value] || value}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isUnit && (
          <div className="field-row" style={{ marginTop: 16 }}>
            <label className="form-label" htmlFor="master-manager">
              Manajer unit
            </label>
            <select
              id="master-manager"
              className="select"
              value={form.manager}
              onChange={(event) => setField("manager", event.target.value)}
            >
              <option value="">Belum ditentukan</option>
              {(data.users || [])
                .filter((item) => item.is_active)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {tenantRoleLabel(item.role)}
                  </option>
                ))}
            </select>
            <div className="hint">
              Approver tahap pertama untuk tiket unit ini. Bila kosong, approval
              langsung ke Kepala IT.
            </div>
          </div>
        )}

        <label className="checkline" style={{ marginTop: 16 }}>
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(event) => setField("is_active", event.target.checked)}
          />
          <span>Aktif</span>
        </label>
      </>
    );
  }

  if (kind === "policies") {
    return (
      <>
        <div className="field-row">
          <label className="form-label" htmlFor="master-name">
            Nama kebijakan <span className="req">*</span>
          </label>
          <input
            id="master-name"
            className="input"
            value={form.name}
            onChange={(event) => setField("name", event.target.value)}
            maxLength={120}
            placeholder="Contoh: Incident normal - jam kerja"
            required
          />
        </div>

        <div className="form-grid" style={{ marginTop: 16 }}>
          <div>
            <label className="form-label" htmlFor="master-type">
              Tipe tiket <span className="req">*</span>
            </label>
            <select
              id="master-type"
              className="select"
              value={form.ticket_type}
              onChange={(event) => setField("ticket_type", event.target.value)}
            >
              {data.options.ticket_types.map((value) => (
                <option key={value} value={value}>
                  {
                    {
                      incident: "Incident",
                      service_request: "Service Request",
                      change_request: "Change Request",
                    }[value]
                  }
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label" htmlFor="master-priority">
              Prioritas <span className="req">*</span>
            </label>
            <select
              id="master-priority"
              className="select"
              value={form.priority}
              onChange={(event) => setField("priority", event.target.value)}
            >
              {data.options.priorities.map((value) => (
                <option key={value} value={value}>
                  {
                    {
                      critical: "Kritis",
                      high: "Tinggi",
                      normal: "Normal",
                      low: "Rendah",
                    }[value]
                  }
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-grid form-grid--3" style={{ marginTop: 16 }}>
          <div>
            <label className="form-label" htmlFor="master-response">
              Respons (menit) <span className="req">*</span>
            </label>
            <input
              id="master-response"
              className="input"
              type="number"
              min={1}
              value={form.response_minutes}
              onChange={(event) =>
                setField("response_minutes", Number(event.target.value))
              }
              required
            />
          </div>

          <div>
            <label className="form-label" htmlFor="master-approval">
              Approval (menit)
            </label>
            <input
              id="master-approval"
              className="input"
              type="number"
              min={0}
              value={form.approval_minutes}
              onChange={(event) =>
                setField("approval_minutes", Number(event.target.value))
              }
            />
          </div>

          <div>
            <label className="form-label" htmlFor="master-resolution">
              Penyelesaian (menit)
            </label>
            <input
              id="master-resolution"
              className="input"
              type="number"
              min={0}
              value={form.resolution_minutes}
              onChange={(event) =>
                setField("resolution_minutes", Number(event.target.value))
              }
            />
          </div>
        </div>

        <div className="form-grid" style={{ marginTop: 16 }}>
          <div>
            <label className="form-label" htmlFor="master-calendar">
              Kalender
            </label>
            <select
              id="master-calendar"
              className="select"
              value={form.calendar_mode}
              onChange={(event) => setField("calendar_mode", event.target.value)}
            >
              <option value="business_hours">Jam kerja</option>
              <option value="24x7">24x7</option>
            </select>
          </div>

          <div>
            <label className="form-label" htmlFor="master-version">
              Versi
            </label>
            <input
              id="master-version"
              className="input"
              type="number"
              min={1}
              value={form.version}
              onChange={(event) => setField("version", Number(event.target.value))}
            />
            <div className="hint">Naikkan saat aturan SLA berubah.</div>
          </div>
        </div>

        {form.calendar_mode === "business_hours" && (
          <>
            <div className="field-row" style={{ marginTop: 16 }}>
              <span className="form-label">Hari kerja</span>
              <div className="day-picker">
                {[
                  [1, "Sen"],
                  [2, "Sel"],
                  [3, "Rab"],
                  [4, "Kam"],
                  [5, "Jum"],
                  [6, "Sab"],
                  [7, "Min"],
                ].map(([day, label]) => (
                  <label
                    key={day}
                    className={`day-chip${
                      form.business_days.includes(day) ? " is-on" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.business_days.includes(day)}
                      onChange={() => toggleDay(day)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div className="form-grid" style={{ marginTop: 16 }}>
              <div>
                <label className="form-label" htmlFor="master-start">
                  Jam mulai
                </label>
                <input
                  id="master-start"
                  className="input"
                  type="time"
                  value={form.business_start}
                  onChange={(event) =>
                    setField("business_start", event.target.value)
                  }
                />
              </div>

              <div>
                <label className="form-label" htmlFor="master-end">
                  Jam selesai
                </label>
                <input
                  id="master-end"
                  className="input"
                  type="time"
                  value={form.business_end}
                  onChange={(event) => setField("business_end", event.target.value)}
                />
              </div>
            </div>
          </>
        )}

        <label className="checkline" style={{ marginTop: 16 }}>
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(event) => setField("is_active", event.target.checked)}
          />
          <span>Aktif</span>
        </label>
      </>
    );
  }

  return (
    <>
      <div className="field-row">
        <label className="form-label" htmlFor="master-date">
          Tanggal <span className="req">*</span>
        </label>
        <input
          id="master-date"
          className="input"
          type="date"
          value={form.date}
          onChange={(event) => setField("date", event.target.value)}
          required
        />
        <div className="hint">
          Dihitung sebagai hari libur penuh pada perhitungan SLA jam kerja.
        </div>
      </div>

      <div className="field-row">
        <label className="form-label" htmlFor="master-name">
          Nama hari libur <span className="req">*</span>
        </label>
        <input
          id="master-name"
          className="input"
          value={form.name}
          onChange={(event) => setField("name", event.target.value)}
          maxLength={120}
          placeholder="Contoh: Hari Kemerdekaan RI"
          required
        />
      </div>

      <label className="checkline" style={{ marginTop: 16 }}>
        <input
          type="checkbox"
          checked={form.is_active}
          onChange={(event) => setField("is_active", event.target.checked)}
        />
        <span>Aktif</span>
      </label>
    </>
  );
}
