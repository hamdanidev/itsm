import { useState } from "react";
import QRCode from "qrcode";
import Modal from "../../../components/ui/Modal";
import {
  confirmTwoFactor,
  disableTwoFactor,
  getErrorMessage,
  startTwoFactor,
} from "../../../lib/api";

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

// Bagian 2FA di panel Keamanan profil. Alur pendaftaran: konfirmasi password ->
// pindai QR / salin kunci -> masukkan kode 6 digit -> simpan kode pemulihan.
export default function TwoFactorSection({ profile, onChanged }) {
  const enabled = Boolean(profile?.totp_enabled);

  const [mode, setMode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [secret, setSecret] = useState("");
  const [otpauthUri, setOtpauthUri] = useState("");
  const [qrImage, setQrImage] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [copied, setCopied] = useState("");

  function resetTransient() {
    setPassword("");
    setCode("");
    setSecret("");
    setOtpauthUri("");
    setQrImage("");
    setRecoveryCodes([]);
    setError("");
    setCopied("");
  }

  function close() {
    if (busy) return;
    setMode("");
    resetTransient();
  }

  function openStart() {
    resetTransient();
    setNotice("");
    setMode("start");
  }

  function openDisable() {
    resetTransient();
    setNotice("");
    setMode("disable");
  }

  async function beginEnrollment(event) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const started = await startTwoFactor(password);
      setSecret(started.secret);
      setOtpauthUri(started.otpauth_uri);
      setMode("confirm");

      try {
        const image = await QRCode.toDataURL(started.otpauth_uri, {
          margin: 1,
          width: 220,
        });
        setQrImage(image);
      } catch {
        setQrImage("");
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnrollment(event) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const confirmed = await confirmTwoFactor(code);
      setRecoveryCodes(confirmed.recovery_codes || []);
      setMode("recovery");
      setNotice("Autentikasi dua faktor aktif.");
      await onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function turnOff(event) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      await disableTwoFactor(password, code);
      setMode("");
      resetTransient();
      setNotice("Autentikasi dua faktor dinonaktifkan.");
      await onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function copy(value, label) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      setCopied("");
    }
  }

  function downloadCodes() {
    downloadText(
      "kode-pemulihan-2fa.txt",
      [
        "Kode pemulihan autentikasi dua faktor Healthcare ITSM",
        "Setiap kode hanya dapat dipakai satu kali.",
        "",
        ...recoveryCodes,
        "",
      ].join("\r\n")
    );
  }

  return (
    <>
      <div className="security-block">
        <div className="security-head">
          <div>
            <div className="security-title">
              <i className="bi bi-shield-lock" aria-hidden="true" />
              Autentikasi dua faktor (TOTP)
            </div>
            <p className="hint">
              Minta kode 6 digit dari aplikasi authenticator setiap kali masuk.
              Disarankan untuk akun yang dapat mengubah data atau menyetujui
              permintaan.
            </p>
          </div>
          <span
            className={`lozenge ${enabled ? "status-resolved" : "lozenge--neutral"}`}
          >
            {enabled ? "Aktif" : "Nonaktif"}
          </span>
        </div>

        {notice && (
          <div className="alert alert--success" role="status">
            <i className="bi bi-check-circle" aria-hidden="true" />
            <div>{notice}</div>
          </div>
        )}

        <div className="security-actions">
          {enabled ? (
            <button
              className="btn btn-outline-danger btn-sm"
              type="button"
              onClick={openDisable}
            >
              <i className="bi bi-shield-slash" aria-hidden="true" />
              Nonaktifkan 2FA
            </button>
          ) : (
            <button className="btn btn-outline btn-sm" type="button" onClick={openStart}>
              <i className="bi bi-shield-check" aria-hidden="true" />
              Aktifkan 2FA
            </button>
          )}
        </div>
      </div>

      {mode === "start" && (
        <Modal
          title="Aktifkan autentikasi dua faktor"
          description="Konfirmasi password Anda sebelum mengatur aplikasi authenticator."
          onClose={close}
          footer={
            <>
              <button
                className="btn btn-subtle"
                type="button"
                onClick={close}
                disabled={busy}
              >
                Batal
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                form="totp-start-form"
                disabled={busy || !password}
              >
                {busy ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    Memeriksa...
                  </>
                ) : (
                  "Lanjut"
                )}
              </button>
            </>
          }
        >
          <form id="totp-start-form" onSubmit={beginEnrollment}>
            {error && (
              <div className="alert alert--error" role="alert">
                <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                <div>{error}</div>
              </div>
            )}

            <div className="field-row">
              <label className="form-label" htmlFor="totp-current-password">
                Password saat ini <span className="req">*</span>
              </label>
              <input
                id="totp-current-password"
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
          </form>
        </Modal>
      )}

      {mode === "confirm" && (
        <Modal
          title="Pindai kode QR"
          description="Pindai dengan Google Authenticator, Microsoft Authenticator, atau aplikasi TOTP lain, lalu masukkan kode 6 digit."
          onClose={close}
          footer={
            <>
              <button
                className="btn btn-subtle"
                type="button"
                onClick={close}
                disabled={busy}
              >
                Batal
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                form="totp-confirm-form"
                disabled={busy || !code}
              >
                {busy ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    Memverifikasi...
                  </>
                ) : (
                  "Aktifkan 2FA"
                )}
              </button>
            </>
          }
        >
          {error && (
            <div className="alert alert--error" role="alert">
              <i className="bi bi-exclamation-triangle" aria-hidden="true" />
              <div>{error}</div>
            </div>
          )}

          <div className="totp-enroll">
            {qrImage ? (
              <img className="totp-qr" src={qrImage} alt="Kode QR 2FA" />
            ) : (
              <div className="totp-qr totp-qr--fallback">
                <i className="bi bi-qr-code" aria-hidden="true" />
              </div>
            )}

            <div className="totp-enroll-info">
              <div className="form-label">Tidak bisa memindai?</div>
              <p className="hint">
                Masukkan kunci ini secara manual di aplikasi authenticator
                (tipe: waktu berbasis, 6 digit, 30 detik).
              </p>
              <div className="secret-box totp-secret-box">
                <code className="totp-secret">{secret}</code>
                <button
                  className="btn btn-outline btn-sm"
                  type="button"
                  onClick={() => copy(secret, "secret")}
                >
                  <i className="bi bi-clipboard" aria-hidden="true" />
                  {copied === "secret" ? "Tersalin" : "Salin"}
                </button>
              </div>
              <p className="hint totp-uri">{otpauthUri}</p>
            </div>
          </div>

          <form id="totp-confirm-form" onSubmit={confirmEnrollment}>
            <div className="field-row">
              <label className="form-label" htmlFor="totp-code">
                Kode 6 digit <span className="req">*</span>
              </label>
              <input
                id="totp-code"
                className="input totp-code-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
              />
            </div>
          </form>
        </Modal>
      )}

      {mode === "recovery" && (
        <Modal
          title="Simpan kode pemulihan"
          description="Kode ini hanya ditampilkan sekali. Gunakan bila perangkat authenticator hilang."
          onClose={close}
          footer={
            <>
              <button
                className="btn btn-outline"
                type="button"
                onClick={downloadCodes}
              >
                <i className="bi bi-download" aria-hidden="true" />
                Unduh kode
              </button>
              <button className="btn btn-primary" type="button" onClick={close}>
                Selesai
              </button>
            </>
          }
        >
          <div className="alert alert--warning" role="alert">
            <i className="bi bi-exclamation-triangle" aria-hidden="true" />
            <div>
              Simpan di tempat aman. Setiap kode hanya dapat dipakai satu kali;
              bila semuanya hilang, IT Lead harus mereset 2FA akun Anda.
            </div>
          </div>

          <div className="totp-codes">
            {recoveryCodes.map((recoveryCode) => (
              <code key={recoveryCode}>{recoveryCode}</code>
            ))}
          </div>

          <div className="security-actions" style={{ marginTop: 12 }}>
            <button
              className="btn btn-subtle btn-sm"
              type="button"
              onClick={() => copy(recoveryCodes.join("\n"), "codes")}
            >
              <i className="bi bi-clipboard" aria-hidden="true" />
              {copied === "codes" ? "Tersalin" : "Salin semua"}
            </button>
          </div>
        </Modal>
      )}

      {mode === "disable" && (
        <Modal
          title="Nonaktifkan autentikasi dua faktor"
          description="Masukkan password dan kode 2FA yang valid. Tindakan ini mengurangi keamanan akun."
          onClose={close}
          footer={
            <>
              <button
                className="btn btn-subtle"
                type="button"
                onClick={close}
                disabled={busy}
              >
                Batal
              </button>
              <button
                className="btn btn-danger"
                type="submit"
                form="totp-disable-form"
                disabled={busy || !password || !code}
              >
                {busy ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    Menonaktifkan...
                  </>
                ) : (
                  "Nonaktifkan 2FA"
                )}
              </button>
            </>
          }
        >
          <form id="totp-disable-form" onSubmit={turnOff}>
            {error && (
              <div className="alert alert--error" role="alert">
                <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                <div>{error}</div>
              </div>
            )}

            <div className="field-row">
              <label className="form-label" htmlFor="totp-disable-password">
                Password saat ini <span className="req">*</span>
              </label>
              <input
                id="totp-disable-password"
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>

            <div className="field-row" style={{ marginTop: 16 }}>
              <label className="form-label" htmlFor="totp-disable-code">
                Kode 2FA atau kode pemulihan <span className="req">*</span>
              </label>
              <input
                id="totp-disable-code"
                className="input"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
              />
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
