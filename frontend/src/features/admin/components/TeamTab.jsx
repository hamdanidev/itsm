import { useCallback, useEffect, useState } from "react";
import EmptyState from "../../../components/ui/EmptyState";
import Modal from "../../../components/ui/Modal";
import { formatDate } from "../../../lib/format";
import { roleLabel } from "../../../lib/permissions";
import {
  createTeamMember,
  fetchMailStatus,
  fetchTeam,
  getErrorMessage,
  resetTeamPassword,
  updateTeamMember,
} from "../../../lib/api";

const ROLE_OPTIONS = [
  ["requester", "Requester"],
  ["it_support", "IT Support"],
  ["it_lead", "IT Lead"],
];

const EMPTY_FORM = {
  name: "",
  email: "",
  role: "it_support",
  unit: "",
};

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
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");

  const [secret, setSecret] = useState(null);
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(null);
  const [mail, setMail] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await fetchTeam();
      setItems(data.items || []);
    } catch (err) {
      setError(getErrorMessage(err));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
    setForm(EMPTY_FORM);
    setFormError("");
    setModal({ record: null });
  }

  function openEdit(record) {
    setForm({
      name: record.name,
      email: record.email,
      role: record.role,
      unit: record.unit || "",
    });
    setFormError("");
    setModal({ record });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError("");

    const name = form.name.trim();
    const email = form.email.trim();

    if (name.length < 2) {
      setFormError("Nama minimal 2 karakter.");
      return;
    }
    if (!modal.record && !/^\S+@\S+\.\S+$/.test(email)) {
      setFormError("Email tidak valid.");
      return;
    }

    setSaving(true);

    try {
      if (modal.record) {
        await updateTeamMember(modal.record.id, {
          name,
          role: form.role,
          unit: form.unit,
        });
        setNotice("Perubahan disimpan.");
        setModal(null);
      } else {
        const created = await createTeamMember({
          name,
          email,
          role: form.role,
          unit: form.unit || undefined,
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

      await load();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
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
      <div className="list-toolbar">
        <span className="list-count">
          {loading ? "Memuat..." : `${items.length} anggota`}
        </span>
        <button className="btn btn-primary btn-sm" type="button" onClick={openCreate}>
          <i className="bi bi-person-plus" aria-hidden="true" />
          Tambah anggota
        </button>
      </div>

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

      <div className="list-panel admin-panel">
        {loading ? (
          <div className="admin-loading">
            <span className="spinner spinner--dark" role="status" />
            Memuat tim...
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon="bi-people"
            title="Belum ada anggota tim"
            description="Tambahkan staf IT pertama untuk rumah sakit ini."
            action={
              <button className="btn btn-primary" type="button" onClick={openCreate}>
                <i className="bi bi-person-plus" aria-hidden="true" />
                Tambah anggota
              </button>
            }
          />
        ) : (
          <div className="issue-table-wrap">
            <table className="issue-table admin-table is-compact">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Role</th>
                  <th>Unit</th>
                  <th className="col-status">Status</th>
                  <th className="col-actions">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((record) => {
                  const self = record.id === currentUser?.id;
                  const lastLead =
                    record.role === "it_lead" &&
                    record.is_active &&
                    items.filter(
                      (item) => item.role === "it_lead" && item.is_active
                    ).length === 1;

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
                                  ? "Tidak dapat menonaktifkan IT Lead aktif terakhir"
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
          onClose={() => (saving ? null : setModal(null))}
          footer={
            <>
              <button
                className="btn btn-subtle"
                type="button"
                onClick={() => setModal(null)}
                disabled={saving}
              >
                Batal
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                form="team-form"
                disabled={saving}
              >
                {saving ? (
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
          <form id="team-form" className="admin-form" onSubmit={handleSubmit}>
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
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                maxLength={120}
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
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({ ...current, email: event.target.value }))
                }
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
                  value={form.role}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, role: event.target.value }))
                  }
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
                  value={form.unit}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, unit: event.target.value }))
                  }
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
