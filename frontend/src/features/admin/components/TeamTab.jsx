import { useCallback, useEffect, useState } from "react";
import EmptyState from "../../../components/ui/EmptyState";
import Modal from "../../../components/ui/Modal";
import Pagination from "../../../components/ui/Pagination";
import { TableSkeleton } from "../../../components/ui/Skeleton";
import { formatDateTime } from "../../../lib/format";
import { roleLabel } from "../../../lib/permissions";
import { TEAM_OPTIONS, teamLabel } from "../../../lib/teams";
import {
  createTeamMember,
  fetchMailStatus,
  fetchTeam,
  getErrorMessage,
  importTeamCsv,
  resetTeamPassword,
  resetTeamTwoFactor,
  unlockTeamMember,
  updateTeamMember,
} from "../../../lib/api";
import { usePagedEndpoint, useDebouncedValue } from "../../../lib/pagedList";
import { formErrorText, useAppForm } from "../../../lib/formik";

const ROLE_OPTIONS = [
  ["requester", "Pemohon"],
  ["it_support", "Staff IT"],
  ["resolver", "Teknisi"],
  ["it_lead", "Kepala IT"],
  ["viewer", "Pengamat"],
];

const EMPTY_FORM = {
  name: "",
  email: "",
  role: "it_support",
  job_title: "",
  team: "",
  unit: "",
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

const IMPORT_TEMPLATE = [
  "nama,email,role,unit,tim",
  '"Budi Santoso",budi.santoso@rs.example,Pemohon,IGD,Service Desk',
  '"Siti Aminah",siti.aminah@rs.example,Staff IT,IT,Service Desk',
].join("\r\n");

function roleLabelOf(role) {
  const found = ROLE_OPTIONS.find(([value]) => value === role);
  return found ? found[1] : role;
}

function csvCell(value) {
  const text = String(value == null ? "" : value);

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

// PocketBase mengirim tanggal dengan spasi; Safari menolak format itu.
function parseLockDate(value) {
  if (!value) return null;
  const date = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isLockedRecord(record) {
  const until = parseLockDate(record?.login_locked_until);
  return Boolean(until && until.getTime() > Date.now());
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

export default function TeamTab({ units, currentUser }) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");

  const debouncedQuery = useDebouncedValue(query, 350);
  const fetchPage = useCallback((params) => fetchTeam(params), []);
  const list = usePagedEndpoint(fetchPage, debouncedQuery);

  // Pencarian berubah -> kembali ke halaman pertama.
  useEffect(() => {
    list.setPage(1);
  }, [debouncedQuery, list.setPage]);

  const activeLeadCount = Number(list.raw?.active_lead_count ?? 0);

  const [modal, setModal] = useState(null);
  const [busyId, setBusyId] = useState("");

  const formik = useAppForm({
    initialValues: { ...EMPTY_FORM },
    validate: (values) => {
      const errors = {};
      const name = values.name.trim();
      const email = values.email.trim();

      if (name.length < 2) errors.name = "Nama minimal 2 karakter.";
      if (!modal?.record && !/^\S+@\S+\.\S+$/.test(email)) {
        errors.email = "Email tidak valid.";
      }
      return errors;
    },
    onSubmit: async (values, helpers) => {
      helpers.setStatus("");
      const name = values.name.trim();
      const email = values.email.trim();

      try {
        if (modal.record) {
          await updateTeamMember(modal.record.id, {
            name,
            role: values.role,
            job_title: values.job_title.trim(),
            team: values.team,
            unit: values.unit,
          });
          setNotice("Perubahan disimpan.");
          setModal(null);
        } else {
          const created = await createTeamMember({
            name,
            email,
            role: values.role,
            job_title: values.job_title.trim() || undefined,
            team: values.team || undefined,
            unit: values.unit || undefined,
          });

          setModal(null);
          setNotice("Anggota tim dibuat.");
          setSecret({
            title: "Password awal",
            name: created.user.name,
            email: created.user.email,
            password: created.password,
            delivery: created.email || null,
          });
        }

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

  const [secret, setSecret] = useState(null);
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(null);
  const [mail, setMail] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState("");
  const [importResult, setImportResult] = useState(null);
  const [security, setSecurity] = useState(null);
  const [securityBusy, setSecurityBusy] = useState("");
  const [securityError, setSecurityError] = useState("");
  const [securityNotice, setSecurityNotice] = useState("");

  const load = useCallback(async () => {
    list.reload();
  }, [list.reload]);

  useEffect(() => {
    let active = true;

    fetchMailStatus()
      .then((data) => {
        if (active) setMail(data);
      })
      .catch(() => {
        if (active) setMail(null);
      });

    return () => {
      active = false;
    };
  }, []);

  function openCreate() {
    formik.setStatus("");
    formik.resetForm();
    setModal({ record: null });
  }

  function openEdit(record) {
    formik.setStatus("");
    formik.setValues({
      name: record.name,
      email: record.email,
      role: record.role,
      job_title: record.job_title || "",
      team: record.team || "",
      unit: record.unit || "",
    });
    setModal({ record });
  }

  async function handleReset(record) {
    setBusyId(record.id);
    setError("");
    setNotice("");

    try {
      const reset = await resetTeamPassword(record.id);
      setSecret({
        title: "Password baru",
        name: reset.user.name,
        email: reset.user.email,
        password: reset.password,
        delivery: reset.email || null,
      });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId("");
    }
  }

  // Reset password hanya berjalan setelah lead mengonfirmasi di dialog, agar
  // tidak terpicu karena salah klik kolom aksi.
  async function handleConfirmReset() {
    if (!confirmReset) return;

    await handleReset(confirmReset);
    setConfirmReset(null);
  }

  async function toggleActive(record) {
    setBusyId(record.id);
    setError("");
    setNotice("");

    try {
      await updateTeamMember(record.id, { is_active: !record.is_active });
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

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(secret.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  function openImport() {
    setImportError("");
    setImportFile(null);
    setImportResult(null);
    setImportOpen(true);
  }

  function closeImport() {
    if (importBusy) return;
    setImportOpen(false);
    setImportFile(null);
    setImportResult(null);
    setImportError("");
  }

  async function submitImport() {
    if (!importFile) {
      setImportError("Pilih berkas CSV lebih dulu.");
      return;
    }

    setImportBusy(true);
    setImportError("");

    try {
      const result = await importTeamCsv(importFile);
      setImportResult(result);

      if (result.summary.imported > 0) {
        setNotice(
          `${result.summary.imported} anggota diimpor dari ${result.file_name}.`
        );
        await load();
      }
    } catch (err) {
      setImportError(getErrorMessage(err));
    } finally {
      setImportBusy(false);
    }
  }

  function downloadTemplate() {
    downloadTextFile(
      "template-anggota.csv",
      "\uFEFF" + IMPORT_TEMPLATE + "\r\n"
    );
  }

  function openSecurity(record) {
    setSecurity(record);
    setSecurityError("");
    setSecurityNotice("");
  }

  function closeSecurity() {
    if (securityBusy) return;
    setSecurity(null);
    setSecurityError("");
    setSecurityNotice("");
  }

  async function handleResetTwoFactor() {
    if (!security) return;

    setSecurityBusy("2fa");
    setSecurityError("");
    setSecurityNotice("");

    try {
      const data = await resetTeamTwoFactor(security.id);
      setSecurity(data.user);
      setSecurityNotice(
        "2FA direset. Kode pemulihan lama tidak berlaku dan sesi pengguna berakhir."
      );
      setNotice(`2FA ${data.user.name} direset.`);
      await load();
    } catch (err) {
      setSecurityError(getErrorMessage(err));
    } finally {
      setSecurityBusy("");
    }
  }

  async function handleUnlock() {
    if (!security) return;

    setSecurityBusy("unlock");
    setSecurityError("");
    setSecurityNotice("");

    try {
      const data = await unlockTeamMember(security.id);
      setSecurity(data.user);
      setSecurityNotice("Kunci akun dibuka. Pengguna dapat mencoba masuk lagi.");
      setNotice(`Akun ${data.user.name} dibuka.`);
      await load();
    } catch (err) {
      setSecurityError(getErrorMessage(err));
    } finally {
      setSecurityBusy("");
    }
  }

  // Password awal hanya ada di memori setelah impor; unduhan ini satu-satunya
  // cara menyerahkannya ke banyak staf sekaligus.
  function downloadCredentials() {
    if (!importResult) return;

    const lines = ["nama,email,role,unit,tim,password"];

    for (const item of importResult.imported) {
      lines.push(
        [
          item.name,
          item.email,
          roleLabelOf(item.role),
          item.unit_name || "",
          item.team ? teamLabel(item.team) : "",
          item.password,
        ]
          .map(csvCell)
          .join(",")
      );
    }

    downloadTextFile(
      `kredensial-import-${new Date().toISOString().slice(0, 10)}.csv`,
      "\uFEFF" + lines.join("\r\n") + "\r\n"
    );
  }

  const securityLocked = isLockedRecord(security);
  const securityCanReset = Boolean(
    security && security.totp_enabled && security.id !== currentUser?.id
  );

  return (
    <>
      <div className="filter-bar">
        <div className="search-box">
          <i className="bi bi-search" aria-hidden="true" />
          <input
            className="input"
            type="search"
            placeholder="Cari nama atau email anggota"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Cari anggota tim"
          />
        </div>
        <span className="list-count">
          {list.loading ? "Memuat..." : `${list.totalItems} anggota`}
        </span>
        <button className="btn btn-outline btn-sm" type="button" onClick={openImport}>
          <i className="bi bi-file-earmark-arrow-up" aria-hidden="true" />
          Impor CSV
        </button>
        <button className="btn btn-primary btn-sm" type="button" onClick={openCreate}>
          <i className="bi bi-person-plus" aria-hidden="true" />
          Tambah anggota
        </button>
      </div>

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

      <div className="list-panel admin-panel">
        {list.loading ? (
          <TableSkeleton rows={5} />
        ) : list.items.length === 0 ? (
          <EmptyState
            icon="bi-people"
            title={
              debouncedQuery.trim()
                ? "Tidak ada anggota yang cocok"
                : "Belum ada anggota tim"
            }
            description={
              debouncedQuery.trim()
                ? "Ubah kata kunci pencarian untuk melihat anggota lain."
                : "Tambahkan staf IT pertama untuk rumah sakit ini."
            }
            action={
              debouncedQuery.trim() ? (
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() => setQuery("")}
                >
                  Reset pencarian
                </button>
              ) : (
                <button className="btn btn-primary" type="button" onClick={openCreate}>
                  <i className="bi bi-person-plus" aria-hidden="true" />
                  Tambah anggota
                </button>
              )
            }
          />
        ) : (
          <>
            <div className="issue-table-wrap">
              <table className="issue-table admin-table is-compact">
                <thead>
                  <tr>
                    <th>Nama</th>
                    <th>Role</th>
                    <th>Jabatan</th>
                    <th>Tim</th>
                    <th>Unit</th>
                    <th className="col-status">Status</th>
                    <th className="col-actions">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {list.items.map((record) => {
                    const self = record.id === currentUser?.id;
                    const lastLead =
                      record.role === "it_lead" &&
                      record.is_active &&
                      activeLeadCount === 1;

                    return (
                      <tr
                        key={record.id}
                        className={record.is_active ? "" : "is-inactive"}
                      >
                      <td>
                        <span className="admin-name">{record.name}</span>
                        <div className="admin-sub">
                          {record.email}
                          {self ? " · Anda" : ""}
                        </div>
                      </td>
                      <td>{roleLabel({ role: record.role })}</td>
                      <td>
                        {record.job_title || (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        {record.team ? (
                          teamLabel(record.team)
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        {record.unit_name || (
                          <span className="muted">Tanpa unit</span>
                        )}
                      </td>
                      <td className="col-status">
                        <ActiveLozenge active={record.is_active} />
                        <div className="status-badges">
                          {record.totp_enabled && (
                            <span className="lozenge lozenge--2fa" title="2FA aktif">
                              <i
                                className="bi bi-shield-check"
                                aria-hidden="true"
                              />
                              2FA
                            </span>
                          )}
                          {isLockedRecord(record) && (
                            <span
                              className="lozenge lozenge--locked"
                              title={`Terkunci sampai ${formatDateTime(
                                record.login_locked_until
                              )}`}
                            >
                              <i className="bi bi-lock" aria-hidden="true" />
                              Terkunci
                            </span>
                          )}
                        </div>
                      </td>
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
                            onClick={() => setConfirmReset(record)}
                          >
                            <i className="bi bi-key" aria-hidden="true" />
                            Reset password
                          </button>
                          <button
                            className="btn btn-subtle btn-sm"
                            type="button"
                            onClick={() => openSecurity(record)}
                          >
                            <i className="bi bi-shield-lock" aria-hidden="true" />
                            Keamanan
                          </button>
                          <button
                            className="btn btn-subtle btn-sm"
                            type="button"
                            disabled={
                              busyId === record.id ||
                              (self && record.is_active) ||
                              (lastLead && record.is_active)
                            }
                            title={
                              self && record.is_active
                                ? "Tidak dapat menonaktifkan akun sendiri"
                                : lastLead && record.is_active
                                  ? "Tidak dapat menonaktifkan Kepala IT aktif terakhir"
                                  : undefined
                            }
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
                      </td>
                    </tr>
                  );
                })}
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
              label="anggota"
            />
          </>
        )}
      </div>

      <p className="admin-note">
        <i className="bi bi-info-circle" aria-hidden="true" />
        Password awal dibuat sistem dan hanya ditampilkan sekali. Anggota wajib
        mengganti password saat pertama kali masuk.
      </p>

      <p className="admin-note">
        <i
          className={`bi ${
            mail?.configured ? "bi-envelope-check" : "bi-envelope-slash"
          }`}
          aria-hidden="true"
        />
        {mail?.transport === "capture"
          ? "Mode capture email aktif: undangan tidak benar-benar dikirim, hanya dicatat untuk pemeriksaan."
          : mail?.configured
            ? `Email undangan aktif melalui ${mail.host}:${mail.port}.`
            : "SMTP belum dikonfigurasi. Undangan email tidak dikirim; serahkan password awal secara manual."}
        {mail?.queued > 0
          ? ` ${mail.queued} email notifikasi menunggu dikirim.`
          : ""}
        {mail?.failed > 0 ? ` ${mail.failed} email gagal dikirim.` : ""}
      </p>

      {modal && (
        <Modal
          title={modal.record ? `Edit ${modal.record.name}` : "Tambah anggota tim"}
          description={
            modal.record
              ? "Perubahan berlaku langsung pada akun ini."
              : "Akun dibuat dengan password acak yang wajib diganti saat login pertama."
          }
          onClose={() => (formik.isSubmitting ? null : setModal(null))}
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
                form="team-form"
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
          <form id="team-form" className="admin-form" onSubmit={formik.handleSubmit}>
            {formError && (
              <div className="alert alert--error" role="alert">
                <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                <div>{formError}</div>
              </div>
            )}

            <div className="field-row">
              <label className="form-label" htmlFor="team-name">
                Nama <span className="req">*</span>
              </label>
              <input
                id="team-name"
                className="input"
                maxLength={120}
                {...formik.getFieldProps("name")}
                required
              />
            </div>

            <div className="field-row" style={{ marginTop: 16 }}>
              <label className="form-label" htmlFor="team-email">
                Email <span className="req">*</span>
              </label>
              <input
                id="team-email"
                className="input"
                type="email"
                {...formik.getFieldProps("email")}
                disabled={Boolean(modal.record)}
                required
              />
              {modal.record && (
                <div className="hint">Email tidak dapat diubah setelah dibuat.</div>
              )}
            </div>

            <div className="form-grid" style={{ marginTop: 16 }}>
              <div>
                <label className="form-label" htmlFor="team-role">
                  Role
                </label>
                <select
                  id="team-role"
                  className="select"
                  {...formik.getFieldProps("role")}
                >
                  {ROLE_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label" htmlFor="team-unit">
                  Unit
                </label>
                <select
                  id="team-unit"
                  className="select"
                  {...formik.getFieldProps("unit")}
                >
                  <option value="">Tanpa unit</option>
                  {(units || [])
                    .filter((unit) => unit.is_active)
                    .map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="field-row" style={{ marginTop: 16 }}>
              <label className="form-label" htmlFor="team-job-title">
                Jabatan
              </label>
              <input
                id="team-job-title"
                className="input"
                list="team-job-title-options"
                maxLength={80}
                placeholder="Programmer, Teknisi Jaringan, DBA, Admin SIMRS..."
                {...formik.getFieldProps("job_title")}
              />
              <datalist id="team-job-title-options">
                {JOB_TITLE_OPTIONS.map((title) => (
                  <option key={title} value={title} />
                ))}
              </datalist>
              <div className="hint">
                Jabatan tidak mengubah hak akses; role tetap menentukan kewenangan.
              </div>
            </div>

            <div className="field-row" style={{ marginTop: 16 }}>
              <label className="form-label" htmlFor="team-division">
                Tim
              </label>
              <select
                id="team-division"
                className="select"
                {...formik.getFieldProps("team")}
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
          </form>
        </Modal>
      )}

      {security && (
        <Modal
          title="Keamanan akun"
          description={`${security.name} · ${security.email}`}
          onClose={closeSecurity}
          footer={
            <button
              className="btn btn-primary"
              type="button"
              onClick={closeSecurity}
              disabled={Boolean(securityBusy)}
            >
              Selesai
            </button>
          }
        >
          {securityError && (
            <div className="alert alert--error" role="alert">
              <i className="bi bi-exclamation-triangle" aria-hidden="true" />
              <div>{securityError}</div>
            </div>
          )}

          {securityNotice && (
            <div className="alert alert--success" role="status">
              <i className="bi bi-check-circle" aria-hidden="true" />
              <div>{securityNotice}</div>
            </div>
          )}

          <div className="security-status">
            <div className="security-status-row">
              <span>Autentikasi dua faktor</span>
              <strong>{security.totp_enabled ? "Aktif" : "Nonaktif"}</strong>
            </div>
            <div className="security-status-row">
              <span>Status login</span>
              <strong>
                {securityLocked
                  ? `Terkunci sampai ${formatDateTime(
                      security.login_locked_until
                    )}`
                  : Number(security.login_failed_count || 0) > 0
                    ? `${security.login_failed_count} percobaan gagal`
                    : "Normal"}
              </strong>
            </div>
          </div>

          {securityCanReset && (
            <div className="security-action-box">
              <div>
                <strong>Reset 2FA</strong>
                <p className="hint">
                  Menghapus secret dan kode pemulihan, lalu mengakhiri semua sesi
                  pengguna. Pengguna harus mendaftar ulang 2FA setelah masuk.
                </p>
              </div>
              <button
                className="btn btn-outline-danger btn-sm"
                type="button"
                disabled={Boolean(securityBusy)}
                onClick={handleResetTwoFactor}
              >
                {securityBusy === "2fa" ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    Mereset...
                  </>
                ) : (
                  <>
                    <i className="bi bi-shield-slash" aria-hidden="true" />
                    Reset 2FA
                  </>
                )}
              </button>
            </div>
          )}

          {security.id === currentUser?.id && security.totp_enabled && (
            <p className="hint">
              Anda tidak dapat mereset 2FA akun sendiri dari sini. Gunakan panel
              Keamanan di halaman Profil saya.
            </p>
          )}

          {securityLocked && (
            <div className="security-action-box">
              <div>
                <strong>Buka kunci akun</strong>
                <p className="hint">
                  Menghapus hitungan percobaan gagal agar pengguna dapat masuk
                  lagi tanpa menunggu masa kunci berakhir.
                </p>
              </div>
              <button
                className="btn btn-outline btn-sm"
                type="button"
                disabled={Boolean(securityBusy)}
                onClick={handleUnlock}
              >
                {securityBusy === "unlock" ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    Membuka...
                  </>
                ) : (
                  <>
                    <i className="bi bi-unlock" aria-hidden="true" />
                    Buka kunci
                  </>
                )}
              </button>
            </div>
          )}

          {!securityCanReset &&
            !securityLocked &&
            !(security.id === currentUser?.id && security.totp_enabled) && (
              <p className="hint">
                Tidak ada tindakan keamanan yang diperlukan untuk akun ini.
              </p>
            )}
        </Modal>
      )}

      {confirmReset && (
        <Modal
          title="Reset password anggota?"
          description={`${confirmReset.name} · ${confirmReset.email}`}
          onClose={() => (busyId ? null : setConfirmReset(null))}
          footer={
            <>
              <button
                className="btn btn-subtle"
                type="button"
                onClick={() => setConfirmReset(null)}
                disabled={Boolean(busyId)}
              >
                Batal
              </button>
              <button
                className="btn btn-danger"
                type="button"
                onClick={handleConfirmReset}
                disabled={Boolean(busyId)}
              >
                {busyId === confirmReset.id ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    Mereset...
                  </>
                ) : (
                  <>
                    <i className="bi bi-key" aria-hidden="true" />
                    Ya, reset password
                  </>
                )}
              </button>
            </>
          }
        >
          <div className="alert alert--warning" role="alert">
            <i className="bi bi-exclamation-triangle" aria-hidden="true" />
            <div>
              Password lama akan langsung tidak berlaku dan sesi anggota ini
              berakhir. Password baru hanya ditampilkan sekali setelah reset.
            </div>
          </div>

          <p className="hint" style={{ marginTop: 4 }}>
            Anggota wajib mengganti password baru saat login berikutnya.
          </p>
        </Modal>
      )}

      {importOpen && !importResult && (
        <Modal
          title="Impor anggota dari CSV"
          description="Buat akun banyak staf sekaligus dari satu berkas. Setiap baris divalidasi sendiri; baris yang gagal tidak dibuat."
          wide
          onClose={closeImport}
          footer={
            <>
              <button
                className="btn btn-subtle"
                type="button"
                onClick={closeImport}
                disabled={importBusy}
              >
                Batal
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={submitImport}
                disabled={importBusy || !importFile}
              >
                {importBusy ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    Mengimpor...
                  </>
                ) : (
                  "Impor sekarang"
                )}
              </button>
            </>
          }
        >
          {importError && (
            <div className="alert alert--error" role="alert">
              <i className="bi bi-exclamation-triangle" aria-hidden="true" />
              <div>{importError}</div>
            </div>
          )}

          <div className="alert alert--info" role="status">
            <i className="bi bi-info-circle" aria-hidden="true" />
            <div>
              Format kolom: <strong>nama, email, role, unit, tim</strong>{" "}
              (opsional: jabatan). Role boleh ditulis Pemohon, Staff IT,
              Teknisi, Kepala IT, atau Pengamat. Unit diisi nama atau kode unit;
              tim boleh kosong. Email yang sudah terdaftar akan ditolak.
            </div>
          </div>

          <div className="import-template-bar">
            <button
              className="btn btn-subtle btn-sm"
              type="button"
              onClick={downloadTemplate}
            >
              <i className="bi bi-download" aria-hidden="true" />
              Unduh template CSV
            </button>
            <span className="hint">Maksimal 1.000 baris per berkas (2 MB).</span>
          </div>

          <label className="file-input" style={{ marginTop: 12 }}>
            <input
              id="team-import-file"
              type="file"
              className="visually-hidden"
              accept=".csv,text/csv"
              onChange={(event) => {
                setImportError("");
                setImportFile(event.target.files?.[0] || null);
              }}
            />
            <span className="btn btn-outline btn-sm">
              <i className="bi bi-file-earmark-arrow-up" aria-hidden="true" />
              Pilih berkas
            </span>
            <span className="file-input-name">
              {importFile ? importFile.name : "Belum ada berkas dipilih"}
            </span>
          </label>

          <p className="hint" style={{ marginTop: 8 }}>
            Simpan berkas sebagai CSV UTF-8. Setiap akun baru memakai password
            acak dan wajib mengganti password saat login pertama.
          </p>
        </Modal>
      )}

      {importOpen && importResult && (
        <Modal
          title="Hasil impor CSV"
          description={`${importResult.file_name} · ${importResult.summary.total} baris data`}
          wide
          onClose={closeImport}
          footer={
            <>
              {importResult.imported.length > 0 && (
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={downloadCredentials}
                >
                  <i className="bi bi-download" aria-hidden="true" />
                  Unduh kredensial
                </button>
              )}
              <button
                className="btn btn-primary"
                type="button"
                onClick={closeImport}
              >
                Selesai
              </button>
            </>
          }
        >
          <div
            className={`alert ${
              importResult.summary.failed > 0
                ? "alert--warning"
                : "alert--success"
            }`}
            role="status"
          >
            <i
              className={`bi ${
                importResult.summary.failed > 0
                  ? "bi-exclamation-triangle"
                  : "bi-check-circle"
              }`}
              aria-hidden="true"
            />
            <div className="import-summary">
              <strong>
                {importResult.summary.imported} dari{" "}
                {importResult.summary.total} baris berhasil diimpor.
              </strong>
              {importResult.summary.failed > 0
                ? ` ${importResult.summary.failed} baris gagal dan tidak dibuat.`
                : " Semua baris berhasil dibuat."}
            </div>
          </div>

          {importResult.imported.length > 0 && (
            <div className="alert alert--warning" role="alert">
              <i className="bi bi-key" aria-hidden="true" />
              <div>
                Password awal hanya ditampilkan sekali lewat unduhan{" "}
                <strong>kredensial</strong>. Serahkan lewat kanal aman; setiap
                anggota wajib mengganti password saat login pertama. Email
                undangan tidak dikirim pada impor massal.
              </div>
            </div>
          )}

          {importResult.failed.length > 0 && (
            <>
              <div className="import-failures">
                <table className="issue-table admin-table is-compact">
                  <thead>
                    <tr>
                      <th className="col-num">Baris</th>
                      <th>Nama / email</th>
                      <th>Kesalahan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResult.failed.map((item) => (
                      <tr key={item.row}>
                        <td className="col-num">{item.row}</td>
                        <td>
                          <span className="admin-name">
                            {item.name || "—"}
                          </span>
                          <div className="admin-sub">{item.email || "—"}</div>
                        </td>
                        <td>{item.errors.join("; ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="hint" style={{ marginTop: 8 }}>
                Perbaiki baris gagal lalu impor ulang berkas yang sudah
                dikoreksi. Baris yang sudah berhasil akan ditolak sebagai email
                duplikat, jadi hapus baris tersebut dari berkas.
              </p>
            </>
          )}
        </Modal>
      )}

      {secret && (
        <Modal
          title={secret.title}
          description={`${secret.name} · ${secret.email}`}
          onClose={() => setSecret(null)}
          footer={
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => setSecret(null)}
            >
              Selesai
            </button>
          }
        >
          <div className="alert alert--warning" role="alert">
            <i className="bi bi-exclamation-triangle" aria-hidden="true" />
            <div>
              Password ini hanya ditampilkan sekali. Serahkan lewat kanal aman;
              pengguna wajib menggantinya saat login pertama.
            </div>
          </div>

          {secret.delivery && (
            <div
              className={`alert ${
                secret.delivery.sent ? "alert--success" : "alert--warning"
              }`}
              role="status"
            >
              <i
                className={`bi ${
                  secret.delivery.sent ? "bi-envelope-check" : "bi-envelope-slash"
                }`}
                aria-hidden="true"
              />
              <div>
                {secret.delivery.sent
                  ? `Email berisi password juga dikirim ke ${secret.email}.`
                  : secret.delivery.error
                    ? `Email gagal dikirim: ${secret.delivery.error}. Serahkan password ini secara manual.`
                    : "Email tidak dikirim karena SMTP belum aktif. Serahkan password ini secara manual."}
              </div>
            </div>
          )}

          <div className="secret-box">
            <code>{secret.password}</code>
            <button
              className="btn btn-outline btn-sm"
              type="button"
              onClick={copyPassword}
            >
              <i className="bi bi-clipboard" aria-hidden="true" />
              {copied ? "Tersalin" : "Salin"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
