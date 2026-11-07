import { useEffect, useMemo, useState } from "react";
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
import { teamLabel } from "../../../lib/teams";
import { formErrorText, useAppForm } from "../../../lib/formik";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"];

export default function ProfilePage() {
  const { user, logout } = useAuth();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [saveNotice, setSaveNotice] = useState("");
  const [uploading, setUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");

  const profileInitialValues = useMemo(
    () => ({
      name: profile?.name || "",
      phone: profile?.phone || "",
      employee_no: profile?.employee_no || "",
      email_notifications: profile?.email_notifications !== false,
    }),
    [
      profile?.email_notifications,
      profile?.employee_no,
      profile?.name,
      profile?.phone,
    ]
  );

  const profileForm = useAppForm({
    enableReinitialize: true,
    initialValues: profileInitialValues,
    validate: (values) => {
      const errors = {};
      if (values.name.trim().length < 2) {
        errors.name = "Nama minimal 2 karakter.";
      }
      return errors;
    },
    onSubmit: async (values, helpers) => {
      helpers.setStatus("");
      setSaveNotice("");

      try {
        const updated = await updateProfile({
          name: values.name.trim(),
          phone: values.phone.trim(),
          employee_no: values.employee_no.trim(),
          email_notifications: values.email_notifications,
        });

        setProfile(updated);
        setSaveNotice("Profil berhasil diperbarui.");
        await refreshSession();
      } catch (err) {
        helpers.setStatus(getErrorMessage(err));
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  const passwordForm = useAppForm({
    initialValues: {
      current_password: "",
      new_password: "",
      new_password_confirm: "",
    },
    validate: (values) => {
      const errors = {};
      if (!values.current_password) {
        errors.current_password = "Password saat ini wajib diisi.";
      }
      if (values.new_password.length < 8) {
        errors.new_password = "Password baru minimal 8 karakter.";
      }
      if (values.new_password !== values.new_password_confirm) {
        errors.new_password_confirm = "Konfirmasi password tidak sama.";
      }
      return errors;
    },
    onSubmit: async (values, helpers) => {
      helpers.setStatus("");

      try {
        await changePassword(values);
        logout();
        // Muat ulang penuh agar halaman login tidak sempat melihat sesi lama.
        window.location.assign("/login?changed=1");
      } catch (err) {
        helpers.setStatus(getErrorMessage(err));
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  const saveError = formErrorText(profileForm);
  const passwordError = formErrorText(passwordForm);

  useEffect(() => {
    document.title = "Profil saya · Healthcare ITSM";

    let active = true;

    fetchProfile()
      .then((data) => {
        if (!active) return;
        // Nilai form mengikuti `profile` lewat `enableReinitialize`.
        setProfile(data);
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
              {profile?.job_title && (
                <div className="profile-meta-row">
                  <span>Jabatan</span>
                  <strong>{profile.job_title}</strong>
                </div>
              )}
              {profile?.team && (
                <div className="profile-meta-row">
                  <span>Tim</span>
                  <strong>{teamLabel(profile.team)}</strong>
                </div>
              )}
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

                <form onSubmit={profileForm.handleSubmit}>
                  <div className="field-row">
                    <label className="form-label" htmlFor="profile-name">
                      Nama <span className="req">*</span>
                    </label>
                    <input
                      id="profile-name"
                      className="input"
                      maxLength={120}
                      minLength={2}
                      {...profileForm.getFieldProps("name")}
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
                        maxLength={40}
                        placeholder="+62 812 3456 7890"
                        {...profileForm.getFieldProps("phone")}
                      />
                    </div>

                    <div className="field-row">
                      <label className="form-label" htmlFor="profile-employee">
                        Nomor pegawai
                      </label>
                      <input
                        id="profile-employee"
                        className="input"
                        maxLength={40}
                        placeholder="Contoh: EMP-001"
                        {...profileForm.getFieldProps("employee_no")}
                      />
                    </div>
                  </div>

                  <div className="hint">
                    Telepon dan nomor pegawai hanya terlihat oleh Anda dan IT
                    Lead. Email, peran, dan unit hanya dapat diubah oleh
                    administrator.
                  </div>

                  <label className="checkline" htmlFor="profile-email-notifications">
                    <input
                      id="profile-email-notifications"
                      type="checkbox"
                      {...profileForm.getFieldProps({
                        name: "email_notifications",
                        type: "checkbox",
                      })}
                    />
                    Kirim notifikasi tiket ke email saya
                  </label>

                  <div className="hint">
                    Notifikasi in-app tetap muncul. Undangan akun dan email
                    keamanan tetap dikirim meski pilihan ini dimatikan.
                  </div>

                  <div className="profile-actions">
                    <button
                      className="btn btn-primary"
                      type="submit"
                      disabled={profileForm.isSubmitting}
                    >
                      {profileForm.isSubmitting ? (
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

                <form onSubmit={passwordForm.handleSubmit}>
                  <div className="field-row">
                    <label className="form-label" htmlFor="current-password">
                      Password saat ini <span className="req">*</span>
                    </label>
                    <input
                      id="current-password"
                      className="input"
                      type="password"
                      autoComplete="current-password"
                      {...passwordForm.getFieldProps("current_password")}
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
                        {...passwordForm.getFieldProps("new_password")}
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
                        {...passwordForm.getFieldProps("new_password_confirm")}
                        required
                      />
                    </div>
                  </div>

                  <div className="hint">
                    Minimal 8 karakter. Setelah password diubah, semua sesi lain
                    keluar dan Anda perlu masuk kembali.
                  </div>

                  <div className="profile-actions">
                    <button
                      className="btn btn-primary"
                      type="submit"
                      disabled={passwordForm.isSubmitting}
                    >
                      {passwordForm.isSubmitting ? (
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
