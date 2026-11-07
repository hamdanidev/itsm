import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import BrandMark from "../../../components/ui/BrandMark";
import { pb } from "../../../lib/pocketbase";
import {
  fetchPublicIntake,
  getErrorMessage,
  submitPublicIntake,
} from "../../../lib/api";
import { formatDateTime, priorityLabel } from "../../../lib/format";
import { teamLabel } from "../../../lib/teams";

const MAX_FILES = 3;
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "webp", "txt", "log"];

const TYPE_OPTIONS = [
  {
    value: "incident",
    title: "Laporkan gangguan",
    description: "Ada yang error, macet, atau tidak bisa dipakai.",
  },
  {
    value: "service_request",
    title: "Minta layanan",
    description: "Butuh akses, reset password, atau bantuan rutin.",
  },
];

function contactIsValid(value) {
  const text = String(value || "").trim();

  if (!text) return false;
  if (text.includes("@")) return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text);

  return /^[+0-9()\-\s]{6,30}$/.test(text);
}

function formatFileSize(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PublicIntakePage() {
  const { token } = useParams();
  const startedAt = useRef(Date.now());

  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState("");
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(null);

  const [values, setValues] = useState({
    type: "incident",
    service: "",
    service_item: "",
    impact: "operational",
    title: "",
    description: "",
    reporter_name: "",
    reporter_contact: "",
  });
  const [confirmed, setConfirmed] = useState(false);
  const [files, setFiles] = useState([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setFatal("");

      try {
        const data = await fetchPublicIntake(token);
        if (!active) return;
        setMeta(data);
        document.title = `Lapor IT · ${data.tenant?.name || "Rumah Sakit"}`;
      } catch (err) {
        if (active) setFatal(getErrorMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [token]);

  const services = meta?.services || [];
  const selectedService = useMemo(
    () => services.find((service) => service.id === values.service) || null,
    [services, values.service]
  );
  const items = selectedService?.items || [];
  const selectedItem = useMemo(
    () => items.find((item) => item.id === values.service_item) || null,
    [items, values.service_item]
  );

  const selectedImpact = useMemo(
    () =>
      (meta?.impacts || []).find((item) => item.value === values.impact) || null,
    [meta, values.impact]
  );

  // Pindah langkah selalu kembali ke atas kartu agar pengguna melihat awal
  // langkah baru (penting di ponsel setelah mengisi form panjang).
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step, created]);

  async function copyTicketNumber() {
    const text = String(created?.ticket_no || "");
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  }

  function setValue(key, value) {
    setValues((current) => {
      const next = { ...current, [key]: value };
      if (key === "service") next.service_item = "";
      return next;
    });
    setError("");
  }

  function validateStep(currentStep) {
    if (currentStep === 1) {
      if (!values.service) return "Pilih layanan yang paling sesuai.";
      if (!values.impact) return "Pilih dampak gangguan.";
    }

    if (currentStep === 2) {
      if (values.title.trim().length < 5) {
        return "Judul minimal 5 karakter.";
      }
      if (values.description.trim().length < 10) {
        return "Deskripsi minimal 10 karakter.";
      }
    }

    if (currentStep === 3) {
      if (values.reporter_name.trim().length < 2) {
        return "Isi nama Anda minimal 2 karakter.";
      }
      if (!contactIsValid(values.reporter_contact)) {
        return "Isi email atau nomor telepon/WhatsApp yang valid.";
      }
      if (!confirmed) {
        return "Centang pernyataan bahwa tiket tidak memuat data pasien.";
      }
    }

    return "";
  }

  function nextStep() {
    const message = validateStep(step);
    if (message) {
      setError(message);
      return;
    }
    setError("");
    setStep((current) => Math.min(3, current + 1));
  }

  function previousStep() {
    setError("");
    setStep((current) => Math.max(1, current - 1));
  }

  function addFiles(event) {
    const incoming = Array.from(event.target.files || []);
    event.target.value = "";
    const next = [...files];
    let message = "";

    for (const file of incoming) {
      if (next.length >= MAX_FILES) {
        message = "Maksimal 3 lampiran per tiket.";
        break;
      }

      const extension = String(file.name || "").split(".").pop().toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(extension)) {
        message = "Gunakan PDF, PNG, JPG, WEBP, TXT, atau LOG.";
        continue;
      }
      if (file.size > MAX_BYTES) {
        message = "Ukuran setiap lampiran maksimal 10 MB.";
        continue;
      }
      if (
        next.some(
          (item) => item.name === file.name && item.size === file.size
        )
      ) {
        continue;
      }

      next.push(file);
    }

    setFiles(next);
    setError(message);
  }

  function removeFile(index) {
    setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const message = validateStep(3);

    if (message) {
      setError(message);
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const result = await submitPublicIntake(
        token,
        {
          type: values.type,
          service: values.service,
          service_item: values.service_item,
          impact: values.impact,
          title: values.title.trim(),
          description: values.description.trim(),
          reporter_name: values.reporter_name.trim(),
          reporter_contact: values.reporter_contact.trim(),
          patient_data_confirmed: true,
          honeypot: "",
          form_started_at: startedAt.current,
        },
        files
      );

      setCreated(result);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setCreated(null);
    setStep(1);
    setValues({
      type: "incident",
      service: "",
      service_item: "",
      impact: "operational",
      title: "",
      description: "",
      reporter_name: "",
      reporter_contact: "",
    });
    setConfirmed(false);
    setFiles([]);
    setError("");
    startedAt.current = Date.now();
  }

  if (loading) {
    return (
      <div className="public-intake public-intake--center">
        <div className="public-intake-card public-intake-card--narrow">
          <span className="spinner spinner--dark" aria-hidden="true" />
          <p className="muted">Memuat form...</p>
        </div>
      </div>
    );
  }

  if (fatal || !meta) {
    return (
      <div className="public-intake public-intake--center">
        <div className="public-intake-card public-intake-card--narrow">
          <BrandMark size={52} />
          <h1 className="public-intake-error-title">Tautan tidak aktif</h1>
          <p className="muted">
            {fatal ||
              "Titik QR ini tidak ditemukan atau sudah dinonaktifkan. Hubungi tim IT rumah sakit untuk mendapatkan tautan baru."}
          </p>
        </div>
      </div>
    );
  }

  const logoUrl = meta.tenant?.logo_url
    ? `${pb.baseURL}${meta.tenant.logo_url}`
    : "";

  return (
    <div className="public-intake">
      <header className="public-intake-head">
        <div className="public-intake-brand">
          {logoUrl ? (
            <img
              className="public-intake-logo"
              src={logoUrl}
              alt={`Logo ${meta.tenant?.name || "rumah sakit"}`}
            />
          ) : (
            <BrandMark size={44} />
          )}
          <div>
            <div className="public-intake-tenant">
              {meta.tenant?.name || "Rumah Sakit"}
            </div>
            <div className="public-intake-title">Lapor IT</div>
          </div>
        </div>

        <div className="public-intake-context">
          <i className="bi bi-geo-alt" aria-hidden="true" />
          <span>
            {meta.point?.name}
            {meta.point?.location ? ` · ${meta.point.location}` : ""}
          </span>
        </div>
      </header>

      <main className="public-intake-card">
        {created ? (
          <section className="public-success">
            <div className="public-success-icon">
              <i className="bi bi-check-lg" aria-hidden="true" />
            </div>
            <h1 className="public-success-title">Tiket berhasil dibuat</h1>
            <p className="muted">
              Simpan nomor tiket ini. Tim IT akan menindaklanjuti sesuai
              prioritas dan SLA.
            </p>

            <div className="public-success-ticket">
              <span>{created.ticket_no}</span>
              <button
                type="button"
                className="public-copy"
                onClick={copyTicketNumber}
                aria-label="Salin nomor tiket"
              >
                <i
                  className={`bi ${copied ? "bi-check2" : "bi-clipboard"}`}
                  aria-hidden="true"
                />
                {copied ? "Tersalin" : "Salin"}
              </button>
            </div>

            {values.title && (
              <div className="public-success-report">
                <div className="public-success-report-title">
                  {values.title}
                </div>
                <div className="public-success-report-meta">
                  {values.type === "incident"
                    ? "Laporan gangguan"
                    : "Permintaan layanan"}
                  {selectedService ? ` · ${selectedService.name}` : ""}
                  {selectedImpact ? ` · ${selectedImpact.label}` : ""}
                </div>
              </div>
            )}

            <dl className="public-success-list">
              <div>
                <dt>Tim tujuan</dt>
                <dd>
                  {created.team ? teamLabel(created.team) : "Tim IT rumah sakit"}
                </dd>
              </div>
              <div>
                <dt>Prioritas</dt>
                <dd>
                  {created.priority ? priorityLabel(created.priority) : "—"}
                </dd>
              </div>
              {created.location && (
                <div>
                  <dt>Lokasi</dt>
                  <dd>{created.location}</dd>
                </div>
              )}
              <div>
                <dt>Batas respons</dt>
                <dd>{formatDateTime(created.response_due_at)}</dd>
              </div>
              {created.resolution_due_at && (
                <div>
                  <dt>Target selesai</dt>
                  <dd>{formatDateTime(created.resolution_due_at)}</dd>
                </div>
              )}
            </dl>

            <div className="public-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={resetForm}
              >
                Buat tiket lain
              </button>
              <a className="btn btn-subtle" href="/login">
                Masuk sebagai staf IT
              </a>
            </div>
          </section>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className="public-steps" aria-label="Langkah pengisian">
              {[1, 2, 3].map((number) => {
                const label =
                  number === 1 ? "Jenis" : number === 2 ? "Detail" : "Kontak";

                return (
                  <button
                    key={number}
                    type="button"
                    className={`public-step${
                      step === number ? " is-active" : ""
                    }${step > number ? " is-done" : ""}`}
                    aria-current={step === number ? "step" : undefined}
                    disabled={number >= step || submitting}
                    onClick={() => {
                      setError("");
                      setStep(number);
                    }}
                  >
                    <span className="public-step-number">
                      {step > number ? (
                        <i className="bi bi-check-lg" aria-hidden="true" />
                      ) : (
                        number
                      )}
                    </span>
                    <span className="public-step-label">{label}</span>
                  </button>
                );
              })}
            </div>

            <div className="public-progress">
              <span aria-live="polite">Langkah {step} dari 3</span>
              <div
                className="public-progress-track"
                role="presentation"
                aria-hidden="true"
              >
                <span style={{ width: `${(step / 3) * 100}%` }} />
              </div>
            </div>

            {error && (
              <div className="alert alert--error" role="alert">
                <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                <div>{error}</div>
              </div>
            )}

            {step === 1 && (
              <section className="public-section">
                <h2 className="public-section-title">Apa yang terjadi?</h2>
                <p className="public-section-hint">
                  Pilih jenis laporan, layanan, dan dampaknya.
                </p>

                <div className="public-choice-grid">
                  {TYPE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`public-choice${
                        values.type === option.value ? " is-selected" : ""
                      }`}
                      onClick={() => setValue("type", option.value)}
                      aria-pressed={values.type === option.value}
                    >
                      <i
                        className={`bi ${
                          option.value === "incident"
                            ? "bi-exclamation-octagon"
                            : "bi-bag-check"
                        }`}
                        aria-hidden="true"
                      />
                      <span>
                        <strong>{option.title}</strong>
                        <small>{option.description}</small>
                      </span>
                    </button>
                  ))}
                </div>

                <div className="field-row" style={{ marginTop: 20 }}>
                  <label className="form-label" htmlFor="public-service">
                    Layanan <span className="req">*</span>
                  </label>
                  <select
                    id="public-service"
                    className="select"
                    value={values.service}
                    onChange={(event) => setValue("service", event.target.value)}
                  >
                    <option value="">Pilih layanan</option>
                    {services.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedService && items.length > 0 && (
                  <div className="field-row">
                    <label className="form-label" htmlFor="public-item">
                      Jenis permintaan
                    </label>
                    <select
                      id="public-item"
                      className="select"
                      value={values.service_item}
                      onChange={(event) =>
                        setValue("service_item", event.target.value)
                      }
                    >
                      <option value="">Pilih item (opsional)</option>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {selectedItem?.description && (
                  <div className="callout callout--info">
                    <i className="bi bi-info-circle" aria-hidden="true" />
                    <div>{selectedItem.description}</div>
                  </div>
                )}

                <div className="field-row">
                  <span className="form-label">
                    Dampak <span className="req">*</span>
                  </span>
                  <div className="public-impact-list">
                    {(meta.impacts || []).map((impact) => (
                      <button
                        key={impact.value}
                        type="button"
                        className={`public-impact${
                          values.impact === impact.value ? " is-selected" : ""
                        }`}
                        onClick={() => setValue("impact", impact.value)}
                        aria-pressed={values.impact === impact.value}
                      >
                        <span className="radio-dot" aria-hidden="true" />
                        <span>
                          <strong>{impact.label}</strong>
                          <small>{impact.description}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {step === 2 && (
              <section className="public-section">
                <h2 className="public-section-title">Detail masalah</h2>
                <p className="public-section-hint">
                  Semakin jelas, semakin cepat tim IT menangani.
                </p>

                <div className="field-row">
                  <span className="form-label">Lokasi</span>
                  <div className="public-readonly">
                    <i className="bi bi-geo-alt" aria-hidden="true" />
                    {meta.point?.location ||
                      meta.point?.unit_name ||
                      "Lokasi mengikuti titik QR"}
                  </div>
                </div>

                <div className="field-row">
                  <label className="form-label" htmlFor="public-title">
                    Judul <span className="req">*</span>
                  </label>
                  <input
                    id="public-title"
                    className="input"
                    maxLength={160}
                    placeholder="Contoh: Modul pendaftaran gagal menyimpan kunjungan"
                    value={values.title}
                    onChange={(event) => setValue("title", event.target.value)}
                  />
                  <div className="hint">
                    Ringkas dan spesifik. Jangan sebut nama, NIK, atau nomor
                    rekam medis pasien.
                  </div>
                </div>

                <div className="field-row">
                  <label className="form-label" htmlFor="public-description">
                    Deskripsi <span className="req">*</span>
                  </label>
                  <textarea
                    id="public-description"
                    className="textarea"
                    rows={6}
                    maxLength={10000}
                    placeholder="Apa yang terjadi, kapan mulai, modul/unit terdampak, pesan error, dan langkah yang sudah dicoba."
                    value={values.description}
                    onChange={(event) =>
                      setValue("description", event.target.value)
                    }
                  />
                  <div className="char-count">
                    <span>Minimal 10 karakter.</span>
                    <span>{values.description.length}/10.000</span>
                  </div>
                </div>

                <div className="field-row">
                  <span className="form-label">Lampiran</span>
                  <label className="file-input public-file-input">
                    <input
                      type="file"
                      className="visually-hidden"
                      multiple
                      accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.log"
                      onChange={addFiles}
                    />
                    <span className="btn btn-outline btn-sm">
                      <i className="bi bi-paperclip" aria-hidden="true" />
                      Pilih file
                    </span>
                    <span className="file-input-name">
                      {files.length
                        ? `${files.length} file dipilih`
                        : "Belum ada file (opsional)"}
                    </span>
                  </label>
                  <div className="hint">
                    Screenshot sangat membantu untuk bug aplikasi. Maksimal 3
                    file, 10 MB per file.
                  </div>

                  {files.length > 0 && (
                    <ul className="public-file-list">
                      {files.map((file, index) => (
                        <li key={`${file.name}-${file.size}-${index}`}>
                          <i
                            className="bi bi-file-earmark"
                            aria-hidden="true"
                          />
                          <span className="public-file-name">{file.name}</span>
                          <span className="public-file-size">
                            {formatFileSize(file.size)}
                          </span>
                          <button
                            type="button"
                            className="icon-button"
                            onClick={() => removeFile(index)}
                            aria-label={`Hapus ${file.name}`}
                          >
                            <i className="bi bi-x-lg" aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )}

            {step === 3 && (
              <section className="public-section">
                <h2 className="public-section-title">Kontak Anda</h2>
                <p className="public-section-hint">
                  Agar tim IT bisa meminta informasi tambahan atau mengabarkan
                  hasilnya.
                </p>

                <div className="field-row">
                  <label className="form-label" htmlFor="public-name">
                    Nama <span className="req">*</span>
                  </label>
                  <input
                    id="public-name"
                    className="input"
                    maxLength={120}
                    placeholder="Nama Anda"
                    value={values.reporter_name}
                    onChange={(event) =>
                      setValue("reporter_name", event.target.value)
                    }
                  />
                </div>

                <div className="field-row">
                  <label className="form-label" htmlFor="public-contact">
                    Email atau WhatsApp <span className="req">*</span>
                  </label>
                  <input
                    id="public-contact"
                    className="input"
                    maxLength={120}
                    placeholder="Contoh: nama@rs.id atau 0812xxxx"
                    value={values.reporter_contact}
                    onChange={(event) =>
                      setValue("reporter_contact", event.target.value)
                    }
                  />
                </div>

                <div className="callout callout--warning">
                  <i className="bi bi-shield-exclamation" aria-hidden="true" />
                  <div>
                    <label className="checkline" htmlFor="public-confirm">
                      <input
                        id="public-confirm"
                        type="checkbox"
                        checked={confirmed}
                        onChange={(event) => setConfirmed(event.target.checked)}
                      />
                      <span>
                        Saya memastikan laporan ini <strong>tidak memuat</strong>{" "}
                        nama pasien, NIK, nomor rekam medis, alamat, atau data
                        identitas pasien lainnya.
                      </span>
                    </label>
                    <div className="hint">
                      Jangan unggah screenshot yang masih menampilkan identitas
                      pasien.
                    </div>
                  </div>
                </div>

                <div className="public-summary">
                  <div>
                    <span>Layanan</span>
                    <strong>{selectedService?.name || "—"}</strong>
                  </div>
                  <div>
                    <span>Jenis</span>
                    <strong>
                      {values.type === "incident"
                        ? "Laporan gangguan"
                        : "Permintaan layanan"}
                    </strong>
                  </div>
                  <div>
                    <span>Lokasi</span>
                    <strong>
                      {meta.point?.location || meta.point?.unit_name || "—"}
                    </strong>
                  </div>
                  <div>
                    <span>Lampiran</span>
                    <strong>{files.length} file</strong>
                  </div>
                </div>
              </section>
            )}

            <div className="public-actions">
              {step > 1 && (
                <button
                  type="button"
                  className="btn btn-subtle"
                  onClick={previousStep}
                  disabled={submitting}
                >
                  <i className="bi bi-arrow-left" aria-hidden="true" />
                  Kembali
                </button>
              )}

              {step < 3 ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={nextStep}
                >
                  Lanjut
                  <i className="bi bi-arrow-right" aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <span className="spinner" aria-hidden="true" />
                      Mengirim...
                    </>
                  ) : (
                    <>
                      Kirim laporan
                      <i className="bi bi-send" aria-hidden="true" />
                    </>
                  )}
                </button>
              )}
            </div>
          </form>
        )}
      </main>

      <footer className="public-intake-foot">
        <span>
          <i className="bi bi-shield-lock" aria-hidden="true" /> Jangan
          cantumkan data pasien pada laporan.
        </span>
        <span>{meta.point?.unit_name}</span>
      </footer>
    </div>
  );
}
