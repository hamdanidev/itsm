import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import PageHeader from "../../../components/ui/PageHeader";
import RichTextEditor from "../../../components/ui/RichTextEditor";
import { useAuth } from "../../../app/providers/AuthProvider";
import { pb } from "../../../lib/pocketbase";
import {
  createTicket,
  fetchAssetOptions,
  getErrorMessage,
  searchKnowledge,
  uploadAttachment,
} from "../../../lib/api";
import { isStaff } from "../../../lib/permissions";
import { formErrorText, useAppForm } from "../../../lib/formik";
import { richTextLength } from "../../../lib/richText";
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
  service_request: "Kepala IT",
  change_request: "Kepala IT",
};

const APPROVAL_MODE_LABELS = {
  none: "Tanpa approval",
  manager: "Manajer unit",
  lead: "Kepala IT",
  cab: "CAB / Kepala IT kedua",
  default: "Mengikuti alur tiket",
};

const SOURCES = [
  ["web", "Portal web"],
  ["phone", "Telepon"],
  ["whatsapp", "WhatsApp"],
  ["email", "Email"],
];

const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ATTACHMENT_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "webp", "txt", "log"];

function attachmentSizeLabel(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TicketCreatePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryApplied = useRef(false);
  const staff = isStaff(user);

  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [serviceItems, setServiceItems] = useState([]);
  const [assets, setAssets] = useState([]);
  const [people, setPeople] = useState([]);
  const [unit, setUnit] = useState(null);
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [knowledgeHits, setKnowledgeHits] = useState([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [step, setStep] = useState(1);
  const [stepError, setStepError] = useState("");

  const formik = useAppForm({
    initialValues: {
      type: "incident",
      title: "",
      description: "",
      impact: "operational",
      category: "",
      service: "",
      service_item: "",
      asset_id: "",
      location: "",
      source: "web",
      requested_for: "",
      reporter_name: "",
      reporter_contact: "",
      confirmed: false,
      change_risk: "normal",
      implementation_plan: "",
      rollback_plan: "",
      planned_start: "",
      planned_end: "",
    },
    validate: (values) => {
      const errors = {};

      if (values.title.trim().length < 5) {
        errors.title = "Judul minimal 5 karakter.";
      }
      if (richTextLength(values.description) < 10) {
        errors.description = "Deskripsi minimal 10 karakter.";
      }
      if (!values.confirmed) {
        errors.confirmed =
          "Konfirmasi bahwa tiket tidak memuat data pasien wajib dicentang.";
      }
      if (
        values.type === "change_request" &&
        values.planned_start &&
        values.planned_end &&
        new Date(values.planned_end) <= new Date(values.planned_start)
      ) {
        errors.planned_end = "Jadwal selesai harus setelah jadwal mulai.";
      }

      return errors;
    },
    onSubmit: async (values, helpers) => {
      helpers.setStatus("");

      const payload = {
        type: values.type,
        title: values.title.trim(),
        description: values.description.trim(),
        impact: values.impact,
        patient_data_confirmed: true,
        source: staff ? values.source : "web",
      };

      if (values.category) payload.category = values.category;
      if (values.service) payload.service = values.service;
      if (values.service_item) payload.service_item = values.service_item;
      if (values.asset_id) payload.asset_id = values.asset_id;
      if (values.location.trim()) payload.location = values.location.trim();

      if (staff) {
        if (values.requested_for) {
          payload.requested_for = values.requested_for;
        }
        if (values.reporter_name.trim()) {
          payload.reporter_name = values.reporter_name.trim();
        }
        if (values.reporter_contact.trim()) {
          payload.reporter_contact = values.reporter_contact.trim();
        }
      }

      if (values.type === "change_request") {
        payload.change_risk = values.change_risk;
        if (values.implementation_plan.trim()) {
          payload.implementation_plan = values.implementation_plan.trim();
        }
        if (values.rollback_plan.trim()) {
          payload.rollback_plan = values.rollback_plan.trim();
        }
        if (values.planned_start) {
          payload.planned_start = new Date(values.planned_start).toISOString();
        }
        if (values.planned_end) {
          payload.planned_end = new Date(values.planned_end).toISOString();
        }
      }

      try {
        const created = await createTicket(payload);
        let attachmentError = "";

        for (const file of attachments) {
          try {
            await uploadAttachment(created.id, file, "public");
          } catch (err) {
            attachmentError = getErrorMessage(err);
            break;
          }
        }

        navigate(`/tickets/${created.id}`, {
          replace: true,
          state: attachmentError ? { attachmentError } : undefined,
        });
      } catch (err) {
        helpers.setStatus(getErrorMessage(err));
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  const error = formErrorText(formik);

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
        const servicePromise = pb.collection("services").getFullList({
          filter: "is_active = true",
          sort: "name",
        });
        const itemPromise = pb.collection("service_items").getFullList({
          filter: "is_active = true",
          sort: "sort,name",
        });
        const assetPromise = fetchAssetOptions();
        const peoplePromise = staff
          ? pb.collection("users").getFullList({
              filter: "is_active = true",
              sort: "name",
              expand: "unit",
            })
          : Promise.resolve([]);

        const [
          categoryList,
          unitRecord,
          serviceList,
          itemList,
          assetList,
          peopleList,
        ] = await Promise.all([
          categoryPromise,
          unitPromise,
          servicePromise,
          itemPromise,
          assetPromise,
          peoplePromise,
        ]);

        if (!active) return;
        setCategories(categoryList);
        setUnit(unitRecord);
        setServices(serviceList);
        setServiceItems(itemList);
        setAssets(assetList.assets || []);
        setPeople(peopleList);
      } catch (err) {
        if (active) formik.setStatus(getErrorMessage(err));
      } finally {
        if (active) setLoadingLookups(false);
      }
    }

    loadLookups();
    return () => {
      active = false;
    };
  }, [user?.unit]);

  useEffect(() => {
    if (loadingLookups || queryApplied.current) return;

    const queryService = searchParams.get("service") || "";
    const queryItem = searchParams.get("item") || "";
    const queryType = searchParams.get("type") || "";

    if (queryType && ticketTypes.some((item) => item.value === queryType)) {
      formik.setFieldValue("type", queryType);
    }

    if (queryService && services.some((item) => item.id === queryService)) {
      formik.setFieldValue("service", queryService);

      if (
        queryItem &&
        serviceItems.some(
          (item) => item.id === queryItem && item.service === queryService
        )
      ) {
        formik.setFieldValue("service_item", queryItem);
      }
    }

    queryApplied.current = true;
  }, [loadingLookups, searchParams, serviceItems, services]);

  useEffect(() => {
    const term = formik.values.title.trim();

    if (term.length < 8) {
      setKnowledgeHits([]);
      return undefined;
    }

    let active = true;
    const timer = setTimeout(async () => {
      setKnowledgeLoading(true);
      try {
        const result = await searchKnowledge({
          q: term,
          service: formik.values.service || undefined,
          limit: 4,
        });
        if (active) setKnowledgeHits(result.items || []);
      } catch {
        if (active) setKnowledgeHits([]);
      } finally {
        if (active) setKnowledgeLoading(false);
      }
    }, 500);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [formik.values.service, formik.values.title]);

  const derivedPriority = useMemo(
    () => impactToPriority[formik.values.impact] || "normal",
    [formik.values.impact]
  );

  function serviceNameOf(serviceId) {
    return services.find((service) => service.id === serviceId)?.name || "";
  }

  const itemsForService = useMemo(
    () =>
      serviceItems.filter((item) => item.service === formik.values.service),
    [formik.values.service, serviceItems]
  );

  const selectedItem = useMemo(
    () =>
      serviceItems.find((item) => item.id === formik.values.service_item) ||
      null,
    [formik.values.service_item, serviceItems]
  );

  const selectedService = useMemo(
    () => services.find((item) => item.id === formik.values.service) || null,
    [formik.values.service, services]
  );

  function addAttachments(event) {
    const incoming = Array.from(event.target.files || []);
    event.target.value = "";
    const next = [...attachments];
    let message = "";

    for (const file of incoming) {
      if (next.length >= MAX_ATTACHMENTS) {
        message = "Maksimal 3 lampiran per tiket.";
        break;
      }

      const extension = String(file.name || "").split(".").pop().toLowerCase();
      if (!ATTACHMENT_EXTENSIONS.includes(extension)) {
        message = "Gunakan PDF, PNG, JPG, WEBP, TXT, atau LOG.";
        continue;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
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

    setAttachments(next);
    setAttachmentError(message);
  }

  function removeAttachment(index) {
    setAttachments((current) =>
      current.filter((_, itemIndex) => itemIndex !== index)
    );
  }

  // Validasi per langkah: langkah 2 berisi detail wajib, langkah 3 baru
  // memakai validasi Formik penuh (termasuk konfirmasi data pasien).
  function nextStep() {
    if (step === 2) {
      if (formik.values.title.trim().length < 5) {
        setStepError("Judul minimal 5 karakter.");
        return;
      }
      if (richTextLength(formik.values.description) < 10) {
        setStepError("Deskripsi minimal 10 karakter.");
        return;
      }

      const { type, planned_start: start, planned_end: end } = formik.values;
      if (type === "change_request" && start && end && new Date(end) <= new Date(start)) {
        setStepError("Jadwal selesai harus setelah jadwal mulai.");
        return;
      }
    }

    setStepError("");
    setStep((current) => Math.min(3, current + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function previousStep() {
    setStepError("");
    setStep((current) => Math.max(1, current - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goToStep(target) {
    if (target > step) return;
    setStepError("");
    setStep(target);
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

      <form
        className="create-grid"
        onSubmit={(event) => {
          if (step < 3) {
            event.preventDefault();
            nextStep();
            return;
          }
          formik.handleSubmit(event);
        }}
      >
        <div className="create-main">
          <div className="form-card">

            <div className="wizard-steps" aria-label="Langkah pembuatan tiket">
              {[
                { number: 1, label: "Klasifikasi" },
                { number: 2, label: "Detail" },
                { number: 3, label: "Tinjau & kirim" },
              ].map((item) => (
                <button
                  key={item.number}
                  type="button"
                  className={`wizard-step${
                    step === item.number ? " is-active" : ""
                  }${step > item.number ? " is-done" : ""}`}
                  aria-current={step === item.number ? "step" : undefined}
                  disabled={item.number > step}
                  onClick={() => goToStep(item.number)}
                >
                  <span className="wizard-step-no">
                    {step > item.number ? (
                      <i className="bi bi-check-lg" aria-hidden="true" />
                    ) : (
                      item.number
                    )}
                  </span>
                  {item.label}
                </button>
              ))}
            </div>

            {stepError && (
              <div className="alert alert--error" role="alert">
                <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                <div>{stepError}</div>
              </div>
            )}

            <div className={step === 1 ? "wizard-panel" : "wizard-panel is-hidden"}>

            <section className="form-section">
              <h2 className="form-section-title">Jenis tiket</h2>
              <p className="form-section-hint">
                Jenis tiket menentukan alur approval dan kebijakan SLA yang
                berlaku.
              </p>

              <div className="type-options">
                {ticketTypes.map((item) => {
                  const selected = formik.values.type === item.value;

                  return (
                    <button
                      key={item.value}
                      type="button"
                      className={`type-option${selected ? " is-selected" : ""}`}
                      onClick={() => formik.setFieldValue("type", item.value)}
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
              <h2 className="form-section-title">Layanan</h2>
              <p className="form-section-hint">
                Pilih layanan agar SLA dan persetujuan mengikuti kebijakan
                layanan tersebut. Untuk permintaan rutin, pilih item yang
                sesuai agar tidak melewati approval yang tidak perlu.
              </p>

              <div className="form-grid">
                <div>
                  <label className="form-label" htmlFor="service">
                    Layanan
                  </label>
                  <select
                    id="service"
                    className="select"
                    value={formik.values.service}
                    onChange={(event) => {
                      formik.setFieldValue("service", event.target.value);
                      formik.setFieldValue("service_item", "");
                    }}
                    disabled={loadingLookups}
                  >
                    <option value="">Pilih layanan (opsional)</option>
                    {services.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label" htmlFor="serviceItem">
                    Jenis permintaan
                  </label>
                  <select
                    id="serviceItem"
                    className="select"
                    value={formik.values.service_item}
                    onChange={(event) =>
                      formik.setFieldValue("service_item", event.target.value)
                    }
                    disabled={
                      !formik.values.service || itemsForService.length === 0
                    }
                  >
                    <option value="">
                      {formik.values.service
                        ? "Pilih item (opsional)"
                        : "Pilih layanan terlebih dahulu"}
                    </option>
                    {itemsForService.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedItem && (
                <div className="callout callout--info" style={{ marginTop: 16 }}>
                  <i className="bi bi-info-circle" aria-hidden="true" />
                  <div>
                    <div>
                      <strong>{selectedItem.name}</strong>
                    </div>
                    <div>{selectedItem.description || "Tanpa deskripsi."}</div>
                    <div className="hint" style={{ marginTop: 6 }}>
                      Approval:{" "}
                      {formik.values.type === "incident"
                        ? "tidak perlu untuk incident"
                        : APPROVAL_MODE_LABELS[selectedItem.approval_mode] ||
                          selectedItem.approval_mode}
                    </div>
                  </div>
                </div>
              )}

              <div className="field-row" style={{ marginTop: 16 }}>
                <label className="form-label" htmlFor="location">
                  Lokasi / ruang
                </label>
                <input
                  id="location"
                  className="input"
                  placeholder="Contoh: Poli Anak lantai 2, ruang farmasi"
                  maxLength={120}
                  {...formik.getFieldProps("location")}
                />
                <div className="hint">
                  Membantu teknisi menemukan perangkat atau ruangan yang
                  terdampak.
                </div>
              </div>

              <div className="field-row" style={{ marginTop: 16 }}>
                <label className="form-label" htmlFor="asset">
                  Aset / CI terdampak
                </label>
                <select
                  id="asset"
                  className="select"
                  value={formik.values.asset_id}
                  onChange={(event) => {
                    const assetId = event.target.value;
                    formik.setFieldValue("asset_id", assetId);

                    const selected = assets.find((item) => item.id === assetId);
                    if (selected?.location && !formik.values.location.trim()) {
                      formik.setFieldValue("location", selected.location);
                    }
                  }}
                  disabled={loadingLookups}
                >
                  <option value="">Tidak ada aset spesifik</option>
                  {assets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.asset_no}
                      {serviceNameOf(item.service)
                        ? ` · ${serviceNameOf(item.service)}`
                        : ""}
                    </option>
                  ))}
                </select>
                <div className="hint">
                  Pilih perangkat/server yang bermasalah agar riwayat tiket
                  terlihat di detail aset.
                </div>
              </div>

              {staff && (
                <>
                  <div className="form-grid" style={{ marginTop: 16 }}>
                    <div>
                      <label className="form-label" htmlFor="source">
                        Sumber tiket
                      </label>
                      <select
                        id="source"
                        className="select"
                        {...formik.getFieldProps("source")}
                      >
                        {SOURCES.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="form-label" htmlFor="requestedFor">
                        Dibuat untuk
                      </label>
                      <select
                        id="requestedFor"
                        className="select"
                        {...formik.getFieldProps("requested_for")}
                      >
                        <option value="">Saya sendiri</option>
                        {people.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.name}
                            {person.expand?.unit?.name
                              ? ` · ${person.expand.unit.name}`
                              : ""}
                          </option>
                        ))}
                      </select>
                      <div className="hint">
                        Untuk tiket walk-up atau telepon atas nama pengguna
                        lain.
                      </div>
                    </div>
                  </div>

                  <div className="form-grid" style={{ marginTop: 16 }}>
                    <div>
                      <label className="form-label" htmlFor="reporterName">
                        Nama pelapor
                      </label>
                      <input
                        id="reporterName"
                        className="input"
                        maxLength={120}
                        placeholder="Nama yang menghubungi service desk"
                        {...formik.getFieldProps("reporter_name")}
                      />
                    </div>

                    <div>
                      <label className="form-label" htmlFor="reporterContact">
                        Kontak pelapor
                      </label>
                      <input
                        id="reporterContact"
                        className="input"
                        maxLength={120}
                        placeholder="Nomor telepon atau ekstensi"
                        {...formik.getFieldProps("reporter_contact")}
                      />
                    </div>
                  </div>
                </>
              )}
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
                  const selected = formik.values.impact === item.value;

                  return (
                    <button
                      key={item.value}
                      type="button"
                      className={`impact-option${selected ? " is-selected" : ""}`}
                      onClick={() => formik.setFieldValue("impact", item.value)}
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

            </div>

            <div className={step === 2 ? "wizard-panel" : "wizard-panel is-hidden"}>
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
                  maxLength={160}
                  minLength={5}
                  {...formik.getFieldProps("title")}
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
                <RichTextEditor
                  id="description"
                  value={formik.values.description}
                  onChange={(html) =>
                    formik.setFieldValue("description", html)
                  }
                  onBlur={() => formik.setFieldTouched("description", true)}
                  placeholder="Apa yang terjadi, kapan mulai terjadi, modul/unit terdampak, pesan error, dan langkah yang sudah dicoba."
                  rows={6}
                  maxLength={10000}
                />
                <div className="hint">
                  Semakin jelas, semakin cepat ditriase.
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
                    {...formik.getFieldProps("category")}
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

            {(knowledgeLoading || knowledgeHits.length > 0) && (
              <section className="form-section">
                <h2 className="form-section-title">Mungkin sudah pernah ditangani</h2>
                <p className="form-section-hint">
                  Artikel dan known error berikut cocok dengan judul laporan Anda.
                  Periksa sebelum membuat tiket baru.
                </p>

                {knowledgeLoading ? (
                  <div className="knowledge-suggestion-loading">
                    <span className="spinner spinner--dark" aria-hidden="true" />
                    Mencari artikel...
                  </div>
                ) : (
                  <ul className="knowledge-suggestions">
                    {knowledgeHits.map((item) => (
                      <li key={item.id}>
                        <div>
                          <a
                            href={`/knowledge/${item.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="knowledge-suggestion-title"
                          >
                            {item.title}
                          </a>
                          <div className="knowledge-suggestion-snippet">
                            {item.snippet}
                          </div>
                          {item.known_error && item.workaround && (
                            <div className="callout callout--warning">
                              <i className="bi bi-lightbulb" aria-hidden="true" />
                              <div>
                                <strong>Known error:</strong> {item.workaround}
                              </div>
                            </div>
                          )}
                        </div>
                        <span className="lozenge lozenge--neutral">
                          {item.visibility === "public" ? "Publik" : "Internal"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            <section className="form-section">
              <h2 className="form-section-title">Lampiran (opsional)</h2>
              <p className="form-section-hint">
                Screenshot bug, pesan error, atau foto perangkat sangat membantu
                teknisi. Maksimal 3 file, 10 MB per file.
              </p>

              {attachmentError && (
                <div className="alert alert--error" role="alert">
                  <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                  <div>{attachmentError}</div>
                </div>
              )}

              <label className="file-input">
                <input
                  type="file"
                  className="visually-hidden"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.log"
                  onChange={addAttachments}
                />
                <span className="btn btn-outline btn-sm">
                  <i className="bi bi-paperclip" aria-hidden="true" />
                  Pilih file
                </span>
                <span className="file-input-name">
                  {attachments.length
                    ? `${attachments.length} file dipilih`
                    : "Belum ada file dipilih"}
                </span>
              </label>

              {attachments.length > 0 && (
                <ul className="public-file-list">
                  {attachments.map((file, index) => (
                    <li key={`${file.name}-${file.size}-${index}`}>
                      <i className="bi bi-file-earmark" aria-hidden="true" />
                      <span className="public-file-name">{file.name}</span>
                      <span className="public-file-size">
                        {attachmentSizeLabel(file.size)}
                      </span>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => removeAttachment(index)}
                        aria-label={`Hapus ${file.name}`}
                      >
                        <i className="bi bi-x-lg" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="hint" style={{ marginTop: 8 }}>
                PDF, PNG, JPG, WEBP, TXT, atau LOG. Jangan unggah screenshot
                yang menampilkan identitas pasien.
              </div>
            </section>

            

            {formik.values.type === "change_request" && (
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
                      {...formik.getFieldProps("change_risk")}
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
                      {...formik.getFieldProps("planned_start")}
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
                      min={formik.values.planned_start || undefined}
                      {...formik.getFieldProps("planned_end")}
                    />
                  </div>
                </div>

                <div className="field-row" style={{ marginTop: 16 }}>
                  <label className="form-label" htmlFor="implementationPlan">
                    Rencana implementasi
                  </label>
                  <RichTextEditor
                    id="implementationPlan"
                    value={formik.values.implementation_plan}
                    onChange={(html) =>
                      formik.setFieldValue("implementation_plan", html)
                    }
                    onBlur={() =>
                      formik.setFieldTouched("implementation_plan", true)
                    }
                    placeholder="Langkah perubahan, modul terdampak, dan pihak yang terlibat."
                    rows={4}
                    maxLength={10000}
                  />
                </div>

                <div className="field-row">
                  <label className="form-label" htmlFor="rollbackPlan">
                    Rollback plan
                  </label>
                  <RichTextEditor
                    id="rollbackPlan"
                    value={formik.values.rollback_plan}
                    onChange={(html) =>
                      formik.setFieldValue("rollback_plan", html)
                    }
                    onBlur={() =>
                      formik.setFieldTouched("rollback_plan", true)
                    }
                    placeholder="Cara mengembalikan kondisi jika perubahan gagal."
                    rows={4}
                    maxLength={10000}
                  />
                </div>
              </section>
            )}

            </div>

            <div className={step === 3 ? "wizard-panel" : "wizard-panel is-hidden"}>

              <section className="form-section">
                <h2 className="form-section-title">Ringkasan tiket</h2>
                <p className="form-section-hint">
                  Periksa kembali sebelum tiket dibuat. Tim IT dapat mengoreksi
                  klasifikasi setelah triage.
                </p>

                <dl className="summary-list">
                  <div className="summary-row">
                    <dt>Jenis</dt>
                    <dd>{typeLabel(formik.values.type)}</dd>
                  </div>
                  <div className="summary-row">
                    <dt>Layanan</dt>
                    <dd>{selectedService?.name || "—"}</dd>
                  </div>
                  {selectedItem && (
                    <div className="summary-row">
                      <dt>Item</dt>
                      <dd>{selectedItem.name}</dd>
                    </div>
                  )}
                  <div className="summary-row">
                    <dt>Dampak</dt>
                    <dd>{impactLabel(formik.values.impact)}</dd>
                  </div>
                  <div className="summary-row">
                    <dt>Prioritas awal</dt>
                    <dd>
                      <Priority priority={derivedPriority} />
                    </dd>
                  </div>
                  <div className="summary-row">
                    <dt>Judul</dt>
                    <dd>{formik.values.title || "—"}</dd>
                  </div>
                  <div className="summary-row">
                    <dt>Lampiran</dt>
                    <dd>{attachments.length} file</dd>
                  </div>
                </dl>
              </section>

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
                      {...formik.getFieldProps({
                        name: "confirmed",
                        type: "checkbox",
                      })}
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

            </div>

            <div className="form-actions">
              {step === 1 ? (
                <Link className="btn btn-subtle" to="/tickets">
                  Batal
                </Link>
              ) : (
                <button
                  className="btn btn-subtle"
                  type="button"
                  onClick={previousStep}
                  disabled={formik.isSubmitting}
                >
                  <i className="bi bi-arrow-left" aria-hidden="true" />
                  Kembali
                </button>
              )}

              <span className="form-step-count">Langkah {step} dari 3</span>

              {step < 3 ? (
                <button
                  key="wizard-next"
                  className="btn btn-primary"
                  type="button"
                  onClick={(event) => {
                    // Cegah DOM node yang sama dipakai ulang sebagai tombol
                    // submit setelah langkah berubah (React merilis atribut
                    // type secara sinkron saat klik masih diproses).
                    event.preventDefault();
                    nextStep();
                  }}
                  disabled={formik.isSubmitting}
                >
                  Lanjut
                  <i className="bi bi-arrow-right" aria-hidden="true" />
                </button>
              ) : (
                <button
                  key="wizard-submit"
                  className="btn btn-primary"
                  type="submit"
                  disabled={formik.isSubmitting || loadingLookups || !unit}
                >
                  {formik.isSubmitting ? (
                    <>
                      <span className="spinner" aria-hidden="true" />
                      Mengirim...
                    </>
                  ) : (
                    <>
                      Buat tiket
                      <i className="bi bi-send" aria-hidden="true" />
                    </>
                  )}
                </button>
              )}
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
                  <dd>{typeLabel(formik.values.type)}</dd>
                </div>
                <div className="summary-row">
                  <dt>Layanan</dt>
                  <dd>{selectedService?.name || "—"}</dd>
                </div>
                {selectedItem && (
                  <div className="summary-row">
                    <dt>Item</dt>
                    <dd>{selectedItem.name}</dd>
                  </div>
                )}
                <div className="summary-row">
                  <dt>Dampak</dt>
                  <dd>{impactLabel(formik.values.impact)}</dd>
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
                  <dd>
                    {formik.values.type === "incident"
                      ? APPROVAL_TEXT[formik.values.type]
                      : selectedItem
                        ? APPROVAL_MODE_LABELS[selectedItem.approval_mode] ||
                          selectedItem.approval_mode
                        : APPROVAL_TEXT[formik.values.type]}
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          <div className="callout callout--info">
            <i className="bi bi-info-circle" aria-hidden="true" />
            <div>
              Lampiran bisa ditambahkan sekarang (screenshot bug, foto
              perangkat) atau menyusul di detail tiket. Maksimal 3 file, 10 MB
              per file. Jangan unggah data pasien.
            </div>
          </div>
        </aside>
      </form>
    </>
  );
}
