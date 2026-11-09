import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "../../../components/ui/PageHeader";
import EmptyState from "../../../components/ui/EmptyState";
import Modal from "../../../components/ui/Modal";
import { TableSkeleton } from "../../../components/ui/Skeleton";
import { pb } from "../../../lib/pocketbase";
import { getErrorMessage } from "../../../lib/api";
import { formErrorText, useAppForm } from "../../../lib/formik";
import { priorityLabel, typeLabel } from "../../../lib/format";
import { useAuth } from "../../../app/providers/AuthProvider";
import TeamTab from "../components/TeamTab";
import IdentityTab from "../components/IdentityTab";
import ServiceCatalogTab from "../components/ServiceCatalogTab";
import IntakePointsTab from "../components/IntakePointsTab";

const TABS = [
  { key: "identity", label: "Identitas" },
  { key: "units", label: "Unit" },
  { key: "categories", label: "Kategori" },
  { key: "services", label: "Layanan" },
  { key: "intake", label: "Titik QR" },
  { key: "policies", label: "Kebijakan SLA" },
  { key: "holidays", label: "Hari libur" },
  { key: "tim", label: "Tim" },
];

const COLLECTIONS = {
  units: "units",
  categories: "ticket_categories",
  policies: "sla_policies",
  holidays: "holidays",
};

const UNIT_KINDS = [
  ["clinical", "Klinis"],
  ["support", "Penunjang"],
  ["management", "Manajemen"],
];

const CATEGORY_KINDS = [
  ["all", "Semua tipe"],
  ["incident", "Incident"],
  ["service_request", "Service Request"],
  ["change_request", "Change Request"],
];

const TICKET_TYPES = [
  ["incident", "Incident"],
  ["service_request", "Service Request"],
  ["change_request", "Change Request"],
];

const PRIORITIES = [
  ["critical", "Kritis"],
  ["high", "Tinggi"],
  ["normal", "Normal"],
  ["low", "Rendah"],
];

const CALENDAR_MODES = [
  ["business_hours", "Jam kerja"],
  ["24x7", "24x7"],
];

const DAYS = [
  [1, "Sen"],
  [2, "Sel"],
  [3, "Rab"],
  [4, "Kam"],
  [5, "Jum"],
  [6, "Sab"],
  [7, "Min"],
];

