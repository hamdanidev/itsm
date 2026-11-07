import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import EmptyState from "../../../components/ui/EmptyState";
import Modal from "../../../components/ui/Modal";
import {
  createIntakePoint,
  fetchIntakePoints,
  getErrorMessage,
  rotateIntakePoint,
  updateIntakePoint,
} from "../../../lib/api";
import { formatDateTime } from "../../../lib/format";

function publicUrl(token) {
  return `${window.location.origin}/i/${token}`;
}

function qrImage(token) {
  return QRCode.toDataURL(publicUrl(token), {
    width: 360,
    margin: 1,
    color: { dark: "#172B4D", light: "#FFFFFF" },
  });
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default function IntakePointsTab({ units = [] }) {
  const [points, setPoints] = useState([]);
  const [qrMap, setQrMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState({
    name: "",
    unit: "",
    location: "",
    max_per_hour: 20,
    is_active: true,
  });

  const unitOptions = useMemo(
    () => [...units].sort((a, b) => String(a.name).localeCompare(String(b.name))),
    [units]
  );

  async function load() {
    setLoading(true);
    setError("");

    try {
      const result = await fetchIntakePoints();
      const items = result.items || [];
      setPoints(items);

      const images = {};
      await Promise.all(
        items.map(async (point) => {
          try {
            images[point.id] = await qrImage(point.token);
          } catch {
            images[point.id] = "";
          }
        })
      );
      setQrMap(images);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setNotice("");
    setError("");
    setModal({ record: null });
    setForm({
      name: "",
      unit: unitOptions[0]?.id || "",
      location: "",
      max_per_hour: 20,
      is_active: true,
    });
  }

  function openEdit(point) {
    setNotice("");
    setError("");
    setModal({ record: point });
    setForm({
      name: point.name || "",
      unit: point.unit || "",
      location: point.location || "",
      max_per_hour: Number(point.max_per_hour) || 20,
      is_active: Boolean(point.is_active),
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (String(form.name).trim().length < 2) {
      setError("Nama titik minimal 2 karakter.");
      return;
    }
    if (!form.unit) {
      setError("Pilih unit untuk titik ini.");
      return;
    }

    setBusy("save");

    try {
      if (modal?.record) {
        await updateIntakePoint(modal.record.id, {
          name: form.name.trim(),
          unit: form.unit,
          location: form.location.trim(),
          max_per_hour: Number(form.max_per_hour) || 20,
          is_active: Boolean(form.is_active),
        });
        setNotice("Titik QR diperbarui.");
      } else {
        await createIntakePoint({
          name: form.name.trim(),
          unit: form.unit,
          location: form.location.trim(),
          max_per_hour: Number(form.max_per_hour) || 20,
        });
        setNotice("Titik QR dibuat. Cetak QR dan tempel di unit terkait.");
      }

      setModal(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy("");
    }
  }

  async function toggleActive(point) {
    setBusy(point.id);
    setError("");
    setNotice("");

    try {
      await updateIntakePoint(point.id, { is_active: !point.is_active });
      setNotice(
        `${point.name} ${point.is_active ? "dinonaktifkan" : "diaktifkan"}.`
      );
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy("");
    }
  }

  async function rotate(point) {
    if (
      !window.confirm(
        "Ganti token? QR lama tidak akan berfungsi lagi dan harus dicetak ulang."
      )
    ) {
      return;
    }

    setBusy(point.id);
    setError("");
    setNotice("");

    try {
      await rotateIntakePoint(point.id);
      setNotice("Token diganti. Cetak ulang QR untuk titik ini.");
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy("");
    }
  }

  async function copyLink(point) {
    const url = publicUrl(point.token);

    try {
      await navigator.clipboard.writeText(url);
      setNotice("Tautan disalin.");
    } catch {
      window.prompt("Salin tautan ini:", url);
    }
  }

  async function printPoint(point) {
    let image = qrMap[point.id];

    if (!image) {
      try {
        image = await qrImage(point.token);
      } catch (err) {
        setError("Gagal membuat QR: " + getErrorMessage(err));
        return;
      }
    }

    const win = window.open("", "_blank", "width=720,height=900");

    if (!win) {
      setError("Popup diblokir. Izinkan popup untuk mencetak QR.");
      return;
    }

    win.document.write(`<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>QR ${escapeHtml(point.name)}</title>
  <style>
    @page { size: A5; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #172B4D; }
    .card { border: 2px solid #172B4D; border-radius: 12px; padding: 18px; text-align: center; }
    .eyebrow { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: #6B778C; }
    h1 { margin: 4px 0 2px; font-size: 28px; }
    .unit { font-size: 16px; font-weight: 700; margin: 2px 0 10px; }
    img { width: 240px; height: 240px; display: block; margin: 0 auto; }
    .steps { margin: 12px auto 0; max-width: 330px; text-align: left; font-size: 12px; line-height: 1.6; }
    .url { margin-top: 10px; font-size: 10px; color: #6B778C; word-break: break-all; }
    .foot { margin-top: 10px; font-size: 10px; color: #6B778C; }
    @media print { .card { break-inside: avoid; } }
  </style>
</head>
<body>
  <div class="card">
    <div class="eyebrow">Layanan TI Rumah Sakit</div>
    <h1>Lapor IT</h1>
    <div class="unit">${escapeHtml(point.unit_name || "")}${
      point.location ? " · " + escapeHtml(point.location) : ""
    }</div>
    <img src="${image}" alt="QR Lapor IT" />
    <div class="steps">
      1. Buka kamera atau aplikasi QR di ponsel.<br/>
      2. Pindai kode di atas.<br/>
      3. Isi laporan, lampirkan screenshot bila ada, lalu kirim.
    </div>
    <div class="url">${escapeHtml(publicUrl(point.token))}</div>
    <div class="foot">Jangan cantumkan data pasien pada laporan.</div>
  </div>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`);
    win.document.close();
  }

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
        <div className="panel-head">
          <div>
            <div className="panel-title">Titik QR intake</div>
            <div className="hint">
              Tempel QR di unit. Staf memindai, mengisi form tanpa login, dan
              tiket langsung masuk ke tim yang tepat.
            </div>
          </div>
          <button className="btn btn-primary" type="button" onClick={openCreate}>
            <i className="bi bi-plus-lg" aria-hidden="true" />
            Tambah titik
          </button>
        </div>

        {loading ? (
          <div className="panel-body">
            <div className="qr-grid">
              {[1, 2, 3].map((item) => (
                <div className="qr-card qr-card--skeleton" key={item} />
              ))}
            </div>
          </div>
        ) : points.length === 0 ? (
          <EmptyState
            icon="bi-qr-code"
            title="Belum ada titik QR"
            description="Buat titik untuk unit yang paling sering melapor, misalnya IGD atau Farmasi."
            action={
              <button className="btn btn-primary" type="button" onClick={openCreate}>
                <i className="bi bi-plus-lg" aria-hidden="true" />
                Tambah titik pertama
              </button>
            }
          />
        ) : (
          <div className="panel-body">
            <div className="qr-grid">
              {points.map((point) => (
                <article
                  className={`qr-card${point.is_active ? "" : " is-inactive"}`}
                  key={point.id}
                >
                  <div className="qr-image">
                    {qrMap[point.id] ? (
                      <img src={qrMap[point.id]} alt={`QR ${point.name}`} />
                    ) : (
                      <span className="spinner spinner--dark" aria-hidden="true" />
                    )}
                  </div>

                  <div className="qr-copy">
                    <div className="qr-name">{point.name}</div>
                    <div className="qr-meta">
                      {point.unit_name}
                      {point.location ? ` · ${point.location}` : ""}
                    </div>
                    <div className="qr-url">{publicUrl(point.token)}</div>
                    <div className="qr-status">
                      <span
                        className={`lozenge ${
                          point.is_active ? "status-resolved" : "lozenge--neutral"
                        }`}
                      >
                        {point.is_active ? "Aktif" : "Nonaktif"}
                      </span>
                      <span className="muted">
                        {point.last_used_at
                          ? `Terakhir dipakai ${formatDateTime(point.last_used_at)}`
                          : "Belum pernah dipakai"}
                      </span>
                    </div>

                    <div className="qr-actions">
                      <button
                        className="btn btn-subtle btn-sm"
                        type="button"
                        onClick={() => copyLink(point)}
                      >
                        <i className="bi bi-link-45deg" aria-hidden="true" />
                        Salin tautan
                      </button>
                      <button
                        className="btn btn-subtle btn-sm"
                        type="button"
                        onClick={() => printPoint(point)}
                      >
                        <i className="bi bi-printer" aria-hidden="true" />
                        Cetak
                      </button>
                      <button
                        className="btn btn-subtle btn-sm"
                        type="button"
                        onClick={() => openEdit(point)}
                      >
                        <i className="bi bi-pencil" aria-hidden="true" />
                        Edit
                      </button>
                      <button
                        className="btn btn-subtle btn-sm"
                        type="button"
                        disabled={busy === point.id}
                        onClick={() => rotate(point)}
                      >
                        <i className="bi bi-arrow-repeat" aria-hidden="true" />
                        Ganti token
                      </button>
                      <button
                        className="btn btn-subtle btn-sm"
                        type="button"
                        disabled={busy === point.id}
                        onClick={() => toggleActive(point)}
                      >
                        <i
                          className={`bi ${
                            point.is_active ? "bi-pause-circle" : "bi-play-circle"
                          }`}
                          aria-hidden="true"
                        />
                        {point.is_active ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="admin-note">
        <i className="bi bi-info-circle" aria-hidden="true" />
        QR hanya membuka form publik. Tidak ada data pengguna, aset, atau tiket
        lain yang ditampilkan. Ganti token bila stiker dicetak ulang atau
        disalahgunakan.
      </p>

      {modal && (
        <Modal
          title={modal.record ? "Edit titik QR" : "Tambah titik QR"}
          description="Satu titik mewakili satu unit/lokasi. Unit dipakai sebagai unit pemohon pada tiket tamu."
          onClose={() => {
            if (busy !== "save") setModal(null);
          }}
          footer={
            <>
              <button
                className="btn btn-subtle"
                type="button"
                onClick={() => setModal(null)}
                disabled={busy === "save"}
              >
                Batal
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                form="intake-point-form"
                disabled={busy === "save"}
              >
                {busy === "save" ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    Menyimpan...
                  </>
                ) : (
                  "Simpan"
                )}
              </button>
            </>
          }
        >
          <form id="intake-point-form" onSubmit={handleSubmit}>
            <div className="field-row">
              <label className="form-label" htmlFor="point-name">
                Nama titik <span className="req">*</span>
              </label>
              <input
                id="point-name"
                className="input"
                maxLength={120}
                placeholder="Contoh: IGD — Nurse Station"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                autoFocus
              />
            </div>

            <div className="form-grid" style={{ marginTop: 16 }}>
              <div>
                <label className="form-label" htmlFor="point-unit">
                  Unit <span className="req">*</span>
                </label>
                <select
                  id="point-unit"
                  className="select"
                  value={form.unit}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      unit: event.target.value,
                    }))
                  }
                >
                  <option value="">Pilih unit</option>
                  {unitOptions.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label" htmlFor="point-location">
                  Lokasi di unit
                </label>
                <input
                  id="point-location"
                  className="input"
                  maxLength={120}
                  placeholder="Contoh: Nurse station lantai 1"
                  value={form.location}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      location: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="form-grid" style={{ marginTop: 16 }}>
              <div>
                <label className="form-label" htmlFor="point-limit">
                  Batas tiket per jam
                </label>
                <input
                  id="point-limit"
                  className="input"
                  type="number"
                  min={1}
                  max={200}
                  value={form.max_per_hour}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      max_per_hour: event.target.value,
                    }))
                  }
                />
                <div className="hint">
                  Melindungi dari spam jika QR tersebar. Default 20.
                </div>
              </div>

              {modal.record && (
                <div>
                  <span className="form-label">Status</span>
                  <label className="checkline">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          is_active: event.target.checked,
                        }))
                      }
                    />
                    <span>Aktif</span>
                  </label>
                </div>
              )}
            </div>

            <div className="callout callout--info" style={{ marginTop: 16 }}>
              <i className="bi bi-info-circle" aria-hidden="true" />
              <div>
                Unit menentukan unit pemohon pada tiket tamu. Lokasi akan
                terisi otomatis saat staf memindai QR.
              </div>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
