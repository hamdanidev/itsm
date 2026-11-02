import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { pb } from "../../lib/pocketbase";
import { getErrorMessage } from "../../lib/api";
import AuthBrand from "./AuthBrand";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = "Buat password baru · Healthcare ITSM";
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password baru minimal 8 karakter.");
      return;
    }
    if (password !== confirm) {
      setError("Konfirmasi password tidak sama.");
      return;
    }

    setSubmitting(true);

    try {
      await pb
        .collection("users")
        .confirmPasswordReset(token, password, confirm);
      navigate("/login?reset=1", { replace: true });
    } catch (err) {
      const message = getErrorMessage(err);
      setError(
        /invalid|expired|token/i.test(message)
          ? "Tautan reset tidak valid atau sudah kedaluwarsa. Minta tautan baru."
          : message
      );
    } finally {
      setSubmitting(false);
    }
  }

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

              <form className="login-form" onSubmit={handleSubmit}>
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
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
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
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    required
                  />
                </div>

                <button
                  className="btn btn-primary btn-block login-submit"
                  type="submit"
                  disabled={submitting}
                >
                  {submitting ? (
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
      </footer>
    </div>
  );
}
