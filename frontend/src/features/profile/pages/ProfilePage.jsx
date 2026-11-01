import { useEffect, useState } from "react";
import PageHeader from "../../../components/ui/PageHeader";
import Avatar from "../../../components/ui/Avatar";
import { useAuth } from "../../../app/providers/AuthProvider";
import { pb } from "../../../lib/pocketbase";
import {
  changePassword,
  fetchProfile,
  getErrorMessage,
  removeAvatar,
  updateProfile,
  uploadAvatar,
} from "../../../lib/api";
import { roleLabel } from "../../../lib/permissions";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"];

export default function ProfilePage() {
  const { user, logout } = useAuth();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [employeeNo, setEmployeeNo] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");

  const [uploading, setUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    document.title = "Profil saya · Healthcare ITSM";

    let active = true;

    fetchProfile()
      .then((data) => {
        if (!active) return;
        setProfile(data);
        setName(data.name || "");
        setPhone(data.phone || "");
        setEmployeeNo(data.employee_no || "");
      })
      .catch((err) => {
        if (active) setLoadError(getErrorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function refreshSession() {
    await pb.collection("users").authRefresh();
  }

  async function handleSave(event) {
    event.preventDefault();
    setSaveError("");
    setSaveNotice("");

    if (name.trim().length < 2) {
      setSaveError("Nama minimal 2 karakter.");
      return;
    }

    setSaving(true);

    try {
      const updated = await updateProfile({
        name: name.trim(),
        phone: phone.trim(),
        employee_no: employeeNo.trim(),
      });

      setProfile(updated);
      setSaveNotice("Profil berhasil diperbarui.");
      await refreshSession();
    } catch (err) {
      setSaveError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatar(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setAvatarError("");

    if (!AVATAR_TYPES.includes(file.type)) {
      setAvatarError("Gunakan foto PNG, JPG, atau WEBP.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError("Ukuran foto maksimal 2 MB.");
      return;
    }

    setUploading(true);

    try {
      const updated = await uploadAvatar(file);
      setProfile(updated);
      await refreshSession();
    } catch (err) {
      setAvatarError(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveAvatar() {
    setAvatarError("");
    setUploading(true);

    try {
      const updated = await removeAvatar();
      setProfile(updated);
      await refreshSession();
    } catch (err) {
      setAvatarError(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function handlePassword(event) {
    event.preventDefault();
    setPasswordError("");

    if (newPassword.length < 8) {
      setPasswordError("Password baru minimal 8 karakter.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Konfirmasi password tidak sama.");
      return;
    }

    setChangingPassword(true);

    try {
      await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        new_password_confirm: confirmPassword,
      });

      logout();
      // Muat ulang penuh agar halaman login tidak sempat melihat sesi lama.
      window.location.assign("/login?changed=1");
    } catch (err) {
      setPasswordError(getErrorMessage(err));
    } finally {
      setChangingPassword(false);
    }
  }

  const shown = profile || user;

  return (
    <>
      <PageHeader
        title="Profil saya"
        description="Kelola nama, kontak, foto, dan password akun Anda."
      />

      {loadError && (
        <div className="alert alert--error" role="alert">
          <i className="bi bi-exclamation-triangle" aria-hidden="true" />
          <div>{loadError}</div>
        </div>
      )}

      {loading && !profile ? (
        <div className="page-state">
          <span className="spinner spinner--dark spinner--lg" role="status" />
          <div className="centered-text">Memuat profil...</div>
        </div>
      ) : (
        <div className="profile-grid">
          <aside className="panel profile-side">
            <div className="panel-body profile-avatar">
              <Avatar user={user || shown} size={96} />
              <div className="profile-avatar-name">{shown?.name || "—"}</div>
              <div className="profile-avatar-role">{roleLabel(shown)}</div>

              <input
                id="avatar-file"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="visually-hidden"
                onChange={handleAvatar}
                disabled={uploading}
              />

              <label
                className={`btn btn-outline${uploading ? " is-disabled" : ""}`}
                htmlFor="avatar-file"
              >
                {uploading ? (
                  <span className="spinner" aria-hidden="true" />
                ) : (
                  <i className="bi bi-camera" aria-hidden="true" />
                )}
                Unggah foto
              </label>

              {shown?.avatar && (
                <button
                  className="btn btn-outline-danger"
                  type="button"
                  onClick={handleRemoveAvatar}
                  disabled={uploading}
                >
                  Hapus foto
                </button>
              )}

              {avatarError && (
                <div className="profile-error" role="alert">
                  {avatarError}
                </div>
              )}

              <div className="hint">
                PNG, JPG, atau WEBP. Maksimal 2 MB. Foto tampil di komentar dan
                menu pengguna.
              </div>
            </div>

            <div className="panel-body profile-meta">
              <div className="profile-meta-row">
                <span>Email</span>
                <strong>{shown?.email || "—"}</strong>
              </div>
              <div className="profile-meta-row">
                <span>Unit</span>
                <strong>{profile?.unit_name || "—"}</strong>
              </div>
              <div className="profile-meta-row">
                <span>Tenant</span>
                <strong>{profile?.tenant_name || "—"}</strong>
              </div>
            </div>
          </aside>

          <div className="profile-forms">
            <section className="panel">
              <div className="panel-head">
                <div className="panel-title">Informasi profil</div>
              </div>
              <div className="panel-body">
                {saveError && (
                  <div className="alert alert--error" role="alert">
                    <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                    <div>{saveError}</div>
                  </div>
                )}
                {saveNotice && (
                  <div className="alert alert--success" role="status">
                    <i className="bi bi-check2-circle" aria-hidden="true" />
                    <div>{saveNotice}</div>
                  </div>
                )}

                <form onSubmit={handleSave}>
                  <div className="field-row">
                    <label className="form-label" htmlFor="profile-name">
                      Nama <span className="req">*</span>
                    </label>
                    <input
                      id="profile-name"
                      className="input"
                      value={name}
                      maxLength={120}
                      minLength={2}
                      onChange={(event) => setName(event.target.value)}
                      required
                    />
                  </div>

                  <div className="form-grid">
                    <div className="field-row">
                      <label className="form-label" htmlFor="profile-phone">
                        Telepon
                      </label>
                      <input
                        id="profile-phone"
                        className="input"
                        value={phone}
                        maxLength={40}
                        placeholder="+62 812 3456 7890"
                        onChange={(event) => setPhone(event.target.value)}
                      />
                    </div>

                    <div className="field-row">
                      <label className="form-label" htmlFor="profile-employee">
                        Nomor pegawai
                      </label>
                      <input
                        id="profile-employee"
                        className="input"
                        value={employeeNo}
                        maxLength={40}
                        placeholder="Contoh: EMP-001"
                        onChange={(event) => setEmployeeNo(event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="hint">
                    Telepon dan nomor pegawai hanya terlihat oleh Anda dan IT
                    Lead. Email, peran, dan unit hanya dapat diubah oleh
                    administrator.
                  </div>

                  <div className="form-actions">
                    <button
                      className="btn btn-primary"
                      type="submit"
                      disabled={saving}
                    >
                      {saving ? (
                        <span className="spinner" aria-hidden="true" />
                      ) : (
                        <i className="bi bi-check2" aria-hidden="true" />
                      )}
                      Simpan profil
                    </button>
                  </div>
                </form>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <div className="panel-title">Keamanan</div>
              </div>
              <div className="panel-body">
                {passwordError && (
                  <div className="alert alert--error" role="alert">
                    <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                    <div>{passwordError}</div>
                  </div>
                )}

                <form onSubmit={handlePassword}>
                  <div className="field-row">
                    <label className="form-label" htmlFor="current-password">
                      Password saat ini <span className="req">*</span>
                    </label>
                    <input
                      id="current-password"
                      className="input"
                      type="password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      required
                    />
                  </div>

                  <div className="form-grid">
                    <div className="field-row">
                      <label className="form-label" htmlFor="new-password">
                        Password baru <span className="req">*</span>
                      </label>
                      <input
                        id="new-password"
                        className="input"
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        required
                      />
                    </div>

                    <div className="field-row">
                      <label className="form-label" htmlFor="confirm-password">
                        Ulangi password baru <span className="req">*</span>
                      </label>
                      <input
                        id="confirm-password"
                        className="input"
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="hint">
                    Minimal 8 karakter. Setelah password diubah, semua sesi lain
                    keluar dan Anda perlu masuk kembali.
                  </div>

                  <div className="form-actions">
                    <button
                      className="btn btn-primary"
                      type="submit"
                      disabled={changingPassword}
                    >
                      {changingPassword ? (
                        <span className="spinner" aria-hidden="true" />
                      ) : (
                        <i className="bi bi-shield-lock" aria-hidden="true" />
                      )}
                      Ubah password
                    </button>
                  </div>
                </form>
              </div>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
