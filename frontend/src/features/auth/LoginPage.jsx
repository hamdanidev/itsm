import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../app/providers/AuthProvider";
import { getErrorMessage } from "../../lib/api";

export default function LoginPage() {
  const { ready, isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const from = location.state?.from?.pathname || "/tickets";

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
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="container py-4 py-lg-5">
        <div className="row g-0 login-shell overflow-hidden">
          <div className="col-lg-6 login-hero p-4 p-lg-5 text-white d-flex flex-column">
            <div className="d-flex align-items-center gap-2 mb-5">
              <span className="app-brand-mark app-brand-mark-light">
                <i className="bi bi-plus-lg" />
              </span>
              <span className="fs-5">
                Healthcare <strong>ITSM</strong>
              </span>
            </div>

            <div className="my-auto">
              <span className="badge rounded-pill text-bg-light mb-3">
                Portal layanan TI rumah sakit
              </span>
              <h1 className="display-5 fw-bold lh-sm mb-3">
                Satu pintu untuk insiden, permintaan, dan perubahan SIMRS.
              </h1>
              <p className="lead text-white-50 mb-4">
                Laporkan gangguan, minta akses, dan ajukan perubahan secara
                terstruktur. Semua tiket tercatat, memiliki SLA, dan dapat
                diaudit.
              </p>

              <div className="row g-3 mt-4">
                <div className="col-sm-6">
                  <div className="login-feature">
                    <i className="bi bi-shield-check" />
                    <div>
                      <strong>Akses berbasis peran</strong>
                      <div className="small text-white-50">
                        Requester, IT Support, IT Lead
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-sm-6">
                  <div className="login-feature">
                    <i className="bi bi-stopwatch" />
                    <div>
                      <strong>SLA terukur</strong>
                      <div className="small text-white-50">
                        Prioritas berbasis dampak klinis
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-sm-6">
                  <div className="login-feature">
                    <i className="bi bi-journal-check" />
                    <div>
                      <strong>Jejak audit</strong>
                      <div className="small text-white-50">
                        Append-only dan tidak dapat diubah
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-sm-6">
                  <div className="login-feature">
                    <i className="bi bi-lock" />
                    <div>
                      <strong>Tanpa data pasien</strong>
                      <div className="small text-white-50">
                        Gunakan referensi non-identitas
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="small text-white-50 mt-5">
              Hanya untuk staf yang berwenang. Aktivitas login diaudit.
            </div>
          </div>

          <div className="col-lg-6 bg-white p-4 p-lg-5 d-flex align-items-center">
            <div className="w-100 mx-auto" style={{ maxWidth: 420 }}>
              <div className="mb-4">
                <div className="text-primary fw-semibold small text-uppercase letter-spacing mb-2">
                  Selamat datang
                </div>
                <h2 className="h3 fw-bold mb-2">Masuk ke Healthcare ITSM</h2>
                <p className="text-secondary mb-0">
                  Gunakan akun staf rumah sakit yang diberikan oleh tim IT.
                </p>
              </div>

              {error && (
                <div className="alert alert-danger d-flex gap-2" role="alert">
                  <i className="bi bi-exclamation-triangle-fill" />
                  <div>{error}</div>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label className="form-label fw-semibold" htmlFor="email">
                    Email
                  </label>
                  <div className="input-group input-group-lg">
                    <span className="input-group-text bg-white">
                      <i className="bi bi-envelope text-secondary" />
                    </span>
                    <input
                      id="email"
                      type="email"
                      className="form-control"
                      placeholder="nama@rs.example.com"
                      autoComplete="username"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label fw-semibold" htmlFor="password">
                    Password
                  </label>
                  <div className="input-group input-group-lg">
                    <span className="input-group-text bg-white">
                      <i className="bi bi-key text-secondary" />
                    </span>
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      className="form-control"
                      placeholder="Masukkan password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                    />
                    <button
                      className="btn btn-outline-secondary"
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={
                        showPassword ? "Sembunyikan password" : "Tampilkan password"
                      }
                    >
                      <i
                        className={`bi ${
                          showPassword ? "bi-eye-slash" : "bi-eye"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <button
                  className="btn btn-primary btn-lg w-100 mt-2"
                  type="submit"
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" />
                      Memproses...
                    </>
                  ) : (
                    <>
                      Masuk
                      <i className="bi bi-arrow-right ms-2" />
                    </>
                  )}
                </button>
              </form>

              <div className="alert alert-light border mt-4 mb-0 small">
                <i className="bi bi-info-circle me-2 text-primary" />
                Lupa password atau belum punya akun? Hubungi IT Support melalui
                kanal resmi rumah sakit.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
