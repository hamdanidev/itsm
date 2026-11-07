import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../app/providers/AuthProvider";
import { useMeta } from "../../app/providers/MetaProvider";
import { getErrorMessage } from "../../lib/api";
import { formErrorText, useAppForm } from "../../lib/formik";
import AuthBrand from "./AuthBrand";
import ThemeToggle from "../../components/ui/ThemeToggle";

export default function LoginPage() {
  const { ready, isAuthenticated, login } = useAuth();
  const { isVendor, tenant, appName } = useMeta();
  const navigate = useNavigate();
  const location = useLocation();

  const [showPassword, setShowPassword] = useState(false);

  const formik = useAppForm({
    initialValues: { email: "", password: "" },
    validate: (values) => {
      const errors = {};
      if (!values.email.trim()) errors.email = "Email wajib diisi.";
      if (!values.password) errors.password = "Password wajib diisi.";
      return errors;
    },
    onSubmit: async (values, helpers) => {
      helpers.setStatus("");

      try {
        await login(values.email, values.password);
        navigate(from, { replace: true });
      } catch (err) {
        const message = getErrorMessage(err);
        helpers.setStatus(
          /failed to authenticate/i.test(message)
            ? "Email atau password salah. Periksa kembali lalu coba lagi."
            : message
        );
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  const error = formErrorText(formik);

  // Jangan pernah kembali ke halaman wajib-ganti-password setelah login ulang;
  // halaman itu hanya untuk sesi yang masih membawa password awal.
  const rawFrom = location.state?.from?.pathname || "/";
  const from = rawFrom === "/change-password" ? "/" : rawFrom;
  const params = new URLSearchParams(location.search);
  const changed = params.get("changed") === "1";
  const reset = params.get("reset") === "1";

  useEffect(() => {
    document.title = `Masuk · ${tenant?.name || appName}`;
  }, [tenant, appName]);

  if (ready && isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  return (
    <div className="login-page">
      <main className="login-main">
        <AuthBrand />

        <section className="login-card" aria-labelledby="login-title">
          <h1 className="login-title" id="login-title">
            Masuk
          </h1>

          {changed && !error && (
            <div className="login-notice" role="status">
              <i className="bi bi-check2-circle" aria-hidden="true" />
              <div>Password berhasil diubah. Silakan masuk kembali.</div>
            </div>
          )}

          {reset && !error && (
            <div className="login-notice" role="status">
              <i className="bi bi-check2-circle" aria-hidden="true" />
              <div>Password berhasil direset. Silakan masuk kembali.</div>
            </div>
          )}

          {error && (
            <div className="login-error" role="alert">
              <i className="bi bi-exclamation-circle" aria-hidden="true" />
              <div>{error}</div>
            </div>
          )}

          <form className="login-form" onSubmit={formik.handleSubmit}>
            <div className="login-field">
              <label className="form-label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                className="input"
                placeholder="nama@rs.example.com"
                autoComplete="username"
                autoFocus
                {...formik.getFieldProps("email")}
                required
              />
            </div>

            <div className="login-field">
              <label className="form-label" htmlFor="password">
                Password
              </label>
              <div className="input-wrap">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className="input"
                  placeholder="Masukkan password"
                  autoComplete="current-password"
                  {...formik.getFieldProps("password")}
                  required
                />
                <button
                  className="password-toggle"
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={
                    showPassword ? "Sembunyikan password" : "Tampilkan password"
                  }
                >
                  <i
                    className={`bi ${showPassword ? "bi-eye-slash" : "bi-eye"}`}
                    aria-hidden="true"
                  />
                </button>
              </div>
            </div>

            <div className="login-assist">
              <Link to="/forgot-password">Lupa password?</Link>
            </div>

            <button
              className="btn btn-primary btn-block login-submit"
              type="submit"
              disabled={formik.isSubmitting}
            >
              {formik.isSubmitting ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  Memproses...
                </>
              ) : (
                "Masuk"
              )}
            </button>
          </form>

          <p className="login-note">
            Butuh akun?{" "}
            <strong>
              {isVendor ? "Hubungi administrator vendor." : "Hubungi IT rumah sakit."}
            </strong>
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
