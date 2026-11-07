import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../../../app/providers/AuthProvider";
import { useMeta } from "../../../app/providers/MetaProvider";
import { fetchSetupStatus, getErrorMessage, submitSetup } from "../../../lib/api";
import { fieldError, formErrorText, useAppForm } from "../../../lib/formik";
import AuthBrand from "../../auth/AuthBrand";
import ThemeToggle from "../../../components/ui/ThemeToggle";

const TIMEZONES = [
  ["Asia/Jakarta", "WIB · Asia/Jakarta"],
  ["Asia/Makassar", "WITA · Asia/Makassar"],
  ["Asia/Jayapura", "WIT · Asia/Jayapura"],
];

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,19}$/;
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

function SetupShell({ title, intro, children }) {
  return (
    <div className="login-page">
      <main className="login-main">
        <AuthBrand />

        <section className="login-card login-card--setup" aria-labelledby="setup-title">
          <h1 className="login-title" id="setup-title">
            {title}
          </h1>
          {intro && <p className="login-intro">{intro}</p>}
          {children}
        </section>
      </main>

      <footer className="login-footer">
        <span>© 2026 Healthcare ITSM</span>
        <ThemeToggle className="login-theme" />
      </footer>
    </div>
  );
}

function SetupForm({ status }) {
  const { login } = useAuth();
  const { refresh } = useMeta();
  const [completed, setCompleted] = useState(null);

  const isVendor = status.mode === "vendor";
  const minPassword = Number(status.min_password) || 8;
  const hospital = status.hospital || {};

  const formik = useAppForm({
    initialValues: {
      token: "",
      hospital_name: hospital.placeholder ? "" : hospital.name || "",
      hospital_code: hospital.code || "RS01",
      hospital_timezone: hospital.timezone || "Asia/Jakarta",
      account_name: "",
      account_email: "",
      account_password: "",
      account_password_confirm: "",
    },
    validate: (values) => {
      const errors = {};

      if (values.token.replace(/[^A-Za-z0-9]/g, "").length < 8) {
        errors.token = "Masukkan kode setup dari server.";
      }

      if (!isVendor) {
        if (values.hospital_name.trim().length < 2) {
          errors.hospital_name = "Nama rumah sakit minimal 2 karakter.";
        }
        if (!CODE_PATTERN.test(values.hospital_code.trim().toUpperCase())) {
          errors.hospital_code =
            "Kode 2–20 karakter: huruf, angka, titik, garis bawah, atau strip.";
        }
        if (!values.hospital_timezone) {
          errors.hospital_timezone = "Pilih zona waktu.";
        }
      }

      if (values.account_name.trim().length < 2) {
        errors.account_name = "Nama minimal 2 karakter.";
      }
      if (!EMAIL_PATTERN.test(values.account_email.trim())) {
        errors.account_email = "Email tidak valid.";
      }
      if (values.account_password.length < minPassword) {
        errors.account_password = `Password minimal ${minPassword} karakter.`;
      }
      if (values.account_password !== values.account_password_confirm) {
        errors.account_password_confirm = "Konfirmasi password tidak sama.";
      }

      return errors;
    },
    onSubmit: async (values, helpers) => {
      helpers.setStatus("");

      const payload = {
        token: values.token,
        account: {
          name: values.account_name.trim(),
          email: values.account_email.trim(),
          password: values.account_password,
        },
      };

      if (!isVendor) {
        payload.hospital = {
          name: values.hospital_name.trim(),
          code: values.hospital_code.trim().toUpperCase(),
          timezone: values.hospital_timezone,
        };
      }

      try {
        const result = await submitSetup(payload);
        await refresh();

        // Akun pertama langsung dipakai masuk supaya operator tidak perlu
        // mengetik ulang kredensial yang baru dibuat.
        try {
          await login(values.account_email.trim(), values.account_password);
          window.location.replace("/");
          return;
        } catch {
          setCompleted(result);
        }
      } catch (err) {
        helpers.setStatus(getErrorMessage(err));
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  const error = formErrorText(formik);

  if (completed) {
    return (
      <SetupShell
        title="Setup selesai"
        intro={
          isVendor
            ? "Akun vendor pertama sudah dibuat. Rumah sakit baru ditambahkan dari Konsol Vendor."
            : "Rumah sakit dan akun Kepala IT pertama sudah dibuat."
        }
      >
        <div className="login-notice" role="status">
          <i className="bi bi-check2-circle" aria-hidden="true" />
          <div>
            Masuk memakai <strong>{completed.user?.email}</strong> untuk mulai
            bekerja.
          </div>
        </div>
        <Link className="btn btn-primary btn-block login-submit" to="/login">
          Ke halaman masuk
        </Link>
      </SetupShell>
    );
  }

  return (
    <SetupShell
      title="Siapkan instalasi"
      intro={
        isVendor
          ? "Instalasi ini belum punya akun. Buat akun vendor pertama untuk mengelola rumah sakit dari Konsol Vendor."
          : "Instalasi ini belum punya akun. Lengkapi identitas rumah sakit dan buat akun Kepala IT pertama."
      }
    >
      {error && (
        <div className="login-error" role="alert">
          <i className="bi bi-exclamation-circle" aria-hidden="true" />
          <div>{error}</div>
        </div>
      )}

      <form className="login-form" onSubmit={formik.handleSubmit} noValidate>
        <section className="setup-section">
          <h2 className="setup-section-title">
            <span className="setup-step-no">1</span>
            Kode setup
          </h2>

          <div className="login-field">
            <label className="form-label" htmlFor="setup-token">
              Kode setup <span className="req">*</span>
            </label>
            <input
              id="setup-token"
              className="input setup-token-input"
              placeholder="XXXX-XXXX-XXXX-XXXX"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              {...formik.getFieldProps("token")}
              required
            />
            {fieldError(formik, "token") ? (
              <div className="field-error">{fieldError(formik, "token")}</div>
            ) : (
              <div className="hint">
                Kode dibuat server saat instalasi pertama kali dijalankan.
              </div>
            )}
          </div>

          <details className="setup-help">
            <summary>Di mana kode setup saya?</summary>
            <div className="setup-help-body">
              <p>
                Kode tersimpan di berkas <code>setup_token</code> pada direktori
                data PocketBase dan dicetak di log server saat pertama dibutuhkan.
              </p>
              <p>
                Docker: <code>docker compose exec pocketbase cat /pb/pb_data/setup_token</code>
              </p>
              <p>
                Development: <code>npm run pb:setup-token</code> atau buka{" "}
                <code>backend/pb_data/setup_token</code>.
              </p>
              <p>
                Bisa juga disetel sendiri lewat environment <code>SETUP_TOKEN</code>{" "}
                sebelum server dijalankan.
              </p>
            </div>
          </details>
        </section>

        {!isVendor && (
          <section className="setup-section">
            <h2 className="setup-section-title">
              <span className="setup-step-no">2</span>
              Identitas rumah sakit
            </h2>

            <div className="login-field">
              <label className="form-label" htmlFor="hospital-name">
                Nama rumah sakit <span className="req">*</span>
              </label>
              <input
                id="hospital-name"
                className="input"
                maxLength={120}
                placeholder="Contoh: RSUD Kota Bandung"
                {...formik.getFieldProps("hospital_name")}
                required
              />
              {fieldError(formik, "hospital_name") && (
                <div className="field-error">
                  {fieldError(formik, "hospital_name")}
                </div>
              )}
            </div>

            <div className="setup-field-row">
              <div className="login-field">
                <label className="form-label" htmlFor="hospital-code">
                  Kode rumah sakit <span className="req">*</span>
                </label>
                <input
                  id="hospital-code"
                  className="input"
                  maxLength={20}
                  autoComplete="off"
                  {...formik.getFieldProps("hospital_code")}
                  required
                />
                {fieldError(formik, "hospital_code") ? (
                  <div className="field-error">
                    {fieldError(formik, "hospital_code")}
                  </div>
                ) : (
                  <div className="hint">Dipakai di nomor rumah sakit dan laporan.</div>
                )}
              </div>

              <div className="login-field">
                <label className="form-label" htmlFor="hospital-timezone">
                  Zona waktu <span className="req">*</span>
                </label>
                <select
                  id="hospital-timezone"
                  className="select"
                  {...formik.getFieldProps("hospital_timezone")}
                >
                  {TIMEZONES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                {fieldError(formik, "hospital_timezone") && (
                  <div className="field-error">
                    {fieldError(formik, "hospital_timezone")}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        <section className="setup-section">
          <h2 className="setup-section-title">
            <span className="setup-step-no">{isVendor ? "2" : "3"}</span>
            {isVendor ? "Akun vendor pertama" : "Akun Kepala IT pertama"}
          </h2>
          <p className="setup-section-hint">
            {isVendor
              ? "Akun ini mengelola seluruh rumah sakit, membuat tenant, dan melihat laporan lintas rumah sakit."
              : "Akun ini mengelola tim IT, katalog layanan, dan pengaturan rumah sakit. Akun staf lain ditambahkan dari menu Tim."}
          </p>

          <div className="login-field">
            <label className="form-label" htmlFor="admin-name">
              Nama lengkap <span className="req">*</span>
            </label>
            <input
              id="admin-name"
              className="input"
              maxLength={120}
              placeholder={isVendor ? "Nama administrator vendor" : "Nama Kepala IT"}
              autoComplete="name"
              {...formik.getFieldProps("account_name")}
              required
            />
            {fieldError(formik, "account_name") && (
              <div className="field-error">{fieldError(formik, "account_name")}</div>
            )}
          </div>

          <div className="login-field">
            <label className="form-label" htmlFor="admin-email">
              Email <span className="req">*</span>
            </label>
            <input
              id="admin-email"
              type="email"
              className="input"
              maxLength={200}
              placeholder="nama@rs.example.com"
              autoComplete="username"
              {...formik.getFieldProps("account_email")}
              required
            />
            {fieldError(formik, "account_email") && (
              <div className="field-error">{fieldError(formik, "account_email")}</div>
            )}
          </div>

          <div className="setup-field-row">
            <div className="login-field">
              <label className="form-label" htmlFor="admin-password">
                Password <span className="req">*</span>
              </label>
              <input
                id="admin-password"
                type="password"
                className="input"
                placeholder={`Minimal ${minPassword} karakter`}
                autoComplete="new-password"
                {...formik.getFieldProps("account_password")}
                required
              />
              {fieldError(formik, "account_password") && (
                <div className="field-error">
                  {fieldError(formik, "account_password")}
                </div>
              )}
            </div>

            <div className="login-field">
              <label className="form-label" htmlFor="admin-password-confirm">
                Ulangi password <span className="req">*</span>
              </label>
              <input
                id="admin-password-confirm"
                type="password"
                className="input"
                placeholder="Ulangi password"
                autoComplete="new-password"
                {...formik.getFieldProps("account_password_confirm")}
                required
              />
              {fieldError(formik, "account_password_confirm") && (
                <div className="field-error">
                  {fieldError(formik, "account_password_confirm")}
                </div>
              )}
            </div>
          </div>
        </section>

        <button
          className="btn btn-primary btn-block login-submit"
          type="submit"
          disabled={formik.isSubmitting}
        >
          {formik.isSubmitting ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Menyiapkan...
            </>
          ) : (
            "Selesaikan setup"
          )}
        </button>

        <p className="login-note">
          Setelah setup selesai, halaman ini menutup sendiri dan hanya bisa dibuka
          dengan akun.
        </p>
      </form>
    </SetupShell>
  );
}

export default function SetupPage() {
  const { appName } = useMeta();
  const [status, setStatus] = useState(null);
  const [fatal, setFatal] = useState("");

  useEffect(() => {
    let active = true;

    fetchSetupStatus()
      .then((payload) => {
        if (active) setStatus(payload);
      })
      .catch((err) => {
        if (active) setFatal(getErrorMessage(err));
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    document.title = `Setup awal · ${appName}`;
  }, [appName]);

  if (fatal) {
    return (
      <SetupShell
        title="Setup tidak bisa dibuka"
        intro="Server belum bisa memastikan status instalasi. Periksa koneksi ke PocketBase lalu muat ulang halaman."
      >
        <div className="login-error" role="alert">
          <i className="bi bi-exclamation-circle" aria-hidden="true" />
          <div>{fatal}</div>
        </div>
        <button
          className="btn btn-primary btn-block login-submit"
          type="button"
          onClick={() => window.location.reload()}
        >
          Muat ulang
        </button>
      </SetupShell>
    );
  }

  if (!status) {
    return (
      <SetupShell title="Siapkan instalasi">
        <div className="setup-loading">
          <span className="spinner spinner--dark" aria-hidden="true" />
          <span>Memeriksa status instalasi...</span>
        </div>
      </SetupShell>
    );
  }

  if (!status.required) {
    return <Navigate to="/login" replace />;
  }

  return <SetupForm status={status} />;
}
