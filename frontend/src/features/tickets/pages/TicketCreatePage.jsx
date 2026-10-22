import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PageHeader from "../../../components/ui/PageHeader";
import { useAuth } from "../../../app/providers/AuthProvider";
import { pb } from "../../../lib/pocketbase";
import { createTicket, getErrorMessage } from "../../../lib/api";
import {
  impactLabel,
  priorityLabel,
  typeLabel,
} from "../../../lib/format";

const ticketTypes = [
  {
    value: "incident",
    icon: "bi-bug",
    title: "Incident",
    description: "Bug, error, atau gangguan SIMRS yang sedang terjadi.",
  },
  {
    value: "service_request",
    icon: "bi-person-check",
    title: "Service Request",
    description: "Permintaan akses, reset password, atau bantuan rutin.",
  },
  {
    value: "change_request",
    icon: "bi-arrow-repeat",
    title: "Change Request",
    description: "Perubahan alur, fitur, konfigurasi, atau integrasi.",
  },
];

const impacts = [
  {
    value: "patient_safety",
    title: "Keselamatan pasien",
    description: "Berpotensi membahayakan pasien atau menghentikan layanan klinis.",
  },
  {
    value: "clinical_workflow",
    title: "Alur kerja klinis",
    description: "Menghambat pendaftaran, farmasi, laboratorium, atau tindakan.",
  },
  {
    value: "operational",
    title: "Operasional",
    description: "Mengganggu pekerjaan, tetapi ada workaround.",
  },
  {
    value: "convenience",
    title: "Kenyamanan",
    description: "Tidak menghambat layanan; bersifat perbaikan atau kenyamanan.",
  },
];

const impactToPriority = {
  patient_safety: "critical",
  clinical_workflow: "high",
  operational: "normal",
  convenience: "low",
};

