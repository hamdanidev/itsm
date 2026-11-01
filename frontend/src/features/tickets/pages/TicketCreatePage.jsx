import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PageHeader from "../../../components/ui/PageHeader";
import { useAuth } from "../../../app/providers/AuthProvider";
import { pb } from "../../../lib/pocketbase";
import { createTicket, getErrorMessage } from "../../../lib/api";
import {
  impactLabel,
  typeLabel,
} from "../../../lib/format";
import { Priority, TypeIcon } from "../components/Badges";

const ticketTypes = [
  {
    value: "incident",
    title: "Incident",
    description: "Bug, error, atau gangguan SIMRS yang sedang terjadi.",
  },
  {
    value: "service_request",
    title: "Service Request",
    description: "Permintaan akses, reset password, atau bantuan rutin.",
  },
  {
    value: "change_request",
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

const APPROVAL_TEXT = {
  incident: "Tidak perlu",
  service_request: "IT Lead",
  change_request: "IT Lead",
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
        breadcrumb={[{ label: "Tiket", to: "/tickets" }, { label: "Buat tiket" }]}
        title="Buat tiket"
        description="Pilih jenis tiket, jelaskan dampaknya, dan sertakan informasi yang cukup untuk tim IT."
        actions={
          <Link className="btn btn-subtle" to="/tickets">
            <i className="bi bi-arrow-left" aria-hidden="true" />
            Kembali
          </Link>
        }
      />

      {!loadingLookups && !unit && (
        <div className="alert alert--warning" role="alert">
          <i className="bi bi-exclamation-triangle" aria-hidden="true" />
          <div>
            Akun Anda belum memiliki unit. Hubungi superuser/IT administrator
            untuk melengkapi profil sebelum membuat tiket.
          </div>
        </div>
      )}

      {error && (
        <div className="alert alert--error" role="alert">
          <i className="bi bi-exclamation-triangle" aria-hidden="true" />
          <div>{error}</div>
        </div>
      )}

      <form className="create-grid" onSubmit={handleSubmit}>
        <div className="create-main">
          <div className="form-card">
            <section className="form-section">
              <h2 className="form-section-title">Jenis tiket</h2>
              <p className="form-section-hint">
                Jenis tiket menentukan alur approval dan kebijakan SLA yang
                berlaku.
              </p>

              <div className="type-options">
                {ticketTypes.map((item) => {
                  const selected = type === item.value;

                  return (
                    <button
                      key={item.value}
                      type="button"
                      className={`type-option${selected ? " is-selected" : ""}`}
                      onClick={() => setType(item.value)}
                      aria-pressed={selected}
                    >
                      {selected && (
                        <i
                          className="bi bi-check-lg type-check"
                          aria-hidden="true"
                        />
                      )}
                      <TypeIcon type={item.value} large />
                      <span className="type-option-title">{item.title}</span>
                      <span className="type-option-desc">{item.description}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="form-section">
              <h2 className="form-section-title">Detail masalah atau permintaan</h2>
              <p className="form-section-hint">
                Semakin jelas deskripsi, semakin cepat tiket ditriase.
              </p>

              <div className="field-row">
                <label className="form-label" htmlFor="title">
                  Judul <span className="req">*</span>
                </label>
                <input
                  id="title"
                  className="input"
                  placeholder="Contoh: Modul pendaftaran gagal menyimpan kunjungan"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={160}
                  minLength={5}
                  required
                />
                <div className="hint">
                  Ringkas dan spesifik. Jangan sebut nama, NIK, atau nomor rekam
                  medis pasien.
                </div>
              </div>

              <div className="field-row">
                <label className="form-label" htmlFor="description">
                  Deskripsi <span className="req">*</span>
                </label>
                <textarea
                  id="description"
                  className="textarea"
                  rows={6}
                  placeholder="Apa yang terjadi, kapan mulai terjadi, modul/unit terdampak, pesan error, dan langkah yang sudah dicoba."
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={10000}
                  minLength={10}
                  required
                />
                <div className="char-count">
                  <span>Semakin jelas, semakin cepat ditriase.</span>
                  <span>{description.length}/10.000</span>
                </div>
              </div>

              <div className="form-grid" style={{ marginTop: 16 }}>
                <div>
                  <label className="form-label" htmlFor="category">
                    Modul / kategori
                  </label>
                  <select
                    id="category"
                    className="select"
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

                <div>
                  <label className="form-label" htmlFor="unit">
                    Unit
                  </label>
                  <input
                    id="unit"
                    className="input"
                    value={unit?.name || "Belum ditentukan"}
                    readOnly
                    disabled
                  />
                  <div className="hint">Unit mengikuti profil akun Anda.</div>
                </div>
              </div>
            </section>

            <section className="form-section">
              <div className="form-section-head">
                <div>
                  <h2 className="form-section-title">
                    Dampak klinis <span className="req">*</span>
                  </h2>
                  <p className="form-section-hint">
                    Prioritas awal dihitung dari dampak. Tim IT dapat
                    menyesuaikannya setelah triage.
                  </p>
                </div>
                <span className="priority-preview">
                  Prioritas awal: <Priority priority={derivedPriority} />
                </span>
              </div>

              <div className="impact-options">
                {impacts.map((item) => {
                  const selected = impact === item.value;

                  return (
                    <button
                      key={item.value}
                      type="button"
                      className={`impact-option${selected ? " is-selected" : ""}`}
                      onClick={() => setImpact(item.value)}
                      aria-pressed={selected}
                    >
                      <span className="radio-dot" aria-hidden="true" />
                      <span>
                        <span className="impact-title">{item.title}</span>
                        <span className="impact-desc">{item.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {type === "change_request" && (
              <section className="form-section">
                <h2 className="form-section-title">Rencana perubahan</h2>
                <p className="form-section-hint">
                  Perubahan tidak akan disetujui sebelum ada rencana implementasi,
                  rollback plan, dan jadwal yang jelas.
                </p>

                <div className="form-grid form-grid--3">
                  <div>
                    <label className="form-label" htmlFor="risk">
                      Risiko
                    </label>
                    <select
                      id="risk"
                      className="select"
                      value={changeRisk}
                      onChange={(event) => setChangeRisk(event.target.value)}
                    >
                      <option value="low">Rendah</option>
                      <option value="medium">Sedang</option>
                      <option value="high">Tinggi</option>
                    </select>
                  </div>

                  <div>
                    <label className="form-label" htmlFor="plannedStart">
                      Mulai rencana
                    </label>
                    <input
                      id="plannedStart"
                      type="datetime-local"
                      className="input"
                      value={plannedStart}
                      onChange={(event) => setPlannedStart(event.target.value)}
                    />
                  </div>

                  <div>
                    <label className="form-label" htmlFor="plannedEnd">
                      Selesai rencana
                    </label>
                    <input
                      id="plannedEnd"
                      type="datetime-local"
                      className="input"
                      value={plannedEnd}
                      min={plannedStart || undefined}
                      onChange={(event) => setPlannedEnd(event.target.value)}
                    />
                  </div>
                </div>

                <div className="field-row" style={{ marginTop: 16 }}>
                  <label className="form-label" htmlFor="implementationPlan">
                    Rencana implementasi
                  </label>
                  <textarea
                    id="implementationPlan"
                    className="textarea"
                    rows={4}
                    placeholder="Langkah perubahan, modul terdampak, dan pihak yang terlibat."
                    value={implementationPlan}
                    onChange={(event) => setImplementationPlan(event.target.value)}
                    maxLength={10000}
                  />
                </div>

                <div className="field-row">
                  <label className="form-label" htmlFor="rollbackPlan">
                    Rollback plan
                  </label>
                  <textarea
                    id="rollbackPlan"
                    className="textarea"
                    rows={4}
                    placeholder="Cara mengembalikan kondisi jika perubahan gagal."
                    value={rollbackPlan}
                    onChange={(event) => setRollbackPlan(event.target.value)}
                    maxLength={10000}
                  />
                </div>
              </section>
            )}

            <section className="form-section">
              <h2 className="form-section-title">Konfirmasi data</h2>
              <p className="form-section-hint">
                Tiket tidak boleh memuat identitas pasien.
              </p>

              <div className="callout callout--warning">
                <i className="bi bi-shield-exclamation" aria-hidden="true" />
                <div>
                  <label className="checkline" htmlFor="confirmData">
                    <input
                      id="confirmData"
                      type="checkbox"
                      checked={confirmed}
                      onChange={(event) => setConfirmed(event.target.checked)}
                      required
                    />
                    <span>
                      Saya memastikan tiket ini <strong>tidak memuat</strong> nama
                      pasien, NIK, nomor rekam medis, alamat, atau data identitas
                      pasien lainnya.
                    </span>
                  </label>
                  <div className="hint">
                    Jika membutuhkan data pasien, gunakan kanal aman yang
                    ditentukan rumah sakit. Jangan mengunggah screenshot yang
                    masih menampilkan identitas pasien.
                  </div>
                </div>
              </div>
            </section>

            <div className="form-actions">
              <Link className="btn btn-subtle" to="/tickets">
                Batal
              </Link>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={submitting || loadingLookups || !unit}
              >
                {submitting ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    Mengirim...
                  </>
                ) : (
                  <>
                    Buat tiket
                    <i className="bi bi-arrow-right" aria-hidden="true" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <aside className="create-side">
          <section className="panel">
            <div className="panel-head">
              <div className="panel-title">Ringkasan</div>
            </div>
            <div className="panel-body">
              <dl className="summary-list">
                <div className="summary-row">
                  <dt>Jenis</dt>
                  <dd>{typeLabel(type)}</dd>
                </div>
                <div className="summary-row">
                  <dt>Dampak</dt>
                  <dd>{impactLabel(impact)}</dd>
                </div>
                <div className="summary-row">
                  <dt>Prioritas awal</dt>
                  <dd>
                    <Priority priority={derivedPriority} />
                  </dd>
                </div>
                <div className="summary-row">
                  <dt>Unit</dt>
                  <dd>{unit?.name || "—"}</dd>
                </div>
                <div className="summary-row">
                  <dt>Approval</dt>
                  <dd>{APPROVAL_TEXT[type]}</dd>
                </div>
              </dl>
            </div>
          </section>

          <div className="callout callout--info">
            <i className="bi bi-info-circle" aria-hidden="true" />
            <div>
              Lampiran dapat ditambahkan setelah tiket dibuat. Maksimal 3 file,
              10 MB per file. Jangan unggah data pasien.
            </div>
          </div>
        </aside>
      </form>
    </>
  );
}
