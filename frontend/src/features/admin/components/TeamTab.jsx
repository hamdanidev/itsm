import { useCallback, useEffect, useState } from "react";
import EmptyState from "../../../components/ui/EmptyState";
import Modal from "../../../components/ui/Modal";
import Pagination from "../../../components/ui/Pagination";
import { TableSkeleton } from "../../../components/ui/Skeleton";
import { formatDate } from "../../../lib/format";
import { roleLabel } from "../../../lib/permissions";
import { TEAM_OPTIONS, teamLabel } from "../../../lib/teams";
import {
  createTeamMember,
  fetchMailStatus,
  fetchTeam,
  getErrorMessage,
  resetTeamPassword,
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