export default function TicketCreatePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [type, setType] = useState("incident");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [impact, setImpact] = useState("operational");
  const [category, setCategory] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const [changeRisk, setChangeRisk] = useState("normal");
  const [implementationPlan, setImplementationPlan] = useState("");
  const [rollbackPlan, setRollbackPlan] = useState("");
  const [plannedStart, setPlannedStart] = useState("");
  const [plannedEnd, setPlannedEnd] = useState("");

  const [categories, setCategories] = useState([]);
  const [unit, setUnit] = useState(null);
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Buat Tiket · Healthcare ITSM";
  }, []);

  useEffect(() => {
    let active = true;

    async function loadLookups() {
      setLoadingLookups(true);
      try {
        const categoryPromise = pb.collection("ticket_categories").getFullList({
          filter: "is_active = true",
          sort: "name",
        });
        const unitPromise = user?.unit
          ? pb.collection("units").getOne(user.unit)
          : Promise.resolve(null);

        const [categoryList, unitRecord] = await Promise.all([
          categoryPromise,
          unitPromise,
        ]);

        if (!active) return;
        setCategories(categoryList);
        setUnit(unitRecord);
      } catch (err) {
        if (active) setError(getErrorMessage(err));
      } finally {
        if (active) setLoadingLookups(false);
      }
    }

    loadLookups();
    return () => {
      active = false;
    };
  }, [user?.unit]);

  const derivedPriority = useMemo(
    () => impactToPriority[impact] || "normal",
    [impact]
  );

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!confirmed) {
      setError("Konfirmasi bahwa tiket tidak memuat data pasien wajib dicentang.");
      return;
    }

    if (title.trim().length < 5) {
      setError("Judul minimal 5 karakter.");
      return;
    }

    if (description.trim().length < 10) {
      setError("Deskripsi minimal 10 karakter.");
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        type,
        title: title.trim(),
        description: description.trim(),
        impact,
        patient_data_confirmed: true,
      };

      if (category) payload.category = category;

      if (type === "change_request") {
        payload.change_risk = changeRisk;
        if (implementationPlan.trim()) {
          payload.implementation_plan = implementationPlan.trim();
        }
        if (rollbackPlan.trim()) payload.rollback_plan = rollbackPlan.trim();
        if (plannedStart) {
          payload.planned_start = new Date(plannedStart).toISOString();
        }
        if (plannedEnd) {
          payload.planned_end = new Date(plannedEnd).toISOString();
        }
      }

      const created = await createTicket(payload);
      navigate(`/tickets/${created.id}`, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Intake"
        title="Buat tiket baru"
        description="Pilih jenis tiket, jelaskan dampaknya, dan sertakan informasi yang cukup untuk tim IT."
        actions={
          <Link className="btn btn-outline-secondary" to="/tickets">
            <i className="bi bi-arrow-left me-2" />
            Kembali
          </Link>
        }
      />

      {!loadingLookups && !unit && (
        <div className="alert alert-warning d-flex gap-2">
          <i className="bi bi-exclamation-triangle-fill" />
          <div>
            Akun Anda belum memiliki unit. Hubungi superuser/IT administrator
            untuk melengkapi profil sebelum membuat tiket.
          </div>
        </div>
      )}

      {error && (
        <div className="alert alert-danger d-flex gap-2" role="alert">
          <i className="bi bi-exclamation-triangle-fill" />
          <div>{error}</div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="row g-4">
          <div className="col-12 col-xl-8">
            <div className="card border-0 shadow-sm mb-4">
              <div className="card-body p-4">
                <h2 className="h6 text-uppercase text-secondary fw-bold letter-spacing mb-3">
                  1. Jenis tiket
                </h2>
                <div className="row g-3">
                  {ticketTypes.map((item) => (
                    <div className="col-12 col-md-4" key={item.value}>
                      <button
                        type="button"
                        className={`ticket-type-card w-100 h-100 ${
                          type === item.value ? "selected" : ""
                        }`}
                        onClick={() => setType(item.value)}
                        aria-pressed={type === item.value}
                      >
                        <span className="ticket-type-icon">
                          <i className={`bi ${item.icon}`} />
                        </span>
                        <span className="fw-semibold d-block mt-2">
                          {item.title}
                        </span>
                        <span className="small text-secondary d-block mt-1">
                          {item.description}
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="card border-0 shadow-sm mb-4">
              <div className="card-body p-4">
                <h2 className="h6 text-uppercase text-secondary fw-bold letter-spacing mb-3">
                  2. Detail masalah atau permintaan
                </h2>

                <div className="mb-3">
                  <label className="form-label fw-semibold" htmlFor="title">
                    Judul <span className="text-danger">*</span>
                  </label>
                  <input
                    id="title"
                    className="form-control form-control-lg"
                    placeholder="Contoh: Modul pendaftaran gagal menyimpan kunjungan"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={160}
                    minLength={5}
                    required
                  />
                  <div className="form-text">
                    Ringkas dan spesifik. Jangan sebut nama, NIK, atau nomor
                    rekam medis pasien.
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label fw-semibold" htmlFor="description">
                    Deskripsi <span className="text-danger">*</span>
                  </label>
                  <textarea
                    id="description"
                    className="form-control"
                    rows={7}
                    placeholder="Apa yang terjadi, kapan mulai terjadi, modul/unit terdampak, pesan error, dan langkah yang sudah dicoba."
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    maxLength={10000}
                    minLength={10}
                    required
                  />
                  <div className="d-flex justify-content-between form-text">
                    <span>Semakin jelas, semakin cepat ditriase.</span>
                    <span>{description.length}/10.000</span>
                  </div>
                </div>

                <div className="row g-3">
                  <div className="col-12 col-md-6">
                    <label className="form-label fw-semibold" htmlFor="category">
                      Modul / kategori
                    </label>
                    <select
                      id="category"
                      className="form-select"
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                      disabled={loadingLookups}
                    >
                      <option value="">Pilih kategori (opsional)</option>
                      {categories.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-12 col-md-6">
                    <label className="form-label fw-semibold">Unit</label>
                    <input
                      className="form-control"
                      value={unit?.name || "Belum ditentukan"}
                      readOnly
                      disabled
                    />
                    <div className="form-text">
                      Unit mengikuti profil akun Anda.
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <label className="form-label fw-semibold mb-0">
                      Dampak klinis <span className="text-danger">*</span>
                    </label>
                    <span className={`badge priority-preview priority-${derivedPriority}`}>
                      Prioritas awal: {priorityLabel(derivedPriority)}
                    </span>
                  </div>
                  <div className="d-grid gap-2">
                    {impacts.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        className={`impact-option text-start ${
                          impact === item.value ? "selected" : ""
                        }`}
                        onClick={() => setImpact(item.value)}
                        aria-pressed={impact === item.value}
                      >
                        <span className="fw-semibold d-block">{item.title}</span>
                        <span className="small text-secondary">
                          {item.description}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {type === "change_request" && (
              <div className="card border-0 shadow-sm mb-4">
                <div className="card-body p-4">
                  <h2 className="h6 text-uppercase text-secondary fw-bold letter-spacing mb-3">
                    3. Rencana perubahan
                  </h2>
                  <div className="alert alert-info small d-flex gap-2">
                    <i className="bi bi-info-circle-fill" />
                    <div>
                      Perubahan tidak akan disetujui sebelum ada rencana
                      implementasi, rollback plan, dan jadwal yang jelas.
                    </div>
                  </div>

                  <div className="row g-3">
                    <div className="col-12 col-md-4">
                      <label className="form-label fw-semibold" htmlFor="risk">
                        Risiko
                      </label>
                      <select
                        id="risk"
                        className="form-select"
                        value={changeRisk}
                        onChange={(event) => setChangeRisk(event.target.value)}
                      >
                        <option value="low">Rendah</option>
                        <option value="medium">Sedang</option>
                        <option value="high">Tinggi</option>
                      </select>
                    </div>
                    <div className="col-12 col-md-4">
                      <label
                        className="form-label fw-semibold"
                        htmlFor="plannedStart"
                      >
                        Mulai rencana
                      </label>
                      <input
                        id="plannedStart"
                        type="datetime-local"
                        className="form-control"
                        value={plannedStart}
                        onChange={(event) => setPlannedStart(event.target.value)}
                      />
                    </div>
                    <div className="col-12 col-md-4">
                      <label
                        className="form-label fw-semibold"
                        htmlFor="plannedEnd"
                      >
                        Selesai rencana
                      </label>
                      <input
                        id="plannedEnd"
                        type="datetime-local"
                        className="form-control"
                        value={plannedEnd}
                        min={plannedStart || undefined}
                        onChange={(event) => setPlannedEnd(event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="mt-3">
                    <label
                      className="form-label fw-semibold"
                      htmlFor="implementationPlan"
                    >
                      Rencana implementasi
                    </label>
                    <textarea
                      id="implementationPlan"
                      className="form-control"
                      rows={4}
                      placeholder="Langkah perubahan, modul terdampak, dan pihak yang terlibat."
                      value={implementationPlan}
                      onChange={(event) =>
                        setImplementationPlan(event.target.value)
                      }
                      maxLength={10000}
                    />
                  </div>

                  <div className="mt-3">
                    <label
                      className="form-label fw-semibold"
                      htmlFor="rollbackPlan"
                    >
                      Rollback plan
                    </label>
                    <textarea
                      id="rollbackPlan"
                      className="form-control"
                      rows={4}
                      placeholder="Cara mengembalikan kondisi jika perubahan gagal."
                      value={rollbackPlan}
                      onChange={(event) => setRollbackPlan(event.target.value)}
                      maxLength={10000}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="card border-0 shadow-sm mb-4">
              <div className="card-body p-4">
                <h2 className="h6 text-uppercase text-secondary fw-bold letter-spacing mb-3">
                  {type === "change_request" ? "4" : "3"}. Konfirmasi data
                </h2>
                <div className="privacy-check">
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="confirmData"
                      checked={confirmed}
                      onChange={(event) => setConfirmed(event.target.checked)}
                      required
                    />
                    <label className="form-check-label" htmlFor="confirmData">
                      Saya memastikan tiket ini <strong>tidak memuat</strong>{" "}
                      nama pasien, NIK, nomor rekam medis, alamat, atau data
                      identitas pasien lainnya.
                    </label>
                  </div>
                  <div className="small text-secondary mt-2">
                    Jika membutuhkan data pasien, gunakan kanal aman yang
                    ditentukan rumah sakit. Jangan mengunggah screenshot yang
                    masih menampilkan identitas pasien.
                  </div>
                </div>
              </div>
            </div>

            <div className="d-flex justify-content-end gap-2 mb-5">
              <Link className="btn btn-outline-secondary" to="/tickets">
                Batal
              </Link>
              <button
                className="btn btn-primary btn-lg"
                type="submit"
                disabled={submitting || loadingLookups || !unit}
              >
                {submitting ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" />
                    Mengirim...
                  </>
                ) : (
                  <>
                    Kirim tiket
                    <i className="bi bi-send ms-2" />
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="col-12 col-xl-4">
            <div className="card border-0 shadow-sm mb-4 sticky-sidebar">
              <div className="card-body p-4">
                <h2 className="h6 fw-bold mb-3">
                  <i className="bi bi-clipboard-check text-primary me-2" />
                  Ringkasan
                </h2>
                <dl className="row small mb-0 gy-2">
                  <dt className="col-5 text-secondary">Jenis</dt>
                  <dd className="col-7 mb-0 fw-medium">{typeLabel(type)}</dd>

                  <dt className="col-5 text-secondary">Dampak</dt>
                  <dd className="col-7 mb-0 fw-medium">{impactLabel(impact)}</dd>

                  <dt className="col-5 text-secondary">Prioritas awal</dt>
                  <dd className="col-7 mb-0">
                    <span className={`badge priority-preview priority-${derivedPriority}`}>
                      {priorityLabel(derivedPriority)}
                    </span>
                  </dd>

                  <dt className="col-5 text-secondary">Unit</dt>
                  <dd className="col-7 mb-0">{unit?.name || "—"}</dd>

                  <dt className="col-5 text-secondary">Approval</dt>
                  <dd className="col-7 mb-0">
                    {type === "incident" ? "Tidak perlu" : "IT Lead"}
                  </dd>
                </dl>

                <div className="alert alert-light border small mt-4 mb-0">
                  <i className="bi bi-info-circle text-primary me-2" />
                  Prioritas awal dihitung dari dampak. Tim IT dapat
                  menyesuaikannya setelah triage.
                </div>
              </div>
            </div>

            <div className="card border-0 shadow-sm">
              <div className="card-body p-4">
                <h2 className="h6 fw-bold mb-2">
                  <i className="bi bi-paperclip text-primary me-2" />
                  Lampiran
                </h2>
                <p className="small text-secondary mb-0">
                  Lampiran dapat ditambahkan setelah tiket dibuat. Maksimal 3
                  file, 10 MB per file. Jangan unggah data pasien.
                </p>
              </div>
            </div>
          </div>
        </div>
      </form>
    </>
  );
}
