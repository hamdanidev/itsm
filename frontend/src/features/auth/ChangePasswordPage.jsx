import { useState } from "react";
import { useAuth } from "../../app/providers/AuthProvider";
import { changePassword, getErrorMessage } from "../../lib/api";
import { formErrorText, useAppForm } from "../../lib/formik";
import ThemeToggle from "../../components/ui/ThemeToggle";
import AuthBrand from "./AuthBrand";

// Halaman wajib ganti password: muncul sekali setelah login memakai password
// awal yang dibuat IT Lead. Setelah berhasil, sesi diakhiri dan pengguna masuk
// lagi dengan password baru.
export default function ChangePasswordPage() {
  const { user, logout } = useAuth();

  const [show, setShow] = useState(false);

  const formik = useAppForm({
    initialValues: { current: "", next: "", confirm: "" },
    validate: (values) => {
      const errors = {};

      if (!values.current) errors.current = "Password awal wajib diisi.";
      if (values.next.length < 8) {
        errors.next = "Password baru minimal 8 karakter.";
      }
      if (values.next !== values.confirm) {
        errors.confirm = "Konfirmasi password tidak sama.";
      }
      if (values.next === values.current) {
        errors.next = "Password baru harus berbeda dari password awal.";
      }

      return errors;
    },
    onSubmit: async (values, helpers) => {
      helpers.setStatus("");

      try {
        await changePassword({
          current_password: values.current,
          new_password: values.next,
          new_password_confirm: values.confirm,
        });

        // Password berubah memutar tokenKey, jadi sesi ini memang berakhir.
        // Redirect keras (bukan navigasi SPA) dipakai agar guard auth tidak
        // membawa state `from=/change-password` ke halaman login.
        logout();
        window.location.replace("/login?changed=1");
      } catch (err) {
        helpers.setStatus(getErrorMessage(err));
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  const error = formErrorText(formik);

  return (
    <div className="login-page">
      <main className="login-main">
        <AuthBrand />

        <section className="login-card" aria-labelledby="change-title">
          <h1 className="login-title" id="change-title">
            Ganti password
          </h1>
          <p className="login-sub">
            Password awal wajib diganti sebelum memakai aplikasi.
          </p>

          {error && (
            <div className="login-error" role="alert">
              <i className="bi bi-exclamation-circle" aria-hidden="true" />
              <div>{error}</div>
            </div>
          )}

          <form className="login-form" onSubmit={formik.handleSubmit}>
            <div className="login-field">
              <label className="form-label" htmlFor="current-password">
                Password awal
              </label>
              <input
                id="current-password"
                type="password"
                className="input"
                autoComplete="current-password"
                {...formik.getFieldProps("current")}
                required
              />
            </div>

            <div className="login-field">
              <label className="form-label" htmlFor="new-password">
                Password baru
              </label>
              <div className="input-wrap">
                <input
                  id="new-password"
                  type={show ? "text" : "password"}
                  className="input"
                  autoComplete="new-password"
                  minLength={8}
                  {...formik.getFieldProps("next")}
                  required
                />
                <button
                  className="password-toggle"
                  type="button"
                  onClick={() => setShow((value) => !value)}
                  aria-label={
                    show ? "Sembunyikan password" : "Tampilkan password"
                  }
                >
                  <i
                    className={`bi ${show ? "bi-eye-slash" : "bi-eye"}`}
                    aria-hidden="true"
                  />
                </button>
              </div>
            </div>

            <div className="login-field">
              <label className="form-label" htmlFor="confirm-password">
                Ulangi password baru
              </label>
              <input
                id="confirm-password"
                type={show ? "text" : "password"}
                className="input"
                autoComplete="new-password"
                minLength={8}
                {...formik.getFieldProps("confirm")}
                required
              />
            </div>

            <button
              className="btn btn-primary btn-block login-submit"
              type="submit"
              disabled={formik.isSubmitting}
            >
              {formik.isSubmitting ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  Menyimpan...
                </>
              ) : (
                "Simpan password"
              )}
            </button>
          </form>

          <p className="login-note">
            Masuk sebagai <strong>{user?.email}</strong>
          </p>
        </section>
      </main>

      <footer className="login-footer">
        <span>© 2026 Healthcare ITSM</span>
        <ThemeToggle className="login-theme" />
      </footer>
    </div>
  );
}
