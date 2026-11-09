import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../../components/ui/PageHeader";
import EmptyState from "../../../components/ui/EmptyState";
import Modal from "../../../components/ui/Modal";
import Pagination from "../../../components/ui/Pagination";
import { TableSkeleton } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../app/providers/AuthProvider";
import { useMeta } from "../../../app/providers/MetaProvider";
import { useTenant } from "../../../app/providers/TenantProvider";
import { formatDate } from "../../../lib/format";
import { isPlatformAdmin, tenantRoleLabel } from "../../../lib/permissions";
import { TEAM_OPTIONS, teamLabel } from "../../../lib/teams";
import { timeZoneOptions } from "../../../lib/timezones";
import { formErrorText, useAppForm } from "../../../lib/formik";
import { usePagedEndpoint, useDebouncedValue } from "../../../lib/pagedList";
import {
  createPlatformTenant,
  createPlatformTenantUser,
  fetchPlatformTenant,
  fetchPlatformTenants,
  getErrorMessage,
  seedPlatformTenant,
  updatePlatformTenant,
  updatePlatformTenantUser,
} from "../../../lib/api";

const TIMEZONES = timeZoneOptions();

const ROLES = [
  ["requester", "Pemohon"],
  ["it_support", "Staff IT"],
  ["resolver", "Teknisi"],
  ["it_lead", "Kepala IT"],
  ["viewer", "Pengamat"],
];

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,19}$/;
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

const EMPTY_CREATE = {
  name: "",
  code: "",
  timezone: "Asia/Jakarta",
  seed_master: true,
  admin_name: "",
  admin_email: "",
  admin_password: "",
};

const EMPTY_USER = {
  name: "",
  email: "",
  role: "it_lead",
  job_title: "",
  team: "",
  unit: "",
  password: "",
};

const JOB_TITLE_OPTIONS = [
  "Programmer",
  "Teknisi Jaringan",
  "Teknisi Hardware",
  "Admin SIMRS",
  "DBA",
  "Teknisi Alat Kesehatan",
  "Operator SIMRS",
  "Helpdesk",
  "Staf Akreditasi",
];

function timezoneLabel(value) {
  const found = TIMEZONES.find(([zone]) => zone === value);
  return found ? found[1] : value || "—";
}
function StatusLozenge({ active }) {
  return (
    <span
      className={`lozenge ${active ? "status-resolved" : "lozenge--neutral"}`}
    >
      {active ? "Aktif" : "Nonaktif"}
    </span>
  );
}

function CountField({ label, value }) {
  return (
    <div className="detail-field">
      <div className="detail-label">{label}</div>
      <div className="detail-value">{value}</div>
    </div>
  );
}

