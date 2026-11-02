import { useEffect, useState } from "react";
import BrandMark from "../../../components/ui/BrandMark";
import { useTenant } from "../../../app/providers/TenantProvider";
import { tenantLogoUrl } from "../../../lib/branding";
import {
  getErrorMessage,
  removeTenantLogo,
  uploadTenantLogo,
} from "../../../lib/api";

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp"];

export default function IdentityTab() {
  const { tenant, reloadTenants } = useTenant();
  const [logo, setLogo] = useState(tenant?.logo || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setLogo(tenant?.logo || "");
  }, [tenant?.logo]);

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

  const previewTenant = tenant ? { ...tenant, logo } : null;

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
    </>
  );
}
