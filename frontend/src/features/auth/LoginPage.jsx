import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../app/providers/AuthProvider";
import { getErrorMessage } from "../../lib/api";
import BrandMark from "../../components/ui/BrandMark";

export default function LoginPage() {
  const { ready, isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const from = location.state?.from?.pathname || "/";

  useEffect(() => {
    document.title = "Masuk · Healthcare ITSM";
  }, []);

  if (ready && isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      const message = getErrorMessage(err);
      setError(
        /failed to authenticate/i.test(message)
          ? "Email atau password salah. Periksa kembali lalu coba lagi."
          : message
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <main className="login-main">
        <div className="login-brand">
          <BrandMark size={28} />
          <span>Healthcare ITSM</span>
        </div>

        <section className="login-card" aria-labelledby="login-title">
          <h1 className="login-title" id="login-title">
            Masuk ke Healthcare ITSM
          </h1>
          <p className="login-sub">
            Gunakan akun staf rumah sakit atau akun vendor yang diberikan
            administrator.
          </p>

          {new URLSearchParams(location.search).get("changed") === "1" &&
            !error && (
              <div className="login-notice" role="status">
                <i className="bi bi-check2-circle" aria-hidden="true" />
                <div>Password berhasil diubah. Silakan masuk dengan password baru.</div>
              </div>
            )}

          {error && (
            <div className="login-error" role="alert">
              <i className="bi bi-exclamation-circle" aria-hidden="true" />
              <div>{error}</div>
            </div>
          )}

          <form className="login-form" onSubmit={handleSubmit}>
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
                value={email}
                onChange={(event) => setEmail(event.target.value)}
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
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
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

            <button
              className="btn btn-primary btn-block login-submit"
              type="submit"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  Memproses...
                </>
              ) : (
                "Masuk"
              )}
            </button>
          </form>

          <p className="login-help">
            Lupa password atau belum punya akun? <strong>Hubungi IT Support</strong>{" "}
            melalui kanal resmi rumah sakit.
          </p>
        </section>
      </main>

      <footer className="login-footer">
        <span>© 2026 Healthcare ITSM</span>
        <span className="sep" aria-hidden="true">
          ·
        </span>
        <span>Hanya untuk staf berwenang</span>
        <span className="sep" aria-hidden="true">
          ·
        </span>
        <span>Aktivitas login diaudit</span>
      </footer>
    </div>
  );
}