export default function PlatformPage() {
  const { user } = useAuth();
  const { isVendor } = useMeta();
  const { reloadTenants } = useTenant();
  const canManage = isPlatformAdmin(user);

  const [summary, setSummary] = useState({
    tenants: 0,
    active: 0,
    users: 0,
    open_tickets: 0,
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState("");

  const debouncedQuery = useDebouncedValue(query, 350);
  const fetchPage = useCallback((params) => fetchPlatformTenants(params), []);
  const list = usePagedEndpoint(fetchPage, debouncedQuery);

  // Pencarian berubah -> kembali ke halaman pertama.
  useEffect(() => {
    list.setPage(1);
  }, [debouncedQuery, list.setPage]);

  // Ringkasan tetap dari server (mencakup seluruh instalasi, bukan satu halaman).
  useEffect(() => {
    if (list.raw?.summary) setSummary(list.raw.summary);
  }, [list.raw]);

  const loading = list.loading;
  const items = list.items;
  const filtered = list.items;

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  const createFormik = useAppForm({
    initialValues: { ...EMPTY_CREATE },
    validate: (values) => {
      const errors = {};
      const name = values.name.trim();
      const code = values.code.trim().toUpperCase();
      const adminEmail = values.admin_email.trim();
      const adminPassword = values.admin_password;
      const hasAdmin = Boolean(
        adminEmail || adminPassword || values.admin_name.trim()
      );

      if (name.length < 2) {
        errors.name = "Nama rumah sakit minimal 2 karakter.";
      }
      if (!CODE_PATTERN.test(code)) {
        errors.code =
          "Kode 2–20 karakter: huruf, angka, titik, garis bawah, atau strip.";
      }
      if (hasAdmin && (!adminEmail || !adminPassword)) {
        errors.admin_email =
          "Email dan password akun pertama harus diisi bersamaan.";
      }
      if (hasAdmin && adminPassword.length < 8) {
        errors.admin_password = "Password akun pertama minimal 8 karakter.";
      }
      if (hasAdmin && !EMAIL_PATTERN.test(adminEmail)) {
        errors.admin_email = "Email akun pertama tidak valid.";
      }

      return errors;
    },
    onSubmit: async (values, helpers) => {
      helpers.setStatus("");
      const name = values.name.trim();
      const code = values.code.trim().toUpperCase();
      const adminEmail = values.admin_email.trim();
      const adminPassword = values.admin_password;
      const hasAdmin = Boolean(
        adminEmail || adminPassword || values.admin_name.trim()
      );

      try {
        const payload = {
          name,
          code,
          timezone: values.timezone,
          seed_master: values.seed_master,
        };

        if (hasAdmin) {
          payload.admin = {
            name: values.admin_name.trim() || undefined,
            email: adminEmail,
            password: adminPassword,
          };
        }

        const result = await createPlatformTenant(payload);

        setCreateOpen(false);
        createFormik.resetForm();
        setNotice(
          `${result.tenant.name} (${result.tenant.code}) dibuat${
            result.seed
              ? ` dengan ${result.seed.units} unit dan ${result.seed.policies} kebijakan SLA`
              : ""
          }.`
        );

        await load();
        reloadTenants();
      } catch (err) {
        helpers.setStatus(getErrorMessage(err));
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  const editFormik = useAppForm({
    initialValues: {
      name: "",
      code: "",
      timezone: "Asia/Jakarta",
      is_active: true,
    },
    validate: (values) => {
      const errors = {};
      if (values.name.trim().length < 2) {
        errors.name = "Nama rumah sakit minimal 2 karakter.";
      }
      if (!CODE_PATTERN.test(values.code.trim().toUpperCase())) {
        errors.code =
          "Kode 2–20 karakter: huruf, angka, titik, garis bawah, atau strip.";
      }
      return errors;
    },
    onSubmit: async (values, helpers) => {
      helpers.setStatus("");
      const name = values.name.trim();
      const code = values.code.trim().toUpperCase();

      try {
        await updatePlatformTenant(editTarget.id, {
          name,
          code,
          timezone: values.timezone,
          is_active: values.is_active,
        });

        setEditTarget(null);
        setNotice(`${name} diperbarui.`);
        editFormik.resetForm();
        await load();
        reloadTenants();
      } catch (err) {
        helpers.setStatus(getErrorMessage(err));
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  const createError = formErrorText(createFormik);
  const editError = formErrorText(editFormik);

  const [detailId, setDetailId] = useState("");

  const load = useCallback(async () => {
    setError("");
    list.reload();
  }, [list.reload]);

  useEffect(() => {
    document.title = "Konsol Vendor · Healthcare ITSM";
  }, []);

  function openCreate() {
    createFormik.setStatus("");
    createFormik.resetForm();
    setNotice("");
    setCreateOpen(true);
  }

  function openEdit(tenant) {
    editFormik.setStatus("");
    editFormik.setValues({
      name: tenant.name,
      code: tenant.code,
      timezone: tenant.timezone || "Asia/Jakarta",
      is_active: Boolean(tenant.is_active),
    });
    setNotice("");
    setEditTarget(tenant);
  }

  async function toggleActive(tenant) {
    setBusyId(tenant.id);
    setError("");
    setNotice("");

    try {
      await updatePlatformTenant(tenant.id, { is_active: !tenant.is_active });
      setNotice(
        `${tenant.name} ${tenant.is_active ? "dinonaktifkan" : "diaktifkan"}.`
      );
      await load();
      reloadTenants();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId("");
    }
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Vendor" }, { label: "Konsol Vendor" }]}
        title="Konsol Vendor"
        description="Kelola rumah sakit yang dilayani instalasi ini: buat tenant baru, lengkapi data master default, dan siapkan akun IT pertama."
        actions={
          canManage &&
          isVendor && (
            <button className="btn btn-primary" type="button" onClick={openCreate}>
              <i className="bi bi-plus-lg" aria-hidden="true" />
              Tambah rumah sakit
            </button>
          )
        }
      />

      {!isVendor && (
        <div className="alert alert--warning" role="alert">
          <i className="bi bi-exclamation-triangle" aria-hidden="true" />
          <div>
            Instalasi ini berjalan pada mode <strong>standalone</strong>. Konsol
            Vendor hanya aktif bila PocketBase dijalankan dengan{" "}
            <code>TENANCY_MODE=vendor</code>.
          </div>
        </div>
      )}

      {(error || list.error) && (
        <div className="alert alert--error" role="alert">
          <i className="bi bi-exclamation-triangle" aria-hidden="true" />
          <div>{error || list.error}</div>
        </div>
      )}

      {notice && (
        <div className="alert alert--success" role="status">
          <i className="bi bi-check-circle" aria-hidden="true" />
          <div>{notice}</div>
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi-card is-static">
          <span className="kpi-head">
            <i className="bi bi-buildings" aria-hidden="true" />
            Rumah sakit
          </span>
          <span className="kpi-value">{summary.tenants ?? 0}</span>
          <span className="kpi-hint">{summary.active ?? 0} aktif</span>
        </div>
        <div className="kpi-card is-static">
          <span className="kpi-head">
            <i className="bi bi-people" aria-hidden="true" />
            Pengguna
          </span>
          <span className="kpi-value">{summary.users ?? 0}</span>
          <span className="kpi-hint">seluruh tenant</span>
        </div>
        <div className="kpi-card is-static">
          <span className="kpi-head">
            <i className="bi bi-ticket-detailed" aria-hidden="true" />
            Tiket aktif
          </span>
          <span className="kpi-value">{summary.open_tickets ?? 0}</span>
          <span className="kpi-hint">belum resolved/closed</span>
        </div>
        <div className="kpi-card is-static">
          <span className="kpi-head">
            <i className="bi bi-hdd-network" aria-hidden="true" />
            Mode
          </span>
          <span className="kpi-value">{isVendor ? "Vendor" : "Standalone"}</span>
          <span className="kpi-hint">dibaca dari environment</span>
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-box">
          <i className="bi bi-search" aria-hidden="true" />
          <input
            className="input"
            type="search"
            placeholder="Cari nama atau kode rumah sakit"
            aria-label="Cari rumah sakit"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <span className="list-count">
          {loading ? "Memuat..." : `${list.totalItems} rumah sakit`}
        </span>
      </div>

      <div className="list-panel">
        {loading ? (
          <TableSkeleton rows={5} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="bi-buildings"
            title={
              list.totalItems === 0 ? "Belum ada rumah sakit" : "Tidak ada hasil"
            }
            description={
              list.totalItems === 0
                ? "Tambahkan rumah sakit pertama untuk mulai mengelola tenant."
                : "Ubah kata kunci pencarian untuk menemukan rumah sakit lain."
            }
            action={
              list.totalItems === 0 && canManage && isVendor ? (
                <button className="btn btn-primary" type="button" onClick={openCreate}>
                  <i className="bi bi-plus-lg" aria-hidden="true" />
                  Tambah rumah sakit
                </button>
              ) : null
            }
          />
        ) : (
          <>
            <div className="issue-table-wrap">
              <table className="issue-table admin-table">
                <thead>
                  <tr>
                    <th>Rumah sakit</th>
                    <th className="col-code">Zona waktu</th>
                    <th className="col-num">Pengguna</th>
                    <th className="col-num">Tiket aktif</th>
                    <th className="col-status">Status</th>
                    <th className="col-actions">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((tenant) => (
                    <tr
                      key={tenant.id}
                      className={tenant.is_active ? "" : "is-inactive"}
                    >
                      <td>
                        <span className="admin-name">{tenant.name}</span>
                        <div className="admin-sub">
                          <code>{tenant.code}</code>
                        </div>
                      </td>
                      <td className="col-code">
                        {timezoneLabel(tenant.timezone)}
                      </td>
                      <td className="col-num">{tenant.counts?.users ?? 0}</td>
                      <td className="col-num">
                        {tenant.counts?.open_tickets ?? 0}
                      </td>
                      <td className="col-status">
                        <StatusLozenge active={tenant.is_active} />
                      </td>
                      <td className="col-actions">
                        <div className="admin-actions">
                        <button
                          className="btn btn-subtle btn-sm"
                          type="button"
                          onClick={() => setDetailId(tenant.id)}
                        >
                          <i className="bi bi-sliders2" aria-hidden="true" />
                          Kelola
                        </button>
                        {canManage && (
                          <button
                            className="btn btn-subtle btn-sm"
                            type="button"
                            onClick={() => openEdit(tenant)}
                          >
                            <i className="bi bi-pencil" aria-hidden="true" />
                            Edit
                          </button>
                        )}
                        {canManage && (
                          <button
                            className="btn btn-subtle btn-sm"
                            type="button"
                            disabled={busyId === tenant.id}
                            onClick={() => toggleActive(tenant)}
                          >
                            {busyId === tenant.id ? (
                              <span
                                className="spinner spinner--dark"
                                aria-hidden="true"
                              />
                            ) : (
                              <i
                                className={`bi ${
                                  tenant.is_active
                                    ? "bi-pause-circle"
                                    : "bi-play-circle"
                                }`}
                                aria-hidden="true"
                              />
                            )}
                            {tenant.is_active ? "Nonaktifkan" : "Aktifkan"}
                          </button>
                        )}
                      </div>
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
              label="rumah sakit"
            />
          </>
        )}
      </div>

      <p className="admin-note">
        <i className="bi bi-info-circle" aria-hidden="true" />
        Menonaktifkan rumah sakit memblokir login baru semua penggunanya. Tiket
        dan riwayat lama tetap tersimpan.
      </p>

      {createOpen && (
        <Modal
          title="Tambah rumah sakit"
          description="Tenant baru langsung dilengkapi unit, kategori, kebijakan SLA, dan hari libur default."
          onClose={() => (createFormik.isSubmitting ? null : setCreateOpen(false))}
          wide
          footer={
            <>
              <button
                className="btn btn-subtle"
                type="button"
                onClick={() => setCreateOpen(false)}
                disabled={createFormik.isSubmitting}
              >
                Batal
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                form="platform-create-form"
                disabled={createFormik.isSubmitting}
              >
                {createFormik.isSubmitting ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    Menyimpan...
                  </>
                ) : (
                  "Buat rumah sakit"
                )}
              </button>
            </>
          }
        >
          <form
            id="platform-create-form"
            className="admin-form"
            onSubmit={createFormik.handleSubmit}
          >
            {createError && (
              <div className="alert alert--error" role="alert">
                <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                <div>{createError}</div>
              </div>
            )}

            <div className="field-row">
              <label className="form-label" htmlFor="tenant-name">
                Nama rumah sakit <span className="req">*</span>
              </label>
              <input
                id="tenant-name"
                className="input"
                maxLength={120}
                placeholder="Contoh: RSUD Kota Bandung"
                {...createFormik.getFieldProps("name")}
                required
              />
            </div>

            <div className="form-grid" style={{ marginTop: 16 }}>
              <div>
                <label className="form-label" htmlFor="tenant-code">
                  Kode <span className="req">*</span>
                </label>
                <input
                  id="tenant-code"
                  className="input"
                  maxLength={20}
                  placeholder="Contoh: RSUD-BDG"
                  {...createFormik.getFieldProps("code")}
                  required
                />
                <div className="hint">
                  Unik, 2–20 karakter, otomatis huruf besar.
                </div>
              </div>

              <div>
                <label className="form-label" htmlFor="tenant-timezone">
                  Zona waktu
                </label>
                <select
                  id="tenant-timezone"
                  className="select"
                  {...createFormik.getFieldProps("timezone")}
                >
                  {TIMEZONES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="checkline" style={{ marginTop: 16 }}>
              <input
                type="checkbox"
                {...createFormik.getFieldProps({
                  name: "seed_master",
                  type: "checkbox",
                })}
              />
              <span>
                Lengkapi data master default (10 unit, 9 kategori, 12 kebijakan
                SLA, 3 hari libur)
              </span>
            </label>

            <section className="form-section" style={{ marginTop: 24 }}>
              <h2 className="form-section-title">Akun IT pertama (opsional)</h2>
              <p className="form-section-hint">
                Buat akun Kepala IT agar rumah sakit ini bisa langsung dipakai.
                Kosongkan bila akun akan dibuat belakangan.
              </p>

              <div className="field-row">
                <label className="form-label" htmlFor="tenant-admin-name">
                  Nama
                </label>
                <input
                  id="tenant-admin-name"
                  className="input"
                  maxLength={120}
                  {...createFormik.getFieldProps("admin_name")}
                  placeholder="Contoh: Budi Santoso"
                />
              </div>

              <div className="form-grid" style={{ marginTop: 16 }}>
                <div>
                  <label className="form-label" htmlFor="tenant-admin-email">
                    Email
                  </label>
                  <input
                    id="tenant-admin-email"
                    className="input"
                    type="email"
                    {...createFormik.getFieldProps("admin_email")}
                    placeholder="it@rsud.example.com"
                  />
                </div>

                <div>
                  <label className="form-label" htmlFor="tenant-admin-password">
                    Password awal
                  </label>
                  <input
                    id="tenant-admin-password"
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    {...createFormik.getFieldProps("admin_password")}
                    minLength={8}
                  />
                  <div className="hint">Minimal 8 karakter.</div>
                </div>
              </div>
            </section>
          </form>
        </Modal>
      )}

      {editTarget && (
        <Modal
          title={`Edit ${editTarget.name}`}
          description="Perubahan berlaku langsung untuk tenant ini."
          onClose={() => (editFormik.isSubmitting ? null : setEditTarget(null))}
          footer={
            <>
              <button
                className="btn btn-subtle"
                type="button"
                onClick={() => setEditTarget(null)}
                disabled={editFormik.isSubmitting}
              >
                Batal
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                form="platform-edit-form"
                disabled={editFormik.isSubmitting}
              >
                {editFormik.isSubmitting ? (
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
            id="platform-edit-form"
            className="admin-form"
            onSubmit={editFormik.handleSubmit}
          >
            {editError && (
              <div className="alert alert--error" role="alert">
                <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                <div>{editError}</div>
              </div>
            )}

            <div className="field-row">
              <label className="form-label" htmlFor="edit-tenant-name">
                Nama rumah sakit <span className="req">*</span>
              </label>
              <input
                id="edit-tenant-name"
                className="input"
                maxLength={120}
                {...editFormik.getFieldProps("name")}
                required
              />
            </div>

            <div className="form-grid" style={{ marginTop: 16 }}>
              <div>
                <label className="form-label" htmlFor="edit-tenant-code">
                  Kode <span className="req">*</span>
                </label>
                <input
                  id="edit-tenant-code"
                  className="input"
                  maxLength={20}
                  {...editFormik.getFieldProps("code")}
                  required
                />
              </div>

              <div>
                <label className="form-label" htmlFor="edit-tenant-timezone">
                  Zona waktu
                </label>
                <select
                  id="edit-tenant-timezone"
                  className="select"
                  {...editFormik.getFieldProps("timezone")}
                >
                  {TIMEZONES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="checkline" style={{ marginTop: 16 }}>
              <input
                type="checkbox"
                {...editFormik.getFieldProps({
                  name: "is_active",
                  type: "checkbox",
                })}
              />
              <span>Aktif — pengguna rumah sakit ini dapat login</span>
            </label>
          </form>
        </Modal>
      )}

      {detailId && (
        <TenantDetail
          tenantId={detailId}
          canManage={canManage}
          onClose={() => setDetailId("")}
          onChanged={load}
        />
      )}
    </>
  );
}

function TenantDetail({ tenantId, canManage, onClose, onChanged }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  const [showUserForm, setShowUserForm] = useState(false);
  const [pwdTarget, setPwdTarget] = useState(null);

  const userFormik = useAppForm({
    initialValues: { ...EMPTY_USER },
    validate: (values) => {
      const errors = {};
      if (values.name.trim().length < 2) {
        errors.name = "Nama minimal 2 karakter.";
      }
      if (!EMAIL_PATTERN.test(values.email.trim())) {
        errors.email = "Email tidak valid.";
      }
      if (values.password.length < 8) {
        errors.password = "Password minimal 8 karakter.";
      }
      return errors;
    },
    onSubmit: async (values, helpers) => {
      helpers.setStatus("");

      try {
        await createPlatformTenantUser(tenantId, {
          name: values.name.trim(),
          email: values.email.trim(),
          role: values.role,
          job_title: values.job_title.trim() || undefined,
          team: values.team || undefined,
          unit: values.unit || undefined,
          password: values.password,
        });

        userFormik.resetForm();
        setShowUserForm(false);
        setNotice("Pengguna baru dibuat.");
        await load();
        onChanged?.();
      } catch (err) {
        helpers.setStatus(getErrorMessage(err));
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  const pwdFormik = useAppForm({
    initialValues: { password: "" },
    validate: (values) => {
      const errors = {};
      if (values.password.length < 8) {
        errors.password = "Password baru minimal 8 karakter.";
      }
      return errors;
    },
    onSubmit: async (values, helpers) => {
      helpers.setStatus("");

      try {
        await updatePlatformTenantUser(tenantId, pwdTarget.id, {
          password: values.password,
        });
        setPwdTarget(null);
        pwdFormik.resetForm();
        setNotice(`Password ${pwdTarget.name} direset.`);
      } catch (err) {
        helpers.setStatus(getErrorMessage(err));
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  const userError = formErrorText(userFormik);
  const pwdError = formErrorText(pwdFormik);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      setData(await fetchPlatformTenant(tenantId));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSeed() {
    setBusy("seed");
    setError("");
    setNotice("");

    try {
      const result = await seedPlatformTenant(tenantId);
      const created = result.created || {};
      const total = Object.values(created).reduce(
        (sum, value) => sum + Number(value || 0),
        0
      );

      setNotice(
        total > 0
          ? `${total} data default ditambahkan.`
          : "Semua data master default sudah lengkap."
      );
      await load();
      onChanged?.();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy("");
    }
  }



  async function toggleUser(person) {
    setBusy(person.id);
    setError("");

    try {
      await updatePlatformTenantUser(tenantId, person.id, {
        is_active: !person.is_active,
      });
      await load();
      onChanged?.();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy("");
    }
  }



  return (
    <Modal
      title={data?.tenant?.name || "Detail rumah sakit"}
      description={
        data?.tenant
          ? `Kode ${data.tenant.code} · ${timezoneLabel(data.tenant.timezone)}`
          : "Memuat data rumah sakit..."
      }
      onClose={onClose}
      xl
      footer={
        <>
          {canManage && (
            <button
              className="btn btn-outline"
              type="button"
              onClick={() => navigate(`/platform/tenants/${tenantId}`)}
            >
              <i className="bi bi-sliders" aria-hidden="true" />
              Kelola data master
            </button>
          )}
          <button className="btn btn-subtle" type="button" onClick={onClose}>
            Tutup
          </button>
        </>
      }
    >
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

      {loading || !data ? (
        <div className="loading-state">
          <span className="spinner spinner--dark" role="status" />
          Memuat data...
        </div>
      ) : (
        <>
          <div className="meta-grid meta-grid--3">
            <CountField
              label="Status"
              value={<StatusLozenge active={data.tenant.is_active} />}
            />
            <CountField
              label="Zona waktu"
              value={timezoneLabel(data.tenant.timezone)}
            />
            <CountField label="Dibuat" value={formatDate(data.tenant.created)} />
          </div>

          <section className="form-section" style={{ marginTop: 24 }}>
            <div className="form-section-head">
              <div>
                <h2 className="form-section-title">Master data</h2>
                <p className="form-section-hint">
                  Unit, kategori, kebijakan SLA, dan hari libur yang dipakai tiket
                  rumah sakit ini.
                </p>
              </div>

              {canManage && (
                <button
                  className="btn btn-outline btn-sm"
                  type="button"
                  onClick={handleSeed}
                  disabled={busy === "seed"}
                >
                  {busy === "seed" ? (
                    <span className="spinner spinner--dark" aria-hidden="true" />
                  ) : (
                    <i className="bi bi-magic" aria-hidden="true" />
                  )}
                  Lengkapi data default
                </button>
              )}
            </div>

            <div className="meta-grid meta-grid--3" style={{ marginTop: 12 }}>
              <CountField label="Unit" value={data.counts.units} />
              <CountField label="Kategori" value={data.counts.categories} />
              <CountField label="Kebijakan SLA" value={data.counts.policies} />
              <CountField label="Tiket" value={data.counts.tickets} />
              <CountField label="Tiket aktif" value={data.counts.open_tickets} />
              <CountField label="Pengguna" value={data.counts.users} />
            </div>
          </section>

          <section className="form-section" style={{ marginTop: 24 }}>
            <div className="form-section-head">
              <div>
                <h2 className="form-section-title">Pengguna</h2>
                <p className="form-section-hint">
                  Akun staf rumah sakit. Role menentukan akses di ruang kerja
                  tenant ini.
                </p>
              </div>

              {canManage && (
                <button
                  className="btn btn-outline btn-sm"
                  type="button"
                  onClick={() => {
                    setShowUserForm((value) => !value);
                    userFormik.setStatus("");
                    userFormik.resetForm();
                  }}
                >
                  <i className="bi bi-person-plus" aria-hidden="true" />
                  Tambah pengguna
                </button>
              )}
            </div>

            {showUserForm && canManage && (
              <form
                className="admin-form"
                style={{ marginTop: 12 }}
                onSubmit={userFormik.handleSubmit}
              >
                {userError && (
                  <div className="alert alert--error" role="alert">
                    <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                    <div>{userError}</div>
                  </div>
                )}

                <div className="form-grid">
                  <div>
                    <label className="form-label" htmlFor="new-user-name">
                      Nama <span className="req">*</span>
                    </label>
                    <input
                      id="new-user-name"
                      className="input"
                      maxLength={120}
                      {...userFormik.getFieldProps("name")}
                      required
                    />
                  </div>

                  <div>
                    <label className="form-label" htmlFor="new-user-email">
                      Email <span className="req">*</span>
                    </label>
                    <input
                      id="new-user-email"
                      className="input"
                      type="email"
                      {...userFormik.getFieldProps("email")}
                      required
                    />
                  </div>
                </div>

                <div className="form-grid" style={{ marginTop: 12 }}>
                  <div>
                    <label className="form-label" htmlFor="new-user-role">
                      Role
                    </label>
                    <select
                      id="new-user-role"
                      className="select"
                      {...userFormik.getFieldProps("role")}
                    >
                      {ROLES.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="form-label" htmlFor="new-user-unit">
                      Unit
                    </label>
                    <select
                      id="new-user-unit"
                      className="select"
                      {...userFormik.getFieldProps("unit")}
                    >
                      <option value="">Tanpa unit</option>
                      {data.units.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.name} ({unit.code})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="field-row" style={{ marginTop: 12 }}>
                  <label className="form-label" htmlFor="new-user-job-title">
                    Jabatan
                  </label>
                  <input
                    id="new-user-job-title"
                    className="input"
                    list="platform-job-title-options"
                    maxLength={80}
                    placeholder="Programmer, Teknisi Jaringan, DBA, Admin SIMRS..."
                    {...userFormik.getFieldProps("job_title")}
                  />
                  <datalist id="platform-job-title-options">
                    {JOB_TITLE_OPTIONS.map((title) => (
                      <option key={title} value={title} />
                    ))}
                  </datalist>
                  <div className="hint">
                    Jabatan tidak mengubah hak akses; role tetap menentukan kewenangan.
                  </div>
                </div>

                <div className="field-row" style={{ marginTop: 12 }}>
                  <label className="form-label" htmlFor="new-user-team">
                    Tim
                  </label>
                  <select
                    id="new-user-team"
                    className="select"
                    {...userFormik.getFieldProps("team")}
                  >
                    <option value="">Tanpa tim</option>
                    {TEAM_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <div className="hint">
                    Teknisi melihat antrean tiket dari tim yang sama.
                  </div>
                </div>

                <div className="field-row" style={{ marginTop: 12 }}>
                  <label className="form-label" htmlFor="new-user-password">
                    Password awal <span className="req">*</span>
                  </label>
                  <input
                    id="new-user-password"
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    {...userFormik.getFieldProps("password")}
                    minLength={8}
                    required
                  />
                  <div className="hint">
                    Minimal 8 karakter. Sampaikan lewat kanal aman.
                  </div>
                </div>

                <div className="form-actions" style={{ marginTop: 12 }}>
                  <button
                    className="btn btn-subtle"
                    type="button"
                    onClick={() => setShowUserForm(false)}
                    disabled={userFormik.isSubmitting}
                  >
                    Batal
                  </button>
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={userFormik.isSubmitting}
                  >
                    {userFormik.isSubmitting ? (
                      <>
                        <span className="spinner" aria-hidden="true" />
                        Menyimpan...
                      </>
                    ) : (
                      "Simpan pengguna"
                    )}
                  </button>
                </div>
              </form>
            )}

            {pwdTarget && (
              <form
                className="admin-form"
                style={{ marginTop: 12 }}
                onSubmit={pwdFormik.handleSubmit}
              >
                <div className="form-section-head">
                  <div>
                    <h3 className="form-section-title">
                      Reset password {pwdTarget.name}
                    </h3>
                    <p className="form-section-hint">
                      Password lama tidak ditampilkan. Semua sesi pengguna ini
                      tetap berlaku sampai token kedaluwarsa.
                    </p>
                  </div>
                </div>

                {pwdError && (
                  <div className="alert alert--error" role="alert">
                    <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                    <div>{pwdError}</div>
                  </div>
                )}

                <div className="field-row">
                  <label className="form-label" htmlFor="reset-password">
                    Password baru <span className="req">*</span>
                  </label>
                  <input
                    id="reset-password"
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    {...pwdFormik.getFieldProps("password")}
                    minLength={8}
                    required
                  />
                </div>

                <div className="form-actions" style={{ marginTop: 12 }}>
                  <button
                    className="btn btn-subtle"
                    type="button"
                    onClick={() => {
                      setPwdTarget(null);
                      pwdFormik.resetForm();
                    }}
                    disabled={pwdFormik.isSubmitting}
                  >
                    Batal
                  </button>
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={pwdFormik.isSubmitting}
                  >
                    {pwdFormik.isSubmitting ? (
                      <>
                        <span className="spinner" aria-hidden="true" />
                        Menyimpan...
                      </>
                    ) : (
                      "Simpan password"
                    )}
                  </button>
                </div>
              </form>
            )}

            {data.users.length === 0 ? (
              <div className="muted" style={{ marginTop: 12 }}>
                Belum ada pengguna pada rumah sakit ini.
              </div>
            ) : (
              <div className="issue-table-wrap" style={{ marginTop: 12 }}>
                <table className="issue-table admin-table is-compact">
                  <thead>
                    <tr>
                      <th>Pengguna</th>
                      <th>Role</th>
                      <th>Jabatan</th>
                      <th>Tim</th>
                      <th>Unit</th>
                      <th className="col-status">Status</th>
                      {canManage && <th className="col-actions">Aksi</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map((person) => (
                      <tr
                        key={person.id}
                        className={person.is_active ? "" : "is-inactive"}
                      >
                        <td>
                          <span className="admin-name">{person.name}</span>
                          <div className="admin-sub">{person.email}</div>
                        </td>
                        <td>{tenantRoleLabel(person.role)}</td>
                        <td>
                          {person.job_title || (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          {person.team ? (
                            teamLabel(person.team)
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          {person.unit_name || (
                            <span className="muted">Tanpa unit</span>
                          )}
                        </td>
                        <td className="col-status">
                          <StatusLozenge active={person.is_active} />
                        </td>
                        {canManage && (
                          <td className="col-actions">
                            <div className="admin-actions">
                              <button
                                className="btn btn-subtle btn-sm"
                                type="button"
                                disabled={busy === person.id}
                                onClick={() => toggleUser(person)}
                              >
                                {busy === person.id ? (
                                  <span
                                    className="spinner spinner--dark"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <i
                                    className={`bi ${
                                      person.is_active
                                        ? "bi-pause-circle"
                                        : "bi-play-circle"
                                    }`}
                                    aria-hidden="true"
                                  />
                                )}
                                {person.is_active ? "Nonaktifkan" : "Aktifkan"}
                              </button>
                              <button
                                className="btn btn-subtle btn-sm"
                                type="button"
                                onClick={() => {
                                  setPwdTarget(person);
                                  pwdFormik.setStatus("");
                                  pwdFormik.resetForm();
                                  setNotice("");
                                }}
                              >
                                <i className="bi bi-key" aria-hidden="true" />
                                Reset password
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </Modal>
  );
}
