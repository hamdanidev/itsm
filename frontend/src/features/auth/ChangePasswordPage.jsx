import { useState } from "react";
import { useAuth } from "../../app/providers/AuthProvider";
import { changePassword, getErrorMessage } from "../../lib/api";
import BrandMark from "../../components/ui/BrandMark";

// Halaman wajib ganti password: muncul sekali setelah login memakai password
// awal yang dibuat IT Lead. Setelah berhasil, sesi diakhiri dan pengguna masuk
// lagi dengan password baru.
export default function ChangePasswordPage() {
  const { user, logout } = useAuth();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (next.length < 8) {
      setError("Password baru minimal 8 karakter.");
      return;
    }
    if (next !== confirm) {
      setError("Konfirmasi password tidak sama.");
      return;
    }
    if (next === current) {
      setError("Password baru harus berbeda dari password awal.");
      return;
    }

    setSaving(true);

    try {
      await changePassword({
        current_password: current,
        new_password: next,
        new_password_confirm: confirm,
      });

      // Password berubah memutar tokenKey, jadi sesi ini memang berakhir.
      // Redirect keras (bukan navigasi SPA) dipakai agar guard auth tidak
      // membawa state `from=/change-password` ke halaman login.
      logout();
      window.location.replace("/login?changed=1");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="login-page">
      <main className="login-main">
        <div className="login-brand">
          <BrandMark size={30} />
          <span>Healthcare ITSM</span>
        </div>

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

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="login-field">
              <label className="form-label" htmlFor="current-password">
                Password awal
              </label>
              <input
                id="current-password"
                type="password"
                className="input"
                autoComplete="current-password"
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
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
                  value={next}
                  onChange={(event) => setNext(event.target.value)}
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
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                required
              />
            </div>

            <button
              className="btn btn-primary btn-block login-submit"
              type="submit"
              disabled={saving}
            >
              {saving ? (
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
    </div>
  );
}
