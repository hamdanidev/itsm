import { useEffect, useState } from "react";
import BrandMark from "../../../components/ui/BrandMark";
import { useMeta } from "../../../app/providers/MetaProvider";
import { useTenant } from "../../../app/providers/TenantProvider";
import { tenantLogoUrl } from "../../../lib/branding";
import { timeZoneLabel, timeZoneOptions } from "../../../lib/timezones";
import {
  getErrorMessage,
  removeTenantLogo,
  updateTenantTimezone,
  uploadTenantLogo,
} from "../../../lib/api";

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp"];
const TIMEZONES = timeZoneOptions();

export default function IdentityTab() {
  const { tenant, reloadTenants } = useTenant();
  const { isVendor } = useMeta();
  const [logo, setLogo] = useState(tenant?.logo || "");
  const [zone, setZone] = useState(tenant?.timezone || "Asia/Jakarta");
  const [busy, setBusy] = useState(false);
  const [zoneBusy, setZoneBusy] = useState(false);
  const [error, setError] = useState("");
  const [zoneError, setZoneError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setLogo(tenant?.logo || "");
  }, [tenant?.logo]);

  useEffect(() => {
    setZone(tenant?.timezone || "Asia/Jakarta");
  }, [tenant?.timezone]);

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError("");
    setNotice("");

    if (!TYPES.includes(file.type)) {
      setError("Gunakan logo PNG, JPG, atau WEBP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Ukuran logo maksimal 2 MB.");
      return;
    }

    setBusy(true);

    try {
      const result = await uploadTenantLogo(file);
      setLogo(result.tenant.logo);
      setNotice("Logo rumah sakit diperbarui.");
      reloadTenants();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      await removeTenantLogo();
      setLogo("");
      setNotice("Logo rumah sakit dihapus.");
      reloadTenants();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Zona waktu hanya bisa diubah di instalasi standalone: pada mode vendor,
  // konsol vendor yang mengelola konfigurasi tiap rumah sakit.
  async function handleSaveZone() {
    setZoneBusy(true);
    setZoneError("");
    setNotice("");

    try {
      const result = await updateTenantTimezone(zone);
      setZone(result.tenant.timezone);
      setNotice(
        "Zona waktu diperbarui. Tiket baru memakai zona ini; tiket lama tetap memakai zona saat dibuat."
      );
      // Muat ulang konteks tenant agar format tanggal di UI ikut berubah.
      reloadTenants();
    } catch (err) {
      setZoneError(getErrorMessage(err));
    } finally {
      setZoneBusy(false);
    }
  }

  const previewTenant = tenant ? { ...tenant, logo } : null;
  const zoneChanged = zone !== (tenant?.timezone || "Asia/Jakarta");

  return (
    <>
      {error && (
        <div className="alert alert--error" role="alert">
          <i className="bi bi-exclamation-triangle" aria-hidden="true" />
          <div>{error}</div>
        </div>
      )}

      {notice && (
        <div className="alert alert--success" role="status">
          <i className="bi bi-check-circle" aria-hidden="true" />
          <div>{notice}</div>
        </div>
      )}

      <div className="list-panel admin-panel">
        <div className="identity-panel">
          <div className="identity-preview">
            {logo ? (
              <img src={tenantLogoUrl(previewTenant)} alt="Logo rumah sakit" />
            ) : (
              <BrandMark size={72} />
            )}
          </div>

          <div className="identity-copy">
            <h2 className="identity-name">{tenant?.name || "Rumah sakit"}</h2>
            <p className="identity-meta">
              {tenant?.code ? `Kode ${tenant.code}` : "Identitas rumah sakit"}
            </p>

            <p className="hint">
              Logo tampil di sidebar, halaman masuk, dan tab ini. Gunakan PNG,
              JPG, atau WEBP maksimal 2 MB dengan latar transparan atau putih.
            </p>

            <div className="identity-actions">
              <input
                id="tenant-logo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="visually-hidden"
                onChange={handleUpload}
                disabled={busy}
              />
              <label
                className={`btn btn-primary${busy ? " is-disabled" : ""}`}
                htmlFor="tenant-logo"
              >
                {busy ? (
                  <span className="spinner" aria-hidden="true" />
                ) : (
                  <i className="bi bi-image" aria-hidden="true" />
                )}
                {logo ? "Ganti logo" : "Unggah logo"}
              </label>

              {logo && (
                <button
                  className="btn btn-outline-danger"
                  type="button"
                  onClick={handleRemove}
                  disabled={busy}
                >
                  <i className="bi bi-trash3" aria-hidden="true" />
                  Hapus logo
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="list-panel admin-panel">
        <div className="identity-panel">
          <div className="identity-copy">
            <h2 className="identity-name">Zona waktu</h2>
            <p className="identity-meta">
              {isVendor
                ? "Dikelola dari Konsol Vendor"
                : timeZoneLabel(tenant?.timezone) || "—"}
            </p>

            {isVendor ? (
              <p className="hint">
                Pada instalasi yang mengelola banyak rumah sakit, zona waktu
                diubah vendor lewat Konsol Vendor agar konfigurasi SLA tetap
                terkendali.
              </p>
            ) : (
              <>
                <p className="hint">
                  Zona ini dipakai menghitung SLA, menampilkan tanggal, dan
                  menjadwalkan laporan. Perubahan berlaku untuk tiket baru;
                  tiket yang sudah ada tetap memakai zona saat dibuat. Hari
                  libur tidak berubah karena disimpan sebagai tanggal kalender.
                </p>

                {zoneError && (
                  <div className="alert alert--error" role="alert">
                    <i
                      className="bi bi-exclamation-triangle"
                      aria-hidden="true"
                    />
                    <div>{zoneError}</div>
                  </div>
                )}

                <div className="field-row">
                  <label className="form-label" htmlFor="tenant-timezone">
                    Zona waktu rumah sakit
                  </label>
                  <select
                    id="tenant-timezone"
                    className="select"
                    value={zone}
                    onChange={(event) => setZone(event.target.value)}
                    disabled={zoneBusy}
                  >
                    {TIMEZONES.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="identity-actions">
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={handleSaveZone}
                    disabled={zoneBusy || !zoneChanged}
                  >
                    {zoneBusy ? (
                      <span className="spinner" aria-hidden="true" />
                    ) : (
                      <i className="bi bi-clock" aria-hidden="true" />
                    )}
                    Simpan zona waktu
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