const EMPTY_FORM = {
  units: {
    name: "",
    code: "",
    kind: "clinical",
    manager: "",
    is_active: true,
  },
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

function labelOf(options, value) {
  const match = options.find(([key]) => key === value);
  return match ? match[1] : value || "—";
}

function formatMinutes(value) {
  const minutes = Number(value) || 0;
  if (minutes <= 0) return "—";
  if (minutes < 60) return `${minutes} mnt`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} jam`;
}

function activeLozenge(isActive) {
  return (
    <span
      className={`lozenge ${isActive ? "status-resolved" : "lozenge--neutral"}`}
    >
      {isActive ? "Aktif" : "Nonaktif"}
    </span>
  );
}

function sortPolicies(items) {
  const typeRank = { incident: 0, service_request: 1, change_request: 2 };
  const priorityRank = { critical: 0, high: 1, normal: 2, low: 3 };

  return [...items].sort(
    (a, b) =>
      (typeRank[a.ticket_type] ?? 9) - (typeRank[b.ticket_type] ?? 9) ||
      (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9) ||
      String(a.name).localeCompare(String(b.name))
  );
}

function formFromRecord(tab, record) {
  if (tab === "units") {
    return {
      name: record.name || "",
      code: record.code || "",
      kind: record.kind || "clinical",
      manager: record.manager || "",
      is_active: Boolean(record.is_active),
    };
  }

  if (tab === "categories") {
    return {
      name: record.name || "",
      code: record.code || "",
      kind: record.kind || "all",
      is_active: Boolean(record.is_active),
    };
  }

  if (tab === "policies") {
    return {
      name: record.name || "",
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
      is_active: Boolean(record.is_active),
    };
  }

  return {
    date: String(record.date || "").slice(0, 10),
    name: record.name || "",
    is_active: Boolean(record.is_active),
  };
}

export default function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("units");
  const [data, setData] = useState({
    units: [],
    categories: [],
    policies: [],
    holidays: [],
  });
  const [people, setPeople] = useState([]);
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
    validate: (values) => {
      const errors = {};

      if (modal?.tab === "policies") {
        if (!Number(values.response_minutes)) {
          errors.response_minutes = "Batas respons harus lebih dari 0 menit.";
        }
        if (
          values.calendar_mode === "business_hours" &&
          values.business_start >= values.business_end
        ) {
          errors.business_start =
            "Jam mulai harus lebih awal dari jam selesai.";
        }
        if (
          values.calendar_mode === "business_hours" &&
          values.business_days.length === 0
        ) {
          errors.business_days = "Pilih minimal satu hari kerja.";
        }
      }

      if (modal?.tab === "holidays" && !values.date) {
        errors.date = "Tanggal hari libur wajib diisi.";
      }

      return errors;
    },
    onSubmit: async (values, helpers) => {
      helpers.setStatus("");

      const payload = { ...values };

      if (modal.tab === "holidays") {
        payload.date = `${values.date} 00:00:00.000Z`;
      }

      if (modal.tab === "units" || modal.tab === "categories") {
        payload.code = String(values.code || "").trim().toUpperCase();
      }

      if (modal.tab === "policies") {
        payload.response_minutes = Number(values.response_minutes) || 0;
        payload.approval_minutes = Number(values.approval_minutes) || 0;
        payload.resolution_minutes = Number(values.resolution_minutes) || 0;
        payload.version = Number(values.version) || 1;
      }

      try {
        const collection = pb.collection(COLLECTIONS[modal.tab]);

        if (modal.record) {
          await collection.update(modal.record.id, payload);
        } else {
          await collection.create({ ...payload, tenant: user.tenant });
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

  const formError = formErrorText(formik);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [units, categories, policies, holidays, users] = await Promise.all([
        pb.collection("units").getFullList({ sort: "name", expand: "manager" }),
        pb.collection("ticket_categories").getFullList({ sort: "name" }),
        pb.collection("sla_policies").getFullList(),
        pb.collection("holidays").getFullList({ sort: "date" }),
        pb
          .collection("users")
          .getFullList({ filter: "is_active = true", sort: "name" }),
      ]);

      setData({
        units,
        categories,
        policies: sortPolicies(policies),
        holidays,
      });
      setPeople(users);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = "Pengaturan · Healthcare ITSM";
    load();
  }, [load]);

  const isTeamTab = tab === "tim";
  const isIdentityTab = tab === "identity";
  const isServiceTab = tab === "services";
  const isIntakeTab = tab === "intake";
  const items =
    isTeamTab || isIdentityTab || isServiceTab || isIntakeTab
      ? []
      : data[tab];

  const missingPolicyCombos = useMemo(() => {
    const taken = new Set(
      data.policies.map((policy) => `${policy.ticket_type}:${policy.priority}`)
    );

    return TICKET_TYPES.flatMap(([type]) =>
      PRIORITIES.filter(([priority]) => !taken.has(`${type}:${priority}`)).map(
        ([priority]) => `${type}:${priority}`
      )
    );
  }, [data.policies]);

  const createDisabled = tab === "policies" && missingPolicyCombos.length === 0;

  const titleByTab = useMemo(
    () => ({
      units: "unit",
      categories: "kategori",
      intake: "titik QR",
      policies: "kebijakan SLA",
      holidays: "hari libur",
    }),
    []
  );

  function openCreate() {
    setNotice("");
    setModal({ tab, record: null });
  }

  function openEdit(record) {
    setNotice("");
    setModal({ tab, record });
  }

  function closeModal() {
    if (formik.isSubmitting) return;
    setModal(null);
  }

  function toggleDay(day) {
    const days = formik.values.business_days.includes(day)
      ? formik.values.business_days.filter((value) => value !== day)
      : [...formik.values.business_days, day].sort((a, b) => a - b);

    formik.setFieldValue("business_days", days);
  }

  async function toggleActive(record) {
    setBusyId(record.id);
    setError("");
    setNotice("");

    try {
      await pb.collection(COLLECTIONS[tab]).update(record.id, {
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

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Service desk" }, { label: "Pengaturan" }]}
        title="Pengaturan"
        description="Kelola identitas rumah sakit (termasuk zona waktu), unit, kategori, layanan, titik QR, kebijakan SLA, hari libur, dan tim IT. Perubahan data master berlaku untuk tiket baru; tiket lama memakai snapshot SLA saat dibuat."
        actions={
          isTeamTab || isIdentityTab || isServiceTab || isIntakeTab ? undefined : (
            <button
              className="btn btn-primary"
              type="button"
              onClick={openCreate}
              disabled={createDisabled}
              title={
                createDisabled
                  ? "Semua kombinasi tipe dan prioritas sudah memiliki kebijakan"
                  : undefined
              }
            >
              <i className="bi bi-plus-lg" aria-hidden="true" />
              Tambah {titleByTab[tab]}
            </button>
          )
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

      <div className="tabs" role="tablist" aria-label="Jenis pengaturan">
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
            {item.key !== "tim" &&
              item.key !== "identity" &&
              item.key !== "services" &&
              item.key !== "intake" && (
                <span className="tab-count">
                  {(data[item.key] || []).length}
                </span>
              )}
          </button>
        ))}
      </div>

      {createDisabled && (
        <div className="alert alert--info" role="status">
          <i className="bi bi-info-circle" aria-hidden="true" />
          <div>
            Semua kombinasi tipe tiket × prioritas sudah memiliki kebijakan.
            Ubah kebijakan yang ada; perubahan berlaku untuk tiket baru.
          </div>
        </div>
      )}

      {isTeamTab ? (
        <TeamTab units={data.units} currentUser={user} />
      ) : isIdentityTab ? (
        <IdentityTab />
      ) : isServiceTab ? (
        <ServiceCatalogTab />
      ) : isIntakeTab ? (
        <IntakePointsTab units={data.units} />
      ) : (
        <>
          <div className="list-panel admin-panel">
        {loading ? (
          <TableSkeleton rows={5} />
        ) : items.length === 0 ? (
          <EmptyState
            icon="bi-sliders"
            title={`Belum ada ${titleByTab[tab]}`}
            description="Tambahkan data pertama agar dapat dipakai pada tiket baru."
            action={
              <button className="btn btn-primary" type="button" onClick={openCreate}>
                <i className="bi bi-plus-lg" aria-hidden="true" />
                Tambah {titleByTab[tab]}
              </button>
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
                    {renderCells(tab, record)}
                    <td className="col-actions">
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
                            <span className="spinner spinner--dark" aria-hidden="true" />
                          ) : (
                            <i
                              className={`bi ${
                                record.is_active ? "bi-pause-circle" : "bi-play-circle"
                              }`}
                              aria-hidden="true"
                            />
                          )}
                          {record.is_active ? "Nonaktifkan" : "Aktifkan"}
                        </button>
                      </div>
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
        Data master tidak dihapus permanen. Gunakan <strong>Nonaktifkan</strong>{" "}
        agar riwayat tiket lama tetap valid.
      </p>

      {modal && (
        <Modal
          title={`${modal.record ? "Edit" : "Tambah"} ${titleByTab[modal.tab]}`}
          description={
            modal.tab === "policies"
              ? "Batas waktu dihitung dalam menit. Untuk jam kerja, menit dihitung di dalam jam kerja dan hari kerja."
              : "Perubahan disimpan langsung ke tenant Anda."
          }
          onClose={closeModal}
          wide={modal.tab === "policies"}
          footer={
            <>
              <button
                className="btn btn-subtle"
                type="button"
                onClick={closeModal}
                disabled={formik.isSubmitting}
              >
                Batal
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                form="admin-form"
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
            id="admin-form"
            className="admin-form"
            onSubmit={formik.handleSubmit}
          >
            {formError && (
              <div className="alert alert--error" role="alert">
                <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                <div>{formError}</div>
              </div>
            )}

            {renderForm()}
          </form>
        </Modal>
      )}
        </>
      )}
    </>
  );

  function renderHead(tabKey) {
    if (tabKey === "units") {
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

    if (tabKey === "categories") {
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

    if (tabKey === "policies") {
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

  function renderCells(tabKey, record) {
    if (tabKey === "units") {
      return (
        <>
          <td>
            <span className="admin-name">{record.name}</span>
          </td>
          <td className="col-code">
            <code>{record.code}</code>
          </td>
          <td>{labelOf(UNIT_KINDS, record.kind)}</td>
          <td>
            {record.expand?.manager?.name || (
              <span className="muted">Belum ada</span>
            )}
          </td>
          <td className="col-status">{activeLozenge(record.is_active)}</td>
        </>
      );
    }

    if (tabKey === "categories") {
      return (
        <>
          <td>
            <span className="admin-name">{record.name}</span>
          </td>
          <td className="col-code">
            <code>{record.code}</code>
          </td>
          <td>{labelOf(CATEGORY_KINDS, record.kind)}</td>
          <td className="col-status">{activeLozenge(record.is_active)}</td>
        </>
      );
    }

    if (tabKey === "policies") {
      return (
        <>
          <td>
            <span className="admin-name">{record.name}</span>
            <div className="admin-sub">versi {record.version || 1}</div>
          </td>
          <td>{typeLabel(record.ticket_type)}</td>
          <td>{priorityLabel(record.priority)}</td>
          <td className="col-num">{formatMinutes(record.response_minutes)}</td>
          <td className="col-num">{formatMinutes(record.approval_minutes)}</td>
          <td className="col-num">{formatMinutes(record.resolution_minutes)}</td>
          <td>{labelOf(CALENDAR_MODES, record.calendar_mode)}</td>
          <td className="col-status">{activeLozenge(record.is_active)}</td>
        </>
      );
    }

    return (
      <>
        <td className="nowrap">{String(record.date || "").slice(0, 10)}</td>
        <td>
          <span className="admin-name">{record.name}</span>
        </td>
        <td className="col-status">{activeLozenge(record.is_active)}</td>
      </>
    );
  }

  function renderForm() {
    if (modal.tab === "units" || modal.tab === "categories") {
      const kinds = modal.tab === "units" ? UNIT_KINDS : CATEGORY_KINDS;
      const kindLabel = modal.tab === "units" ? "Jenis unit" : "Jenis tiket";

      return (
        <>
          <div className="field-row">
            <label className="form-label" htmlFor="admin-name">
              Nama <span className="req">*</span>
            </label>
            <input
              id="admin-name"
              className="input"
              maxLength={120}
              {...formik.getFieldProps("name")}
              required
            />
          </div>

          <div className="form-grid" style={{ marginTop: 16 }}>
            <div>
              <label className="form-label" htmlFor="admin-code">
                Kode <span className="req">*</span>
              </label>
              <input
                id="admin-code"
                className="input"
                maxLength={modal.tab === "units" ? 20 : 40}
                placeholder="Contoh: IGD"
                {...formik.getFieldProps("code")}
                required
              />
              <div className="hint">Unik per tenant, otomatis diubah ke huruf besar.</div>
            </div>

            <div>
              <label className="form-label" htmlFor="admin-kind">
                {kindLabel} <span className="req">*</span>
              </label>
              <select
                id="admin-kind"
                className="select"
                {...formik.getFieldProps("kind")}
              >
                {kinds.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {modal.tab === "units" && (
            <div className="field-row" style={{ marginTop: 16 }}>
              <label className="form-label" htmlFor="admin-manager">
                Manajer unit
              </label>
              <select
                id="admin-manager"
                className="select"
                {...formik.getFieldProps("manager")}
              >
                <option value="">Belum ditentukan</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name} · {person.email}
                  </option>
                ))}
              </select>
              <div className="hint">
                Approver tahap pertama untuk tiket unit ini. Bila kosong,
                approval langsung ke Kepala IT.
              </div>
            </div>
          )}
        </>
      );
    }

    if (modal.tab === "policies") {
      return (
        <>
          <div className="field-row">
            <label className="form-label" htmlFor="admin-name">
              Nama kebijakan <span className="req">*</span>
            </label>
            <input
              id="admin-name"
              className="input"
              maxLength={120}
              placeholder="Contoh: Incident normal - jam kerja"
              {...formik.getFieldProps("name")}
              required
            />
          </div>

          <div className="form-grid" style={{ marginTop: 16 }}>
            <div>
              <label className="form-label" htmlFor="admin-type">
                Tipe tiket <span className="req">*</span>
              </label>
              <select
                id="admin-type"
                className="select"
                {...formik.getFieldProps("ticket_type")}
              >
                {TICKET_TYPES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label" htmlFor="admin-priority">
                Prioritas <span className="req">*</span>
              </label>
              <select
                id="admin-priority"
                className="select"
                {...formik.getFieldProps("priority")}
              >
                {PRIORITIES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-grid form-grid--3" style={{ marginTop: 16 }}>
            <div>
              <label className="form-label" htmlFor="admin-response">
                Respons (menit) <span className="req">*</span>
              </label>
              <input
                id="admin-response"
                className="input"
                type="number"
                min={1}
                {...formik.getFieldProps("response_minutes")}
                required
              />
            </div>

            <div>
              <label className="form-label" htmlFor="admin-approval">
                Approval (menit)
              </label>
              <input
                id="admin-approval"
                className="input"
                type="number"
                min={0}
                {...formik.getFieldProps("approval_minutes")}
              />
            </div>

            <div>
              <label className="form-label" htmlFor="admin-resolution">
                Penyelesaian (menit)
              </label>
              <input
                id="admin-resolution"
                className="input"
                type="number"
                min={0}
                {...formik.getFieldProps("resolution_minutes")}
              />
            </div>
          </div>

          <div className="form-grid" style={{ marginTop: 16 }}>
            <div>
              <label className="form-label" htmlFor="admin-calendar">
                Kalender
              </label>
              <select
                id="admin-calendar"
                className="select"
                {...formik.getFieldProps("calendar_mode")}
              >
                {CALENDAR_MODES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label" htmlFor="admin-version">
                Versi
              </label>
              <input
                id="admin-version"
                className="input"
                type="number"
                min={1}
                {...formik.getFieldProps("version")}
              />
              <div className="hint">Naikkan saat aturan SLA berubah.</div>
            </div>
          </div>

          {formik.values.calendar_mode === "business_hours" && (
            <>
              <div className="field-row" style={{ marginTop: 16 }}>
                <span className="form-label">Hari kerja</span>
                <div className="day-picker">
                  {DAYS.map(([day, label]) => (
                    <label
                      key={day}
                      className={`day-chip${
                        formik.values.business_days.includes(day) ? " is-on" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={formik.values.business_days.includes(day)}
                        onChange={() => toggleDay(day)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-grid" style={{ marginTop: 16 }}>
                <div>
                  <label className="form-label" htmlFor="admin-start">
                    Jam mulai
                  </label>
                  <input
                    id="admin-start"
                    className="input"
                    type="time"
                    {...formik.getFieldProps("business_start")}
                  />
                </div>

                <div>
                  <label className="form-label" htmlFor="admin-end">
                    Jam selesai
                  </label>
                  <input
                    id="admin-end"
                    className="input"
                    type="time"
                    {...formik.getFieldProps("business_end")}
                  />
                </div>
              </div>
            </>
          )}
        </>
      );
    }

    return (
      <>
        <div className="field-row">
          <label className="form-label" htmlFor="admin-date">
            Tanggal <span className="req">*</span>
          </label>
          <input
            id="admin-date"
            className="input"
            type="date"
            {...formik.getFieldProps("date")}
            required
          />
        </div>

        <div className="field-row">
          <label className="form-label" htmlFor="admin-name">
            Nama hari libur <span className="req">*</span>
          </label>
          <input
            id="admin-name"
            className="input"
            maxLength={120}
            placeholder="Contoh: Hari Kemerdekaan RI"
            {...formik.getFieldProps("name")}
            required
          />
        </div>
      </>
    );
  }
}
