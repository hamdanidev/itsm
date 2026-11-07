import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { pb } from "../../lib/pocketbase";
import { getErrorMessage } from "../../lib/api";
import { formErrorText, useAppForm } from "../../lib/formik";
import AuthBrand from "./AuthBrand";
import ThemeToggle from "../../components/ui/ThemeToggle";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";

  const [showPassword, setShowPassword] = useState(false);

  const formik = useAppForm({
    initialValues: { password: "", confirm: "" },
    validate: (values) => {
      const errors = {};

      if (values.password.length < 8) {
        errors.password = "Password baru minimal 8 karakter.";
      }
      if (values.password !== values.confirm) {
        errors.confirm = "Konfirmasi password tidak sama.";
      }

      return errors;
    },
    onSubmit: async (values, helpers) => {
      helpers.setStatus("");

      try {
        await pb
          .collection("users")
          .confirmPasswordReset(token, values.password, values.confirm);
        navigate("/login?reset=1", { replace: true });
      } catch (err) {
        const message = getErrorMessage(err);
        helpers.setStatus(
          /invalid|expired|token/i.test(message)
            ? "Tautan reset tidak valid atau sudah kedaluwarsa. Minta tautan baru."
            : message
        );
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  const error = formErrorText(formik);

  useEffect(() => {
    document.title = "Buat password baru · Healthcare ITSM";
  }, []);

  return (
    <div className="login-page">
      <main className="login-main">
        <AuthBrand />

        <section className="login-card" aria-labelledby="reset-title">
          <h1 className="login-title" id="reset-title">
            Buat password baru
          </h1>

          {!token ? (
            <>
              <div className="login-error" role="alert">
                <i className="bi bi-exclamation-circle" aria-hidden="true" />
                <div>Tautan reset tidak lengkap atau sudah tidak berlaku.</div>
              </div>
              <p className="login-note">
                <Link to="/forgot-password">Minta tautan reset baru</Link>.
              </p>
            </>
          ) : (
            <>
              {error && (
                <div className="login-error" role="alert">
                  <i className="bi bi-exclamation-circle" aria-hidden="true" />
                  <div>{error}</div>
                </div>
              )}

              <p className="login-intro">
                Masukkan password baru untuk akun Anda. Semua sesi lama akan
                keluar setelah password diubah.
              </p>

              <form className="login-form" onSubmit={formik.handleSubmit}>
                <div className="login-field">
                  <label className="form-label" htmlFor="reset-password">
                    Password baru
                  </label>
                  <div className="input-wrap">
                    <input
                      id="reset-password"
                      type={showPassword ? "text" : "password"}
                      className="input"
                      placeholder="Minimal 8 karakter"
                      autoComplete="new-password"
                      minLength={8}
                      autoFocus
                      {...formik.getFieldProps("password")}
                      required
                    />
                    <button
                      className="password-toggle"
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={
                        showPassword
                          ? "Sembunyikan password"
                          : "Tampilkan password"
                      }
                    >
                      <i
                        className={`bi ${
                          showPassword ? "bi-eye-slash" : "bi-eye"
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                </div>

                <div className="login-field">
                  <label className="form-label" htmlFor="reset-confirm">
                    Ulangi password baru
                  </label>
                  <input
                    id="reset-confirm"
                    type={showPassword ? "text" : "password"}
                    className="input"
                    placeholder="Ulangi password"
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
                    "Simpan password baru"
                  )}
                </button>
              </form>

              <p className="login-note">
                Tautan sudah tidak berlaku?{" "}
                <Link to="/forgot-password">Minta tautan baru</Link>.
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
