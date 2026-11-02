import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../../components/ui/PageHeader";
import EmptyState from "../../../components/ui/EmptyState";
import Modal from "../../../components/ui/Modal";
import { useAuth } from "../../../app/providers/AuthProvider";
import { useMeta } from "../../../app/providers/MetaProvider";
import { useTenant } from "../../../app/providers/TenantProvider";
import { formatDate } from "../../../lib/format";
import { isPlatformAdmin, tenantRoleLabel } from "../../../lib/permissions";
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

const TIMEZONES = [
  ["Asia/Jakarta", "WIB · Asia/Jakarta"],
  ["Asia/Makassar", "WITA · Asia/Makassar"],
  ["Asia/Jayapura", "WIT · Asia/Jayapura"],
];

const ROLES = [
  ["requester", "Requester"],
  ["it_support", "IT Support"],
  ["it_lead", "IT Lead"],
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
  unit: "",
  password: "",
};

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

  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({
    tenants: 0,
    active: 0,
    users: 0,
    open_tickets: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    code: "",
    timezone: "Asia/Jakarta",
    is_active: true,
  });
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [detailId, setDetailId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const payload = await fetchPlatformTenants();
      setItems(payload.items || []);
      setSummary(payload.summary || {});
    } catch (err) {
      setError(getErrorMessage(err));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = "Konsol Vendor · Healthcare ITSM";
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;

    return items.filter(
      (tenant) =>
        tenant.name.toLowerCase().includes(needle) ||
        tenant.code.toLowerCase().includes(needle)
    );
  }, [items, query]);

  function setCreateField(key, value) {
    setCreateForm((current) => ({ ...current, [key]: value }));
  }

  function openCreate() {
    setCreateForm(EMPTY_CREATE);
    setCreateError("");
    setNotice("");
    setCreateOpen(true);
  }

  function openEdit(tenant) {
    setEditForm({
      name: tenant.name,
      code: tenant.code,
      timezone: tenant.timezone || "Asia/Jakarta",
      is_active: Boolean(tenant.is_active),
    });
    setEditError("");
    setNotice("");
    setEditTarget(tenant);
  }

  async function submitCreate(event) {
    event.preventDefault();
    setCreateError("");

    const name = createForm.name.trim();
    const code = createForm.code.trim().toUpperCase();
    const adminEmail = createForm.admin_email.trim();
    const adminPassword = createForm.admin_password;
    const hasAdmin = Boolean(adminEmail || adminPassword || createForm.admin_name.trim());

    if (name.length < 2) {
      setCreateError("Nama rumah sakit minimal 2 karakter.");
      return;
    }
    if (!CODE_PATTERN.test(code)) {
      setCreateError(
        "Kode 2–20 karakter: huruf, angka, titik, garis bawah, atau strip."
      );
      return;
    }
    if (hasAdmin && (!adminEmail || !adminPassword)) {
      setCreateError("Email dan password akun pertama harus diisi bersamaan.");
      return;
    }
    if (hasAdmin && adminPassword.length < 8) {
      setCreateError("Password akun pertama minimal 8 karakter.");
      return;
    }
    if (hasAdmin && !EMAIL_PATTERN.test(adminEmail)) {
      setCreateError("Email akun pertama tidak valid.");
      return;
    }

    setCreating(true);

    try {
      const payload = {
        name,
        code,
        timezone: createForm.timezone,
        seed_master: createForm.seed_master,
      };

      if (hasAdmin) {
        payload.admin = {
          name: createForm.admin_name.trim() || undefined,
          email: adminEmail,
          password: adminPassword,
        };
      }

      const result = await createPlatformTenant(payload);

      setCreateOpen(false);
      setCreateForm(EMPTY_CREATE);
      setNotice(
        `${result.tenant.name} (${result.tenant.code}) dibuat${
          result.seed ? ` dengan ${result.seed.units} unit dan ${result.seed.policies} kebijakan SLA` : ""
        }.`
      );

      await load();
      reloadTenants();
    } catch (err) {
      setCreateError(getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  async function submitEdit(event) {
    event.preventDefault();
    setEditError("");

    const name = editForm.name.trim();
    const code = editForm.code.trim().toUpperCase();

    if (name.length < 2) {
      setEditError("Nama rumah sakit minimal 2 karakter.");
      return;
    }
    if (!CODE_PATTERN.test(code)) {
      setEditError(
        "Kode 2–20 karakter: huruf, angka, titik, garis bawah, atau strip."
      );
      return;
    }

    setEditSaving(true);

    try {
      await updatePlatformTenant(editTarget.id, {
        name,
        code,
        timezone: editForm.timezone,
        is_active: editForm.is_active,
      });

      setEditTarget(null);
      setNotice(`${name} diperbarui.`);
      await load();
      reloadTenants();
    } catch (err) {
      setEditError(getErrorMessage(err));
    } finally {
      setEditSaving(false);
    }
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

      <div className="list-toolbar">
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
          {loading ? "Memuat..." : `${filtered.length} rumah sakit`}
        </span>
      </div>

      <div className="list-panel">
        {loading ? (
          <div className="admin-loading">
            <span className="spinner spinner--dark" role="status" />
            Memuat rumah sakit...
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="bi-buildings"
            title={items.length === 0 ? "Belum ada rumah sakit" : "Tidak ada hasil"}
            description={
              items.length === 0
                ? "Tambahkan rumah sakit pertama untuk mulai mengelola tenant."
                : "Ubah kata kunci pencarian untuk menemukan rumah sakit lain."
            }
            action={
              items.length === 0 && canManage && isVendor ? (
                <button className="btn btn-primary" type="button" onClick={openCreate}>
                  <i className="bi bi-plus-lg" aria-hidden="true" />
                  Tambah rumah sakit
                </button>
              ) : null
            }
          />
        ) : (
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
                    <td className="col-code">{timezoneLabel(tenant.timezone)}</td>
                    <td className="col-num">{tenant.counts?.users ?? 0}</td>
                    <td className="col-num">{tenant.counts?.open_tickets ?? 0}</td>
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
          onClose={() => (creating ? null : setCreateOpen(false))}
          wide
          footer={
            <>
              <button
                className="btn btn-subtle"
                type="button"
                onClick={() => setCreateOpen(false)}
                disabled={creating}
              >
                Batal
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                form="platform-create-form"
                disabled={creating}
              >
                {creating ? (
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
          <form id="platform-create-form" className="admin-form" onSubmit={submitCreate}>
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
                value={createForm.name}
                onChange={(event) => setCreateField("name", event.target.value)}
                maxLength={120}
                placeholder="Contoh: RSUD Kota Bandung"
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
                  value={createForm.code}
                  onChange={(event) => setCreateField("code", event.target.value)}
                  maxLength={20}
                  placeholder="Contoh: RSUD-BDG"
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
                  value={createForm.timezone}
                  onChange={(event) =>
                    setCreateField("timezone", event.target.value)
                  }
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
                checked={createForm.seed_master}
                onChange={(event) =>
                  setCreateField("seed_master", event.target.checked)
                }
              />
              <span>
                Lengkapi data master default (10 unit, 9 kategori, 12 kebijakan
                SLA, 3 hari libur)
              </span>
            </label>

            <section className="form-section" style={{ marginTop: 24 }}>
              <h2 className="form-section-title">Akun IT pertama (opsional)</h2>
              <p className="form-section-hint">
                Buat akun IT Lead agar rumah sakit ini bisa langsung dipakai.
                Kosongkan bila akun akan dibuat belakangan.
              </p>

              <div className="field-row">
                <label className="form-label" htmlFor="tenant-admin-name">
                  Nama
                </label>
                <input
                  id="tenant-admin-name"
                  className="input"
                  value={createForm.admin_name}
                  onChange={(event) =>
                    setCreateField("admin_name", event.target.value)
                  }
                  maxLength={120}
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
                    value={createForm.admin_email}
                    onChange={(event) =>
                      setCreateField("admin_email", event.target.value)
                    }
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
                    value={createForm.admin_password}
                    onChange={(event) =>
                      setCreateField("admin_password", event.target.value)
                    }
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
          onClose={() => (editSaving ? null : setEditTarget(null))}
          footer={
            <>
              <button
                className="btn btn-subtle"
                type="button"
                onClick={() => setEditTarget(null)}
                disabled={editSaving}
              >
                Batal
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                form="platform-edit-form"
                disabled={editSaving}
              >
                {editSaving ? (
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
          <form id="platform-edit-form" className="admin-form" onSubmit={submitEdit}>
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
                value={editForm.name}
                onChange={(event) =>
                  setEditForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                maxLength={120}
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
                  value={editForm.code}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      code: event.target.value,
                    }))
                  }
                  maxLength={20}
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
                  value={editForm.timezone}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      timezone: event.target.value,
                    }))
                  }
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
                checked={editForm.is_active}
                onChange={(event) =>
                  setEditForm((current) => ({
                    ...current,
                    is_active: event.target.checked,
                  }))
                }
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
  const [userForm, setUserForm] = useState(EMPTY_USER);
  const [userError, setUserError] = useState("");
  const [savingUser, setSavingUser] = useState(false);

  const [pwdTarget, setPwdTarget] = useState(null);
  const [pwdValue, setPwdValue] = useState("");
  const [pwdError, setPwdError] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);

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

  async function submitUser(event) {
    event.preventDefault();
    setUserError("");

    const name = userForm.name.trim();
    const email = userForm.email.trim();

    if (name.length < 2) {
      setUserError("Nama minimal 2 karakter.");
      return;
    }
    if (!EMAIL_PATTERN.test(email)) {
      setUserError("Email tidak valid.");
      return;
    }
    if (userForm.password.length < 8) {
      setUserError("Password minimal 8 karakter.");
      return;
    }

    setSavingUser(true);

    try {
      await createPlatformTenantUser(tenantId, {
        name,
        email,
        role: userForm.role,
        unit: userForm.unit || undefined,
        password: userForm.password,
      });

      setUserForm(EMPTY_USER);
      setShowUserForm(false);
      setNotice("Pengguna baru dibuat.");
      await load();
      onChanged?.();
    } catch (err) {
      setUserError(getErrorMessage(err));
    } finally {
      setSavingUser(false);
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

  async function submitPassword(event) {
    event.preventDefault();
    setPwdError("");

    if (pwdValue.length < 8) {
      setPwdError("Password baru minimal 8 karakter.");
      return;
    }

    setPwdSaving(true);

    try {
      await updatePlatformTenantUser(tenantId, pwdTarget.id, {
        password: pwdValue,
      });
      setPwdTarget(null);
      setPwdValue("");
      setNotice(`Password ${pwdTarget.name} direset.`);
    } catch (err) {
      setPwdError(getErrorMessage(err));
    } finally {
      setPwdSaving(false);
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
        <div className="admin-loading">
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
                    setUserError("");
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
                onSubmit={submitUser}
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
                      value={userForm.name}
                      onChange={(event) =>
                        setUserForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      maxLength={120}
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
                      value={userForm.email}
                      onChange={(event) =>
                        setUserForm((current) => ({
                          ...current,
                          email: event.target.value,
                        }))
                      }
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
                      value={userForm.role}
                      onChange={(event) =>
                        setUserForm((current) => ({
                          ...current,
                          role: event.target.value,
                        }))
                      }
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
                      value={userForm.unit}
                      onChange={(event) =>
                        setUserForm((current) => ({
                          ...current,
                          unit: event.target.value,
                        }))
                      }
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
                  <label className="form-label" htmlFor="new-user-password">
                    Password awal <span className="req">*</span>
                  </label>
                  <input
                    id="new-user-password"
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    value={userForm.password}
                    onChange={(event) =>
                      setUserForm((current) => ({
                        ...current,
                        password: event.target.value,
                      }))
                    }
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
                    disabled={savingUser}
                  >
                    Batal
                  </button>
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={savingUser}
                  >
                    {savingUser ? (
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
                onSubmit={submitPassword}
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
                    value={pwdValue}
                    onChange={(event) => setPwdValue(event.target.value)}
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
                      setPwdValue("");
                      setPwdError("");
                    }}
                    disabled={pwdSaving}
                  >
                    Batal
                  </button>
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={pwdSaving}
                  >
                    {pwdSaving ? (
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
                                  setPwdValue("");
                                  setPwdError("");
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
