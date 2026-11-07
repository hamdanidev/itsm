import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getErrorMessage, requestPasswordReset } from "../../lib/api";
import { formErrorText, useAppForm } from "../../lib/formik";
import AuthBrand from "./AuthBrand";
import ThemeToggle from "../../components/ui/ThemeToggle";

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);

  const formik = useAppForm({
    initialValues: { email: "" },
    validate: (values) => {
      const errors = {};
      if (!values.email.trim()) errors.email = "Email wajib diisi.";
      return errors;
    },
    onSubmit: async (values, helpers) => {
      helpers.setStatus("");

      try {
        await requestPasswordReset(values.email.trim());
        setSubmitted(true);
      } catch (err) {
        helpers.setStatus(getErrorMessage(err));
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  const error = formErrorText(formik);

  useEffect(() => {
    document.title = "Lupa password · Healthcare ITSM";
  }, []);

  return (
    <div className="login-page">
      <main className="login-main">
        <AuthBrand />

        <section className="login-card" aria-labelledby="forgot-title">
          <h1 className="login-title" id="forgot-title">
            Lupa password
          </h1>

          {error && (
            <div className="login-error" role="alert">
              <i className="bi bi-exclamation-circle" aria-hidden="true" />
              <div>{error}</div>
            </div>
          )}

          {submitted ? (
            <>
              <div className="login-notice" role="status">
                <i className="bi bi-envelope-check" aria-hidden="true" />
                <div>
                  Jika email tersebut terdaftar, kami mengirim tautan untuk
                  membuat password baru. Periksa inbox dan folder spam Anda.
                </div>
              </div>

              <p className="login-note">
                Tautan hanya berlaku sekali dan akan kedaluwarsa.{" "}
                <Link to="/login">Kembali ke halaman masuk</Link>.
              </p>
            </>
          ) : (
            <>
              <p className="login-intro">
                Masukkan email akun Anda. Kami akan mengirim tautan untuk
                membuat password baru.
              </p>

              <form className="login-form" onSubmit={formik.handleSubmit}>
                <div className="login-field">
                  <label className="form-label" htmlFor="forgot-email">
                    Email
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    className="input"
                    placeholder="nama@rs.example.com"
                    autoComplete="username"
                    autoFocus
                    {...formik.getFieldProps("email")}
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
                      Mengirim...
                    </>
                  ) : (
                    "Kirim tautan reset"
                  )}
                </button>
              </form>

              <p className="login-note">
                Ingat password Anda? <Link to="/login">Masuk di sini</Link>.
              </p>
            </>
          )}
        </section>
      </main>

      <footer className="login-footer">
        <span>© 2026 Healthcare ITSM</span>
        <ThemeToggle className="login-theme" />
      </footer>
    </div>
  );
}
