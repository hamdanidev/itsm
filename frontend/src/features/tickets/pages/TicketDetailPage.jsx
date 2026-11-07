import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { pb } from "../../../lib/pocketbase";
import {
  assignTicket,
  createComment,
  createKnowledge,
  createProblem,
  decideTicketApproval,
  delegateTicketApproval,
  escapeFilterValue,
  fetchAssetOptions,
  fetchTimeline,
  fetchTicketAssets,
  fetchTicketCsat,
  linkProblem,
  linkTicketAsset,
  submitTicketCsat,
  triageTicket,
  unlinkTicketAsset,
  getAttachmentUrl,
  getErrorMessage,
  transitionTicket,
  uploadAttachment,
} from "../../../lib/api";
import {
  formatDate,
  formatDateTime,
  formatRelative,
  formatTime,
  impactLabel,
  isOpen,
  priorityLabel,
  statusLabel,
  typeLabel,
} from "../../../lib/format";
import {
  isLead,
  isPlatformStaff,
  isResolver,
  isStaff,
} from "../../../lib/permissions";
import { severityMeta, statusMeta } from "../../incidents/meta";
import { formErrorText, useAppForm } from "../../../lib/formik";
import { TEAM_OPTIONS, teamLabel } from "../../../lib/teams";
import { richTextLength } from "../../../lib/richText";
import { useAuth } from "../../../app/providers/AuthProvider";
import { useTenant } from "../../../app/providers/TenantProvider";
import Modal from "../../../components/ui/Modal";
import RichText from "../../../components/ui/RichText";
import RichTextEditor from "../../../components/ui/RichTextEditor";
import Avatar from "../../../components/ui/Avatar";
import useTicketRealtime from "../lib/useTicketRealtime";
import {
  ApprovalLozenge,
  Priority,
  StatusLozenge,
  TypeIcon,
} from "../components/Badges";
import ResolveTicketModal, {
  RESOLUTION_OPTIONS,
} from "../components/ResolveTicketModal";

const RISK_LABELS = {
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
};

const PRIORITY_OPTIONS = [
  ["critical", "Kritis"],
  ["high", "Tinggi"],
  ["normal", "Normal"],
  ["low", "Rendah"],
];

const IMPACT_OPTIONS = [
  ["patient_safety", "Keselamatan pasien"],
  ["clinical_workflow", "Alur kerja klinis"],
  ["operational", "Operasional"],
  ["convenience", "Kenyamanan"],
];

const ASSET_RELATION_LABELS = {
  affected: "Terdampak",
  caused: "Penyebab",
  related: "Terkait",
};

const STAFF_ROLE_LABELS = {
  it_support: "Staff IT",
  resolver: "Teknisi",
  it_lead: "Kepala IT",
  viewer: "Pengamat",
};

const RESOLUTION_LABELS = Object.fromEntries(RESOLUTION_OPTIONS);

const SLA_FIELD_LABELS = {
  response_due_at: "batas respons",
  approval_due_at: "batas approval",
  resolution_due_at: "batas penyelesaian",
};

const APPROVAL_KIND_LABELS = {
  unit_manager: "Manajer unit",
  it_lead: "Kepala IT",
  cab: "CAB · Kepala IT kedua",
};

const APPROVAL_STATUS_LABELS = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
};

const APPROVAL_STATUS_TONES = {
  pending: "status-in_progress",
  approved: "status-resolved",
  rejected: "status-reopened",
};

function eventMeta(event) {
  const changes = event.changes || {};

  switch (event.action) {
    case "create":
      return {
        icon: "bi-plus-circle",
        tone: "is-create",
        text: `membuat ${typeLabel(changes.type)}`,
      };
    case "assign": {
      const from = changes.from_name;
      const to = changes.to_name;
      let text = "memperbarui assignment";

      if (to && from) text = `memindahkan assignment dari ${from} ke ${to}`;
      else if (to) text = `menugaskan tiket ke ${to}`;
      else if (from) text = `melepas assignment dari ${from}`;

      return { icon: "bi-person-check", tone: "is-assign", text };
    }
    case "transition": {
      const code =
        changes.to === "resolved" && changes.resolution_code
          ? ` · ${RESOLUTION_LABELS[changes.resolution_code] || changes.resolution_code}`
          : "";
      return {
        icon:
          changes.to === "closed"
            ? "bi-archive"
            : changes.to === "resolved"
              ? "bi-check2-circle"
              : changes.to === "reopened"
                ? "bi-arrow-counterclockwise"
                : "bi-arrow-right-circle",
        tone: "is-status",
        text: `${statusLabel(changes.from)} → ${statusLabel(changes.to)}${code}`,
      };
    }
    case "triage": {
      const to = changes.priority?.to;
      return {
        icon: "bi-sliders2",
        tone: "is-assign",
        text: to
          ? `mengubah triage · prioritas menjadi ${priorityLabel(to)}`
          : "mengubah triage tiket",
      };
    }
    case "problem_link":
      return {
        icon: "bi-diagram-3",
        tone: "is-assign",
        text: changes.problem_no
          ? `menautkan tiket ke problem ${changes.problem_no}`
          : "menautkan tiket ke problem",
      };
    case "knowledge_link":
      return {
        icon: "bi-journal-text",
        tone: "is-comment",
        text: changes.title
          ? `membuat artikel pengetahuan “${changes.title}”`
          : "membuat artikel pengetahuan",
      };
    case "asset_link":
      return {
        icon: "bi-hdd-stack",
        tone: "is-assign",
        text: changes.asset_name
          ? `menautkan aset ${changes.asset_name}`
          : "menautkan aset",
      };
    case "asset_unlink":
      return {
        icon: "bi-hdd-stack",
        tone: "is-comment",
        text: changes.asset_name
          ? `melepas aset ${changes.asset_name}`
          : "melepas aset",
      };
    case "csat":
      return {
        icon: "bi-star",
        tone: "is-approved",
        text: `mengirim CSAT ${changes.score || ""}/5`,
      };
    case "incident_link":
      return {
        icon: "bi-exclamation-octagon",
        tone: "is-status",
        text: changes.incident_no
          ? `menautkan tiket ke insiden mayor ${changes.incident_no}`
          : "menautkan tiket ke insiden mayor",
      };
    case "approve":
      return {
        icon: "bi-patch-check",
        tone: "is-approved",
        text: "menyetujui permintaan",
      };
    case "reject":
      return {
        icon: "bi-x-circle",
        tone: "is-rejected",
        text: "menolak permintaan",
      };
    case "delegate": {
      const to = changes.to_name;
      return {
        icon: "bi-person-up",
        tone: "is-assign",
        text: to
          ? `mendelegasikan approval ke ${to}`
          : "mendelegasikan approval",
      };
    }
    case "comment":
      return {
        icon: "bi-chat-left-text",
        tone: "is-comment",
        text:
          changes.visibility === "internal"
            ? "menambahkan komentar internal"
            : "menambahkan komentar publik",
      };
    case "attachment":
      return {
        icon: "bi-paperclip",
        tone: "is-comment",
        text:
          changes.visibility === "internal"
            ? "menambahkan lampiran internal"
            : "menambahkan lampiran",
      };
    case "sla_breach":
      return {
        icon: "bi-exclamation-triangle",
        tone: "is-rejected",
        text: `SLA terlewati · ${SLA_FIELD_LABELS[changes.field] || changes.field || "tenggat"}`,
      };
    case "escalate":
      return {
        icon: "bi-arrow-up-circle",
        tone: "is-rejected",
        text: `mengeskalasi tiket ke Level ${changes.level || "3"}`,
      };
    default:
      return { icon: "bi-clock-history", tone: "", text: "memperbarui tiket" };
  }
}

function TimelineEvent({ event }) {
  const meta = eventMeta(event);

  return (
    <li className="history-item">
      <span className={`history-icon ${meta.tone}`} aria-hidden="true">
        <i className={`bi ${meta.icon}`} />
      </span>
      <div className="history-main">
        <div className="history-text">
          {event.actor?.name ? (
            <>
              <strong>{event.actor.name}</strong> {meta.text}
            </>
          ) : (
            <>Sistem {meta.text}</>
          )}
        </div>
        <div className="history-time" title={formatDateTime(event.created)}>
          {formatTime(event.created)}
        </div>
      </div>
    </li>
  );
}

// Riwayat dikelompokkan per hari supaya aktivitas panjang tetap mudah dibaca.
function timelineDayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "tanpa-tanggal";

  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function timelineDayLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tanpa tanggal";

  const startOfDay = (input) =>
    new Date(input.getFullYear(), input.getMonth(), input.getDate());
  const diffDays = Math.round(
    (startOfDay(new Date()) - startOfDay(date)) / (24 * 60 * 60 * 1000)
  );

  if (diffDays === 0) return "Hari ini";
  if (diffDays === 1) return "Kemarin";

  return formatDate(value);
}

function groupTimeline(events) {
  const groups = [];
  const index = new Map();

  for (const event of events) {
    const key = timelineDayKey(event.created);

    if (!index.has(key)) {
      index.set(key, groups.length);
      groups.push({
        key,
        label: timelineDayLabel(event.created),
        events: [],
      });
    }

    groups[index.get(key)].events.push(event);
  }

  return groups;
}

function DetailField({ label, children }) {
  return (
    <div className="detail-field">
      <div className="detail-label">{label}</div>
      <div className="detail-value">{children || "—"}</div>
    </div>
  );
}

function SlaRow({ label, dueAt, breached, active, paused = false }) {
  if (paused) {
    return (
      <div className="sla-row">
        <span className="sla-row-label">{label}</span>
        <span className="sla-row-value is-paused">
          <i className="bi bi-pause-circle" aria-hidden="true" /> Dijeda
        </span>
      </div>
    );
  }

  const overdue =
    Boolean(breached) || (active && dueAt && new Date(dueAt) < new Date());

  return (
    <div className="sla-row">
      <span className="sla-row-label">{label}</span>
      <span className={`sla-row-value${overdue ? " is-late" : ""}`}>
        {dueAt ? formatDateTime(dueAt) : "—"}
        {overdue ? " · lewat" : ""}
      </span>
    </div>
  );
}

function AttachmentItem({ attachment, onDownload, downloading }) {
  const isInternal = attachment.visibility === "internal";

  return (
    <div className="attachment">
      <span className="attachment-icon">
        <i className="bi bi-file-earmark-text" aria-hidden="true" />
      </span>
      <div className="min-w-0 attachment-copy">
        <div className="attachment-name">
          {attachment.original_name || attachment.file}
        </div>
        <div className="attachment-meta">
          {attachment.expand?.uploader?.name ||
            (attachment.uploader ? "—" : "Pelapor QR")}{" "}
          · {formatDateTime(attachment.created)}
          {isInternal && (
            <span className="lozenge lozenge--neutral" style={{ marginLeft: 6 }}>
              Internal
            </span>
          )}
        </div>
      </div>
      <button
        className="btn btn-outline btn-sm"
        type="button"
        onClick={() => onDownload(attachment)}
        disabled={downloading === attachment.id}
        title="Unduh lampiran"
      >
        {downloading === attachment.id ? (
          <span className="spinner spinner--dark" aria-hidden="true" />
        ) : (
          <i className="bi bi-download" aria-hidden="true" />
        )}
        <span className="visually-hidden">Unduh</span>
      </button>
    </div>
  );
}

export default function TicketDetailPage() {
  const { id } = useParams();
  const routeLocation = useLocation();
  const { user } = useAuth();
  const { isPlatformScope, activeTenantId, setActiveTenant, tenants } = useTenant();
  const staff = isStaff(user);
  const resolver = isResolver(user);
  const canOpenAsset = staff && !isPlatformStaff(user);
  const fileInputRef = useRef(null);
  const realtimeTimer = useRef(null);

  const [ticket, setTicket] = useState(null);
  const [ticketAssets, setTicketAssets] = useState([]);
  const [majorIncident, setMajorIncident] = useState(null);
  const [csat, setCsat] = useState(null);
  const [assetOptions, setAssetOptions] = useState([]);
  const [assetOpen, setAssetOpen] = useState(false);
  const [comments, setComments] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [timelineError, setTimelineError] = useState("");
  const [activityTab, setActivityTab] = useState("comments");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Vendor bisa membuka tiket dari notifikasi/tautan yang tenant-nya berbeda
  // dengan pilihan terakhir. Pemilih tenant harus mengikuti tiket yang sedang
  // dibuka supaya sidebar dan konteks kerja tidak menunjuk rumah sakit lain.
  //
  // Sinkronisasi hanya sekali per tiket: kalau vendor sengaja mengganti rumah
  // sakit saat halaman ini terbuka, pemilih tidak boleh "ditarik balik" ke
  // tenant tiket sebelum halaman berpindah ke daftar.
  const syncedTicketRef = useRef("");

  useEffect(() => {
    if (!isPlatformScope || !ticket) return;
    if (!tenants.length) return;

    const ticketTenant = String(ticket.tenant || "");
    if (!ticketTenant) return;
    if (syncedTicketRef.current === ticket.id) return;

    syncedTicketRef.current = ticket.id;

    if (ticketTenant !== activeTenantId) {
      setActiveTenant(ticketTenant);
    }
  }, [isPlatformScope, ticket, tenants, activeTenantId, setActiveTenant]);

  const [downloading, setDownloading] = useState("");

  const [staffList, setStaffList] = useState([]);
  const [assignTarget, setAssignTarget] = useState("");
  const [actionError, setActionError] = useState(
    routeLocation.state?.attachmentError || ""
  );
  const [actionNotice, setActionNotice] = useState("");
  const [busyAction, setBusyAction] = useState("");

  const [resolveOpen, setResolveOpen] = useState(false);

  const [triageOpen, setTriageOpen] = useState(false);
  const [triageLoading, setTriageLoading] = useState(false);
  const [triageLookups, setTriageLookups] = useState({
    categories: [],
    services: [],
    items: [],
  });

  const [problemOpen, setProblemOpen] = useState(false);
  const [linkProblemOpen, setLinkProblemOpen] = useState(false);
  const [problemOptions, setProblemOptions] = useState([]);
  const [linkProblemLoading, setLinkProblemLoading] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);

  // Draf komentar per tiket: tulisan panjang tidak hilang saat refresh/pindah.
  const commentDraftKey = `ticket-comment-draft:${id}`;

  const commentForm = useAppForm({
    initialValues: { body: "", visibility: "public" },
    validate: (values) => {
      const errors = {};
      if (richTextLength(values.body) === 0) {
        errors.body = "Komentar wajib diisi.";
      }
      return errors;
    },
    onSubmit: async (values, helpers) => {
      helpers.setStatus("");

      try {
        await createComment(id, values.body.trim(), values.visibility);
        await refresh();
        commentForm.resetForm();
        localStorage.removeItem(commentDraftKey);
      } catch (err) {
        helpers.setStatus(getErrorMessage(err));
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  const attachmentForm = useAppForm({
    initialValues: { file: null, visibility: "public" },
    validate: (values) => {
      const errors = {};
      if (!values.file) {
        errors.file = "Pilih file yang akan diunggah.";
      } else if (values.file.size > 10 * 1024 * 1024) {
        errors.file = "Ukuran file maksimal 10 MB.";
      }
      return errors;
    },
    onSubmit: async (values, helpers) => {
      helpers.setStatus("");

      try {
        await uploadAttachment(id, values.file, values.visibility);
        await refresh();
        setActionNotice("Lampiran diunggah.");
        attachmentForm.resetForm();
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (err) {
        helpers.setStatus(getErrorMessage(err));
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  const triageForm = useAppForm({
    initialValues: {
      priority: "normal",
      impact: "operational",
      category: "",
      service: "",
      service_item: "",
      team: "",
      location: "",
      reason: "",
    },
    validate: (values) => {
      const errors = {};
      if (values.reason.trim().length < 5) {
        errors.reason = "Alasan triage wajib diisi minimal 5 karakter.";
      }
      return errors;
    },
    onSubmit: async (values, helpers) => {
      helpers.setStatus("");

      try {
        await triageTicket(id, {
          priority: values.priority,
          impact: values.impact,
          category: values.category,
          service: values.service,
          service_item: values.service_item,
          team: values.team,
          location: values.location.trim(),
          reason: values.reason.trim(),
        });
        await refresh();
        setTriageOpen(false);
        setActionNotice("Triage diperbarui dan SLA dihitung ulang.");
        triageForm.resetForm();
      } catch (err) {
        helpers.setStatus(getErrorMessage(err));
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  const problemForm = useAppForm({
    initialValues: { title: "", description: "" },
    validate: (values) => {
      const errors = {};
      if (values.title.trim().length < 5) {
        errors.title = "Judul problem minimal 5 karakter.";
      }
      return errors;
    },
    onSubmit: async (values, helpers) => {
      helpers.setStatus("");

      try {
        await createProblem({
          title: values.title.trim(),
          description: values.description.trim(),
          ticket_id: id,
          service: ticket?.service || undefined,
        });
        await refresh();
        setProblemOpen(false);
        setActionNotice("Problem dibuat dan ditautkan ke tiket.");
        problemForm.resetForm();
      } catch (err) {
        helpers.setStatus(getErrorMessage(err));
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  const linkProblemForm = useAppForm({
    initialValues: { problem: "" },
    validate: (values) => {
      const errors = {};
      if (!values.problem) errors.problem = "Pilih problem yang akan ditautkan.";
      return errors;
    },
    onSubmit: async (values, helpers) => {
      helpers.setStatus("");

      try {
        await linkProblem(values.problem, id, "caused_by");
        await refresh();
        setLinkProblemOpen(false);
        setActionNotice("Tiket ditautkan ke problem.");
        linkProblemForm.resetForm();
      } catch (err) {
        helpers.setStatus(getErrorMessage(err));
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  const knowledgeForm = useAppForm({
    initialValues: {
      title: "",
      body: "",
      visibility: "internal",
      tags: "",
    },
    validate: (values) => {
      const errors = {};
      if (values.title.trim().length < 5) {
        errors.title = "Judul artikel minimal 5 karakter.";
      }
      if (richTextLength(values.body) < 20) {
        errors.body = "Isi artikel minimal 20 karakter.";
      }
      return errors;
    },
    onSubmit: async (values, helpers) => {
      helpers.setStatus("");

      try {
        await createKnowledge({
          title: values.title.trim(),
          body: values.body.trim(),
          visibility: values.visibility,
          tags: values.tags.trim(),
          ticket_id: id,
          service: ticket?.service || undefined,
          problem: ticket?.problem || undefined,
        });
        await refresh();
        setKnowledgeOpen(false);
        setActionNotice("Artikel dibuat dan ditautkan ke tiket.");
        knowledgeForm.resetForm();
      } catch (err) {
        helpers.setStatus(getErrorMessage(err));
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  const assetForm = useAppForm({
    initialValues: { asset_id: "", relation: "affected" },
    validate: (values) => {
      const errors = {};
      if (!values.asset_id) errors.asset_id = "Pilih aset yang akan ditautkan.";
      return errors;
    },
    onSubmit: async (values, helpers) => {
      helpers.setStatus("");

      try {
        await linkTicketAsset(id, values.asset_id, values.relation);
        await refresh();
        setAssetOpen(false);
        setActionNotice("Aset ditautkan ke tiket.");
        assetForm.resetForm();
      } catch (err) {
        helpers.setStatus(getErrorMessage(err));
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  const csatForm = useAppForm({
    initialValues: { score: 0, comment: "" },
    validate: (values) => {
      const errors = {};
      if (!values.score) errors.score = "Pilih skor kepuasan 1–5.";
      return errors;
    },
    onSubmit: async (values, helpers) => {
      helpers.setStatus("");

      try {
        await submitTicketCsat(id, {
          score: Number(values.score),
          comment: values.comment.trim(),
        });
        await refresh();
        setActionNotice("Terima kasih, penilaian Anda sudah tersimpan.");
        csatForm.resetForm();
      } catch (err) {
        helpers.setStatus(getErrorMessage(err));
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  const [approvalDecision, setApprovalDecision] = useState("");
  const [approvalNote, setApprovalNote] = useState("");
  const [approvalSteps, setApprovalSteps] = useState([]);

  const [delegateOpen, setDelegateOpen] = useState(false);
  const [delegateTarget, setDelegateTarget] = useState("");
  const [delegateNote, setDelegateNote] = useState("");
  const [delegateOptions, setDelegateOptions] = useState([]);
  const [delegateLoading, setDelegateLoading] = useState(false);

  const loadData = useCallback(async () => {
    setError("");
    try {
      const [
        ticketRecord,
        commentList,
        attachmentList,
        stepList,
        assetResult,
        csatResult,
      ] = await Promise.all([
          pb.collection("tickets").getOne(id, {
            expand:
              "requester,assignee,unit,category,service,service_item,requested_for,problem,kb_article,approved_by,resolved_by,closed_by",
          }),
          pb.collection("ticket_comments").getFullList({
            filter: `ticket = "${id}"`,
            sort: "created",
            expand: "author",
          }),
          pb.collection("ticket_attachments").getFullList({
            filter: `ticket = "${id}"`,
            sort: "created",
            expand: "uploader,comment",
          }),
          pb.collection("ticket_approvals").getFullList({
            filter: `ticket = "${id}"`,
            sort: "step",
            expand: "approver,acted_by,delegated_from,delegated_by",
          }),
          fetchTicketAssets(id),
          fetchTicketCsat(id),
        ]);

      setTicket(ticketRecord);
      setTicketAssets(assetResult?.assets || []);
      setCsat(csatResult?.csat || null);
      setComments(commentList);
      setAttachments(attachmentList);
      setApprovalSteps(stepList);

      // Insiden mayor hanya dibaca staf; requester tidak berhak melihat detail.
      if (ticketRecord.major_incident) {
        try {
          setMajorIncident(
            await pb
              .collection("major_incidents")
              .getOne(ticketRecord.major_incident)
          );
        } catch {
          setMajorIncident(null);
        }
      } else {
        setMajorIncident(null);
      }

      document.title = `${ticketRecord.ticket_no} · Healthcare ITSM`;
    } catch (err) {
      setError(getErrorMessage(err));
      setTicket(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadTimeline = useCallback(async () => {
    try {
      const result = await fetchTimeline(id);
      setTimeline(result?.items || []);
      setTimelineError("");
    } catch (err) {
      setTimelineError(getErrorMessage(err));
    }
  }, [id]);

  const refresh = useCallback(async () => {
    await Promise.all([loadData(), loadTimeline()]);
  }, [loadData, loadTimeline]);

  const handleRealtime = useCallback(() => {
    if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
    realtimeTimer.current = setTimeout(() => {
      refresh();
    }, 150);
  }, [refresh]);

  const realtimeConnected = useTicketRealtime(id, handleRealtime);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  useEffect(
    () => () => {
      if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
    },
    []
  );

  // Daftar calon assignee: staf rumah sakit pemilik tiket plus staf vendor
  // (scope platform) yang melayani semua rumah sakit.
  const ticketTenant = ticket?.tenant || "";

  useEffect(() => {
    if (!staff || !ticketTenant) return undefined;

    let active = true;

    pb.collection("users")
      .getFullList({
        filter:
          'is_active = true && (role = "it_support" || role = "it_lead" || role = "resolver") && ' +
          `(is_platform_staff = true || tenant = "${escapeFilterValue(ticketTenant)}")`,
        sort: "name",
      })
      .then((list) => {
        if (active) setStaffList(list);
      })
      .catch(() => {
        if (active) setStaffList([]);
      });

    return () => {
      active = false;
    };
  }, [staff, ticketTenant]);

  useEffect(() => {
    if (!staff || !ticketTenant) return undefined;

    let active = true;

    fetchAssetOptions(ticketTenant)
      .then((result) => {
        if (active) setAssetOptions(result.assets || []);
      })
      .catch(() => {
        if (active) setAssetOptions([]);
      });

    return () => {
      active = false;
    };
  }, [staff, ticketTenant]);

  useEffect(() => {
    if (ticket) setAssignTarget(ticket.assignee || "");
  }, [ticket?.id, ticket?.assignee]);



  async function handleDownload(attachment) {
    setDownloading(attachment.id);
    try {
      const url = await getAttachmentUrl(attachment);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setDownloading("");
    }
  }

  async function runAction(key, action, successMessage) {
    setActionError("");
    setActionNotice("");
    setBusyAction(key);

    try {
      await action();
      await refresh();
      setActionNotice(successMessage);
      return true;
    } catch (err) {
      setActionError(getErrorMessage(err));
      return false;
    } finally {
      setBusyAction("");
    }
  }

  async function handleAssignTo(value) {
    const ok = await runAction(
      "assign",
      () => assignTicket(id, value),
      value ? "Assignee diperbarui." : "Assignment dilepas."
    );

    if (ok) setAssignTarget(value);
  }

  function handleStart() {
    return runAction(
      "start",
      () => transitionTicket(id, { status: "in_progress" }),
      "Tiket mulai dikerjakan."
    );
  }

  function handleClose() {
    return runAction(
      "close",
      () => transitionTicket(id, { status: "closed" }),
      "Tiket ditutup."
    );
  }

  function handleReopen() {
    return runAction(
      "reopen",
      () => transitionTicket(id, { status: "reopened" }),
      "Tiket dibuka kembali. SLA penyelesaian dimulai ulang."
    );
  }

  function handleUnlinkAsset(asset) {
    return runAction(
      `asset-${asset.id}`,
      () => unlinkTicketAsset(id, asset.id),
      `Aset ${asset.name} dilepas dari tiket.`
    );
  }

  function handleWait() {
    return runAction(
      "wait",
      () => transitionTicket(id, { status: "waiting" }),
      "Tiket menunggu requester. SLA penyelesaian dijeda."
    );
  }

  function handleResume() {
    return runAction(
      "resume",
      () => transitionTicket(id, { status: "in_progress" }),
      "Tiket dilanjutkan. Tenggat SLA digeser sesuai durasi jeda."
    );
  }

  function openResolve() {
    setActionError("");
    setActionNotice("");
    setResolveOpen(true);
  }

  function closeResolve() {
    setResolveOpen(false);
  }

  async function openTriage() {
    setActionError("");
    setActionNotice("");
    triageForm.setStatus("");
    triageForm.setValues({
      priority: ticket.priority || "normal",
      impact: ticket.impact || "operational",
      category: ticket.category || "",
      service: ticket.service || "",
      service_item: ticket.service_item || "",
      team: ticket.team || "",
      location: ticket.location || "",
      reason: "",
    });
    setTriageOpen(true);
    setTriageLoading(true);

    try {
      const [categories, services, items] = await Promise.all([
        pb.collection("ticket_categories").getFullList({
          filter: "is_active = true",
          sort: "name",
        }),
        pb.collection("services").getFullList({
          filter: "is_active = true",
          sort: "name",
        }),
        pb.collection("service_items").getFullList({
          filter: "is_active = true",
          sort: "sort,name",
        }),
      ]);

      setTriageLookups({ categories, services, items });
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setTriageLoading(false);
    }
  }

  function closeTriage() {
    if (triageForm.isSubmitting) return;
    setTriageOpen(false);
    triageForm.setStatus("");
  }

  function openProblem() {
    problemForm.setStatus("");
    problemForm.setValues({
      title: ticket.title,
      description: ticket.description || "",
    });
    setProblemOpen(true);
  }

  async function openLinkProblem() {
    setActionError("");
    setActionNotice("");
    linkProblemForm.setStatus("");
    linkProblemForm.setValues({ problem: "" });
    setLinkProblemOpen(true);
    setLinkProblemLoading(true);

    try {
      const list = await pb.collection("problems").getFullList({
        filter: 'status != "closed"',
        sort: "-updated",
      });
      setProblemOptions(list);
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setLinkProblemLoading(false);
    }
  }


  function openKnowledge() {
    knowledgeForm.setStatus("");
    knowledgeForm.setValues({
      title: ticket.title,
      body: ticket.resolution_summary || ticket.description || "",
      visibility: "internal",
      tags: "",
    });
    setKnowledgeOpen(true);
  }

  function openApproval(decision) {
    setActionError("");
    setActionNotice("");
    setApprovalNote("");
    setApprovalDecision(decision);
  }

  function closeApproval() {
    if (busyAction) return;
    setApprovalDecision("");
    setActionError("");
  }

  async function handleApproval() {
    if (!approvalDecision) return;

    if (approvalDecision === "rejected" && approvalNote.trim().length < 5) {
      setActionError("Alasan penolakan wajib diisi minimal 5 karakter.");
      return;
    }

    const ok = await runAction(
      "approval",
      () =>
        decideTicketApproval(
          id,
          approvalDecision,
          approvalNote.trim()
        ),
      approvalDecision === "approved"
        ? "Permintaan disetujui."
        : "Permintaan ditolak."
    );

    if (ok) {
      setApprovalDecision("");
      setApprovalNote("");
      setActionError("");
    }
  }

  async function openDelegate() {
    setActionError("");
    setActionNotice("");
    setDelegateTarget("");
    setDelegateNote("");
    setDelegateOpen(true);
    setDelegateLoading(true);

    try {
      const kind = currentApproval?.kind;
      const roleFilter =
        kind === "it_lead" || kind === "cab"
          ? 'is_active = true && role = "it_lead"'
          : "is_active = true";
      const tenantFilter = ticket?.tenant
        ? ` && (is_platform_staff = true || tenant = "${escapeFilterValue(ticket.tenant)}")`
        : " && is_platform_staff = true";
      const filter = roleFilter + tenantFilter;

      const list = await pb.collection("users").getFullList({
        filter,
        sort: "name",
      });

      setDelegateOptions(list.filter((item) => item.id !== user?.id));
    } catch (err) {
      setDelegateOptions([]);
      setActionError(getErrorMessage(err));
    } finally {
      setDelegateLoading(false);
    }
  }

  function closeDelegate() {
    if (busyAction) return;
    setDelegateOpen(false);
    setActionError("");
  }

  async function handleDelegate() {
    if (!delegateTarget) {
      setActionError("Pilih approver pengganti.");
      return;
    }
    if (delegateNote.trim().length < 5) {
      setActionError("Alasan delegasi wajib diisi minimal 5 karakter.");
      return;
    }

    const ok = await runAction(
      "delegate",
      () => delegateTicketApproval(id, delegateTarget, delegateNote.trim()),
      "Approval didelegasikan."
    );

    if (ok) {
      setDelegateOpen(false);
      setDelegateTarget("");
      setDelegateNote("");
    }
  }

  // Draf komentar: dipulihkan saat tiket dibuka dan disimpan berjeda saat
  // mengetik. Guard `ticket` membuat efek aman pada render loading/error.
  useEffect(() => {
    if (!ticket || ticket.status === "closed") return;

    const saved = localStorage.getItem(commentDraftKey);
    if (saved && richTextLength(commentForm.values.body) === 0) {
      commentForm.setFieldValue("body", saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentDraftKey, ticket?.status]);

  useEffect(() => {
    if (!ticket || ticket.status === "closed") return undefined;

    const timer = setTimeout(() => {
      if (richTextLength(commentForm.values.body) > 0) {
        localStorage.setItem(commentDraftKey, commentForm.values.body);
      } else {
        localStorage.removeItem(commentDraftKey);
      }
    }, 500);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentForm.values.body, commentDraftKey, ticket?.status]);

  if (loading) {
    return (
      <div className="page-state">
        <span className="spinner spinner--dark spinner--lg" role="status" />
        <div className="centered-text">Memuat tiket...</div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="list-panel">
        <div className="empty">
          <div className="empty-icon">
            <i className="bi bi-exclamation-triangle" aria-hidden="true" />
          </div>
          <div className="empty-title">Tiket tidak dapat dibuka</div>
          <p className="empty-text">
            {error || "Tiket tidak ditemukan atau Anda tidak memiliki akses."}
          </p>
          <Link className="btn btn-primary" to="/tickets">
            Kembali ke daftar tiket
          </Link>
        </div>
      </div>
    );
  }

  const active = isOpen(ticket);
  const canComment = ticket.status !== "closed";
  const canUpload = canComment && attachments.length < 3;
  const risk = RISK_LABELS[ticket.change_risk] || "Belum ditentukan";

  const lead = isLead(user);
  const status = ticket.status;
  const approvalRequired = ticket.type !== "incident";
  const approvalApproved = ticket.approval_status === "approved";
  const approvalRejected = ticket.approval_status === "rejected";
  const assignedToMe = Boolean(ticket.assignee) && ticket.assignee === user?.id;
  const isRequester = ticket.requester === user?.id;
  const csatStatusOpen = status === "resolved" || status === "closed";
  const canSubmitCsat = isRequester && csatStatusOpen && !csat;
  // Resolver hanya mengerjakan tiket yang di-assign kepadanya. Staff IT dan
  // Kepala IT tetap agent penuh.
  const canWork = staff || (resolver && assignedToMe);
  const canInternal = canWork;
  // Teknisi dapat mengambil tiket timnya yang belum di-assign.
  const canClaim =
    resolver &&
    !ticket.assignee &&
    Boolean(ticket.team) &&
    ticket.team === user?.team &&
    ["open", "assigned", "reopened"].includes(status);
  const canStart =
    canWork &&
    ["open", "assigned", "reopened"].includes(status) &&
    (lead || !ticket.assignee || assignedToMe) &&
    (!approvalRequired || approvalApproved);
  const canResolve =
    canWork &&
    ["assigned", "in_progress"].includes(status) &&
    (lead || assignedToMe) &&
    (!approvalRequired || approvalApproved);
  const canWait =
    canWork &&
    ["assigned", "in_progress"].includes(status) &&
    (lead || assignedToMe) &&
    (!approvalRequired || approvalApproved);
  const canResume = canWork && status === "waiting" && (lead || assignedToMe);
  const canClose = staff && status === "resolved";
  const canReopen =
    ["resolved", "closed"].includes(status) &&
    (staff || ticket.requester === user?.id);
  const canAssign = staff && !["resolved", "closed"].includes(status);
  const canTriage = staff && ["open", "assigned"].includes(status);
  const currentApproval = approvalSteps.find(
    (step) => step.status === "pending"
  );
  const canApprove =
    approvalRequired &&
    !approvalApproved &&
    ["open", "assigned", "reopened"].includes(status) &&
    (approvalRejected
      ? lead
      : lead ||
        Boolean(currentApproval && currentApproval.approver === user?.id));
  const canDelegate =
    approvalRequired &&
    !approvalApproved &&
    !approvalRejected &&
    ["open", "assigned", "reopened"].includes(status) &&
    Boolean(currentApproval) &&
    (lead || currentApproval.approver === user?.id);

  const primaryAction = canApprove
    ? "approve"
    : canClaim
      ? "claim"
      : canResume
        ? "resume"
        : canStart && status !== "in_progress"
          ? "start"
        : canResolve
          ? "resolve"
          : canClose
            ? "close"
            : canReopen
              ? "reopen"
              : "";

  const showActions = staff || resolver || canReopen || canApprove;
  const timelineGroups = groupTimeline(timeline);

  function handleComposerKeyDown(event) {
    if (!(event.ctrlKey || event.metaKey) || event.key !== "Enter") return;
    if (!canComment || commentForm.isSubmitting) return;

    event.preventDefault();
    commentForm.handleSubmit();
  }

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/tickets">Tiket</Link>
        <span className="sep" aria-hidden="true">
          /
        </span>
        <span>{ticket.ticket_no}</span>
      </nav>

      <div className="issue-head">
        <div className="issue-head-top">
          <div style={{ minWidth: 0 }}>
            <div className="issue-key-line">
              <TypeIcon type={ticket.type} large />
              <span className="issue-key">{ticket.ticket_no}</span>
              <span aria-hidden="true">·</span>
              <span>{typeLabel(ticket.type)}</span>
            </div>

            <h1 className="issue-title">{ticket.title}</h1>

            <div className="issue-meta-line">
              <StatusLozenge status={ticket.status} />
              <Priority priority={ticket.priority} />
              {ticket.approval_status === "pending" && (
                <span className="lozenge lozenge--neutral">Menunggu approval</span>
              )}
              {Number(ticket.escalation_level) >= 2 && (
                <span className="lozenge status-reopened">
                  Eskalasi L{ticket.escalation_level}
                </span>
              )}
              {approvalSteps.length > 1 && currentApproval && (
                <span className="lozenge lozenge--neutral">
                  Approval {currentApproval.step}/{approvalSteps.length}
                </span>
              )}
              {approvalSteps.length > 0 && approvalApproved && (
                <span className="lozenge status-resolved">
                  Approval disetujui
                </span>
              )}
              <span className="issue-meta-sep" aria-hidden="true" />
              <span>Dibuka {formatDateTime(ticket.created)}</span>
              <span>
                oleh {ticket.expand?.requester?.name || "—"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {showActions && (
        <div className="ticket-actions">
          <div className="ticket-actions-main">
            {canClaim && (
              <button
                className={`btn ${
                  primaryAction === "claim" ? "btn-primary" : "btn-outline"
                }`}
                type="button"
                onClick={() => handleAssignTo(user.id)}
                disabled={Boolean(busyAction)}
              >
                {busyAction === "assign" ? (
                  <span className="spinner" aria-hidden="true" />
                ) : (
                  <i className="bi bi-person-check" aria-hidden="true" />
                )}
                Ambil tiket
              </button>
            )}

            {canStart && (
              <button
                className={`btn ${
                  primaryAction === "start" ? "btn-primary" : "btn-outline"
                }`}
                type="button"
                onClick={handleStart}
                disabled={Boolean(busyAction)}
              >
                {busyAction === "start" ? (
                  <span className="spinner" aria-hidden="true" />
                ) : (
                  <i className="bi bi-play-fill" aria-hidden="true" />
                )}
                Mulai kerjakan
              </button>
            )}

            {canResume && (
              <button
                className="btn btn-primary"
                type="button"
                onClick={handleResume}
                disabled={Boolean(busyAction)}
              >
                {busyAction === "resume" ? (
                  <span className="spinner" aria-hidden="true" />
                ) : (
                  <i className="bi bi-play-fill" aria-hidden="true" />
                )}
                Lanjutkan
              </button>
            )}

            {canWait && (
              <button
                className="btn btn-outline"
                type="button"
                onClick={handleWait}
                disabled={Boolean(busyAction)}
              >
                {busyAction === "wait" ? (
                  <span className="spinner" aria-hidden="true" />
                ) : (
                  <i className="bi bi-pause-circle" aria-hidden="true" />
                )}
                Menunggu requester
              </button>
            )}

            {canResolve && (
              <button
                className={`btn ${
                  primaryAction === "resolve" ? "btn-primary" : "btn-outline"
                }`}
                type="button"
                onClick={openResolve}
                disabled={Boolean(busyAction)}
              >
                <i className="bi bi-check2" aria-hidden="true" />
                Selesaikan
              </button>
            )}

            {canClose && (
              <button
                className={`btn ${
                  primaryAction === "close" ? "btn-primary" : "btn-outline"
                }`}
                type="button"
                onClick={handleClose}
                disabled={Boolean(busyAction)}
              >
                {busyAction === "close" ? (
                  <span className="spinner" aria-hidden="true" />
                ) : (
                  <i className="bi bi-archive" aria-hidden="true" />
                )}
                Tutup tiket
              </button>
            )}

            {canReopen && (
              <button
                className={`btn ${
                  primaryAction === "reopen" ? "btn-primary" : "btn-outline"
                }`}
                type="button"
                onClick={handleReopen}
                disabled={Boolean(busyAction)}
              >
                {busyAction === "reopen" ? (
                  <span className="spinner" aria-hidden="true" />
                ) : (
                  <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
                )}
                Buka kembali
              </button>
            )}

            {canApprove && (
              <>
                <button
                  className={`btn ${
                    primaryAction === "approve"
                      ? "btn-primary"
                      : "btn-outline btn-approve"
                  }`}
                  type="button"
                  onClick={() => openApproval("approved")}
                  disabled={Boolean(busyAction)}
                >
                  <i className="bi bi-check-lg" aria-hidden="true" />
                  {approvalRejected ? "Setujui ulang" : "Setujui"}
                </button>

                {!approvalRejected && (
                  <button
                    className="btn btn-outline-danger"
                    type="button"
                    onClick={() => openApproval("rejected")}
                    disabled={Boolean(busyAction)}
                  >
                    <i className="bi bi-x-lg" aria-hidden="true" />
                    Tolak
                  </button>
                )}
              </>
            )}

            {canDelegate && (
              <button
                className="btn btn-outline"
                type="button"
                onClick={openDelegate}
                disabled={Boolean(busyAction)}
              >
                <i className="bi bi-person-up" aria-hidden="true" />
                Delegasikan
              </button>
            )}

            {canTriage && (
              <button
                className="btn btn-subtle"
                type="button"
                onClick={openTriage}
                disabled={Boolean(busyAction)}
              >
                <i className="bi bi-sliders2" aria-hidden="true" />
                Triage
              </button>
            )}

            {!canClaim &&
              !canStart &&
              !canResolve &&
              !canClose &&
              !canReopen &&
              !canApprove &&
              !canWait &&
              !canResume &&
              !canTriage && (
                <span className="ticket-action-hint">
                  {status === "waiting"
                    ? "Menunggu informasi dari requester. SLA penyelesaian dijeda."
                    : approvalRequired && !approvalApproved
                      ? approvalRejected
                        ? "Permintaan ditolak. Kepala IT dapat menyetujui ulang."
                        : currentApproval?.kind === "cab"
                          ? "Menunggu persetujuan Kepala IT kedua (CAB)."
                          : "Menunggu approval Kepala IT sebelum pekerjaan dapat dimulai."
                      : status === "closed"
                        ? "Tiket sudah ditutup."
                        : status === "resolved" && resolver
                          ? "Tiket sudah diselesaikan. Menunggu penutupan oleh Staff IT/Kepala IT."
                          : resolver &&
                              ticket.assignee &&
                              ticket.assignee !== user?.id &&
                              ticket.team === user?.team
                            ? "Tiket tim ini sedang ditangani rekan Anda."
                            : "Tidak ada aksi status untuk Anda."}
                </span>
              )}
          </div>

          {canAssign && (
            <div className="ticket-actions-assign">
              <span className="ticket-actions-label">Assignee</span>

              {lead ? (
                <>
                  <select
                    className="select select-sm"
                    aria-label="Pilih assignee"
                    value={assignTarget}
                    onChange={(event) => setAssignTarget(event.target.value)}
                    disabled={Boolean(busyAction)}
                  >
                    <option value="">Belum di-assign</option>
                    {staffList.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name} ·{" "}
                        {STAFF_ROLE_LABELS[person.role] || person.role}
                      </option>
                    ))}
                  </select>
                  {(ticket.assignee || assignTarget) && (
                    <button
                      className="btn btn-outline btn-sm"
                      type="button"
                      onClick={() => handleAssignTo(assignTarget)}
                      disabled={
                        Boolean(busyAction) ||
                        assignTarget === (ticket.assignee || "")
                      }
                    >
                      {busyAction === "assign" ? (
                        <span
                          className="spinner spinner--dark"
                          aria-hidden="true"
                        />
                      ) : (
                        <i className="bi bi-person-plus" aria-hidden="true" />
                      )}
                      {assignTarget ? "Tugaskan" : "Lepas assignment"}
                    </button>
                  )}
                </>
              ) : ticket.assignee === user?.id ? (
                <span className="ticket-action-hint">Ditugaskan ke Anda</span>
              ) : (
                <button
                  className="btn btn-outline btn-sm"
                  type="button"
                  onClick={() => handleAssignTo(user.id)}
                  disabled={Boolean(busyAction)}
                >
                  {busyAction === "assign" ? (
                    <span className="spinner spinner--dark" aria-hidden="true" />
                  ) : (
                    <i className="bi bi-person-check" aria-hidden="true" />
                  )}
                  Tugaskan ke saya
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {actionError &&
        !resolveOpen &&
        !approvalDecision &&
        !triageOpen &&
        !problemOpen &&
        !linkProblemOpen &&
        !knowledgeOpen && (
        <div className="alert alert--error" role="alert">
          <i className="bi bi-exclamation-triangle" aria-hidden="true" />
          <div>{actionError}</div>
        </div>
      )}

      {actionNotice &&
        !resolveOpen &&
        !approvalDecision &&
        !triageOpen &&
        !problemOpen &&
        !linkProblemOpen &&
        !knowledgeOpen && (
        <div className="alert alert--success" role="status">
          <i className="bi bi-check-circle" aria-hidden="true" />
          <div>{actionNotice}</div>
        </div>
      )}

      {ticket.approval_status === "rejected" && (
        <div className="alert alert--error" role="alert">
          <i className="bi bi-x-circle" aria-hidden="true" />
          <div>
            <strong>Permintaan ini ditolak.</strong>{" "}
            {ticket.approval_note || "Lihat catatan approval."}
          </div>
        </div>
      )}

      <div className="detail-grid is-ticket">
        <div className="detail-main">
          <section className="panel">
            <div className="panel-head">
              <div className="panel-title">Deskripsi</div>
              <span className="panel-count">
                <i className="bi bi-shield-check" aria-hidden="true" /> Attestasi
                tanpa data pasien
              </span>
            </div>
            <div className="panel-body">
              <RichText value={ticket.description} className="description" />
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div className="panel-title">
                <i className="bi bi-hdd-stack" aria-hidden="true" />
                Aset / CI terdampak
              </div>
              <div className="panel-actions">
                <span className="panel-count">{ticketAssets.length} aset</span>
                {staff && (
                  <button
                    className="btn btn-outline btn-sm"
                    type="button"
                    onClick={() => {
                      assetForm.setStatus("");
                      assetForm.resetForm();
                      setAssetOpen(true);
                    }}
                  >
                    <i className="bi bi-link-45deg" aria-hidden="true" />
                    Tautkan aset
                  </button>
                )}
              </div>
            </div>
            <div className="panel-body">
              {ticketAssets.length === 0 ? (
                <div className="muted">
                  Belum ada aset tertaut. Pilih aset saat membuat tiket atau
                  tautkan dari sini.
                </div>
              ) : (
                <ul className="ticket-asset-list">
                  {ticketAssets.map((asset) => (
                    <li key={asset.id}>
                      {staff ? (
                        <Link to={`/assets/${asset.id}`}>
                          <span className="issue-key">{asset.asset_no}</span>
                          <span>{asset.name}</span>
                        </Link>
                      ) : (
                        <span className="issue-link">
                          <span className="issue-key">{asset.asset_no}</span>
                          <span className="issue-summary">{asset.name}</span>
                        </span>
                      )}
                      <span className="admin-sub">
                        {asset.location || "—"} ·{" "}
                        {ASSET_RELATION_LABELS[asset.relation] || asset.relation}
                      </span>
                      {staff && (
                        <button
                          className="btn btn-subtle btn-sm"
                          type="button"
                          onClick={() => handleUnlinkAsset(asset)}
                          disabled={busyAction === `asset-${asset.id}`}
                          title="Lepas aset"
                        >
                          {busyAction === `asset-${asset.id}` ? (
                            <span className="spinner spinner--dark" aria-hidden="true" />
                          ) : (
                            <i className="bi bi-x-lg" aria-hidden="true" />
                          )}
                          <span className="visually-hidden">Lepas aset</span>
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {staff && (
            <section className="panel">
              <div className="panel-head">
                <div className="panel-title">
                  <i className="bi bi-exclamation-octagon" aria-hidden="true" />
                  Insiden mayor
                </div>
                {majorIncident ? (
                  <Link
                    className="panel-link"
                    to={`/incidents/${majorIncident.id}`}
                  >
                    Buka insiden
                  </Link>
                ) : (
                  <Link
                    className="btn btn-outline btn-sm"
                    to={`/incidents?ticket=${ticket.id}`}
                  >
                    <i className="bi bi-plus-lg" aria-hidden="true" />
                    Deklarasikan
                  </Link>
                )}
              </div>
              <div className="panel-body">
                {majorIncident ? (
                  <div className="ticket-incident">
                    <div>
                      <span className="issue-key">
                        {majorIncident.incident_no}
                      </span>
                      <div className="ticket-problem-title">
                        {majorIncident.title}
                      </div>
                    </div>
                    <div className="ticket-incident-badges">
                      <span
                        className={`lozenge ${
                          severityMeta(majorIncident.severity).tone
                        }`}
                      >
                        {severityMeta(majorIncident.severity).short}
                      </span>
                      <span
                        className={`lozenge ${
                          statusMeta(majorIncident.status).tone
                        }`}
                      >
                        {statusMeta(majorIncident.status).label}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="muted">
                    Tiket ini belum bagian dari insiden mayor. Deklarasikan bila
                    gangguan berdampak luas dan butuh satu komando.
                  </div>
                )}
              </div>
            </section>
          )}

          {ticket.type === "change_request" && (
            <section className="panel">
              <div className="panel-head">
                <div className="panel-title">Rencana perubahan</div>
              </div>
              <div className="panel-body">
                <div className="meta-grid meta-grid--3">
                  <DetailField label="Risiko">{risk}</DetailField>
                  <DetailField label="Jadwal mulai">
                    {formatDateTime(ticket.planned_start)}
                  </DetailField>
                  <DetailField label="Jadwal selesai">
                    {formatDateTime(ticket.planned_end)}
                  </DetailField>
                </div>

                <div className="meta-grid" style={{ marginTop: 16 }}>
                  <DetailField label="Rencana implementasi">
                    {ticket.implementation_plan ? (
                      <RichText
                        value={ticket.implementation_plan}
                        className="description"
                      />
                    ) : (
                      <div className="description">Belum diisi</div>
                    )}
                  </DetailField>
                  <DetailField label="Rollback plan">
                    {ticket.rollback_plan ? (
                      <RichText
                        value={ticket.rollback_plan}
                        className="description"
                      />
                    ) : (
                      <div className="description">Belum diisi</div>
                    )}
                  </DetailField>
                </div>
              </div>
            </section>
          )}

          <section className="panel">
            <div className="panel-head">
              <div className="panel-title">Lampiran</div>
              <span className="panel-count">{attachments.length}/3</span>
            </div>
            <div className="panel-body">
              {attachments.length === 0 ? (
                <div className="muted">Belum ada lampiran.</div>
              ) : (
                <div className="attachment-list">
                  {attachments.map((attachment) => (
                    <AttachmentItem
                      key={attachment.id}
                      attachment={attachment}
                      onDownload={handleDownload}
                      downloading={downloading}
                    />
                  ))}
                </div>
              )}

              {canUpload && (
                <form
                  className="attach-form"
                  onSubmit={attachmentForm.handleSubmit}
                >
                  {formErrorText(attachmentForm) && (
                    <div className="alert alert--error" role="alert">
                      <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                      <div>{formErrorText(attachmentForm)}</div>
                    </div>
                  )}

                  <div className="attach-form-row">
                    <div className="attach-file">
                      <span className="form-label">Tambah lampiran</span>
                      <label className="file-input">
                        <input
                          ref={fileInputRef}
                          type="file"
                          className="visually-hidden"
                          accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.log"
                          onChange={(event) =>
                            attachmentForm.setFieldValue(
                              "file",
                              event.target.files?.[0] || null
                            )
                          }
                        />
                        <span className="btn btn-outline btn-sm">
                          <i className="bi bi-paperclip" aria-hidden="true" />
                          Pilih file
                        </span>
                        <span className="file-input-name">
                          {attachmentForm.values.file
                            ? attachmentForm.values.file.name
                            : "Tidak ada file dipilih"}
                        </span>
                      </label>
                    </div>

                    {canInternal && (
                      <div className="attach-visibility">
                        <label className="form-label" htmlFor="uploadVisibility">
                          Visibilitas
                        </label>
                        <select
                          id="uploadVisibility"
                          className="select select-sm"
                          {...attachmentForm.getFieldProps("visibility")}
                        >
                          <option value="public">Publik</option>
                          <option value="internal">Internal</option>
                        </select>
                      </div>
                    )}

                    <button
                      className="btn btn-outline"
                      type="submit"
                      disabled={attachmentForm.isSubmitting}
                    >
                      {attachmentForm.isSubmitting ? (
                        <span className="spinner spinner--dark" aria-hidden="true" />
                      ) : (
                        <i className="bi bi-upload" aria-hidden="true" />
                      )}
                      Unggah
                    </button>
                  </div>

                  <div className="hint">
                    PDF, PNG, JPEG, WebP, TXT, atau LOG. Maksimal 10 MB.
                  </div>
                </form>
              )}

              {!canUpload && canComment && (
                <div className="alert alert--info" style={{ marginTop: 16, marginBottom: 0 }}>
                  Batas 3 lampiran per tiket sudah tercapai.
                </div>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div
                className="activity-tabs"
                role="tablist"
                aria-label="Aktivitas tiket"
              >
                <button
                  className={`activity-tab${
                    activityTab === "comments" ? " is-active" : ""
                  }`}
                  type="button"
                  role="tab"
                  aria-selected={activityTab === "comments"}
                  onClick={() => setActivityTab("comments")}
                >
                  Komentar
                  <span className="tab-count">{comments.length}</span>
                </button>
                <button
                  className={`activity-tab${
                    activityTab === "history" ? " is-active" : ""
                  }`}
                  type="button"
                  role="tab"
                  aria-selected={activityTab === "history"}
                  onClick={() => setActivityTab("history")}
                >
                  Riwayat
                  <span className="tab-count">{timeline.length}</span>
                </button>
              </div>

              <span
                className={`live-status${realtimeConnected ? " is-live" : ""}`}
                title={
                  realtimeConnected
                    ? "Pembaruan realtime aktif"
                    : "Realtime tidak terhubung"
                }
              >
                <span className="live-dot" aria-hidden="true" />
                {realtimeConnected ? "Live" : "Offline"}
              </span>
            </div>
            <div className="panel-body">
              {activityTab === "history" ? (
                <div className="history">
                  {timeline.length === 0 ? (
                    <div className="muted">
                      {timelineError || "Belum ada riwayat aktivitas."}
                    </div>
                  ) : (
                    <>
                      {timelineError && (
                        <div className="history-time" style={{ marginBottom: 8 }}>
                          {timelineError}
                        </div>
                      )}
                      {timelineGroups.map((group) => (
                        <div key={group.key} className="history-group">
                          <div className="history-day">{group.label}</div>
                          <ul className="history-list">
                            {group.events.map((event) => (
                              <TimelineEvent key={event.id} event={event} />
                            ))}
                          </ul>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              ) : comments.length === 0 ? (
                <div className="muted">Belum ada komentar.</div>
              ) : (
                <div className="activity-list">
                  {comments.map((comment) => (
                    <div
                      key={comment.id}
                      className={`comment${
                        comment.visibility === "internal" ? " is-internal" : ""
                      }`}
                    >
                      <Avatar
                        user={comment.expand?.author}
                        size={32}
                        className="avatar--lg"
                      />
                      <div className="comment-main">
                        <div className="comment-head">
                          <span className="comment-author">
                            {comment.expand?.author?.name || "—"}
                          </span>
                          <span className="comment-time">
                            {formatRelative(comment.created)}
                          </span>
                          {comment.visibility === "internal" && (
                            <span className="lozenge lozenge--neutral">
                              Internal
                            </span>
                          )}
                        </div>
                        <RichText
                          value={comment.body}
                          className="comment-body"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activityTab === "comments" && canComment ? (
                <>
                  {formErrorText(commentForm) && (
                    <div className="alert alert--error" style={{ marginTop: 16, marginBottom: 0 }}>
                      <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                      <div>{formErrorText(commentForm)}</div>
                    </div>
                  )}

                  <form
                    className="composer"
                    onSubmit={commentForm.handleSubmit}
                    onKeyDown={handleComposerKeyDown}
                  >
                    <label className="visually-hidden" htmlFor="comment">
                      Tambah komentar
                    </label>
                    <RichTextEditor
                      id="comment"
                      value={commentForm.values.body}
                      onChange={(html) =>
                        commentForm.setFieldValue("body", html)
                      }
                      onBlur={() => commentForm.setFieldTouched("body", true)}
                      placeholder={
                        canInternal
                          ? "Tulis pembaruan untuk pemohon atau catatan internal..."
                          : "Tulis pertanyaan atau informasi tambahan..."
                      }
                      rows={4}
                      maxLength={5000}
                      compact
                    />
                    <div className="composer-bar">
                      <div className="composer-meta">
                        {canInternal ? (
                          <>
                            <span className="composer-note">Visibilitas</span>
                            <div
                              className="segmented"
                              role="group"
                              aria-label="Visibilitas komentar"
                            >
                              {[
                                ["public", "Publik"],
                                ["internal", "Internal"],
                              ].map(([value, label]) => (
                                <button
                                  key={value}
                                  type="button"
                                  className={
                                    commentForm.values.visibility === value
                                      ? "is-active"
                                      : undefined
                                  }
                                  aria-pressed={
                                    commentForm.values.visibility === value
                                  }
                                  onClick={() =>
                                    commentForm.setFieldValue(
                                      "visibility",
                                      value
                                    )
                                  }
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </>
                        ) : (
                          <span className="composer-note">
                            Komentar Anda terlihat oleh tim IT.
                          </span>
                        )}
                      </div>

                      <div className="composer-actions">
                        <span className="composer-shortcut" aria-hidden="true">
                          Ctrl + Enter
                        </span>
                        <button
                          className="btn btn-primary"
                          type="submit"
                          disabled={commentForm.isSubmitting}
                        >
                          {commentForm.isSubmitting ? (
                            <>
                              <span className="spinner" aria-hidden="true" />
                              Mengirim...
                            </>
                          ) : (
                            <>
                              <i className="bi bi-send" aria-hidden="true" />
                              Kirim komentar
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </form>
                </>
              ) : activityTab === "comments" ? (
                <div className="alert alert--info" style={{ marginTop: 16, marginBottom: 0 }}>
                  <i className="bi bi-lock" aria-hidden="true" />
                  <div>Tiket sudah ditutup. Komentar baru tidak dapat ditambahkan.</div>
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <aside
          className={`detail-side is-sticky${
            showActions ? " is-under-actions" : ""
          }`}
        >
          <div className="detail-side-inner">
          <section className="panel is-sla">
            <div className="panel-head">
              <div className="panel-title">SLA</div>
            </div>
            <div className="panel-body">
              <SlaRow
                label="Batas respons"
                dueAt={ticket.response_due_at}
                breached={ticket.response_breach_at}
                active={active}
              />
              {ticket.approval_due_at && (
                <SlaRow
                  label="Batas approval"
                  dueAt={ticket.approval_due_at}
                  breached={ticket.approval_breach_at}
                  active={active}
                />
              )}
              {ticket.resolution_due_at && (
                <SlaRow
                  label="Batas selesai"
                  dueAt={ticket.resolution_due_at}
                  breached={ticket.resolution_breach_at}
                  active={active}
                  paused={ticket.status === "waiting"}
                />
              )}

              {ticket.status === "waiting" && ticket.sla_paused_at && (
                <div className="sla-note is-paused" style={{ marginTop: 10 }}>
                  <i className="bi bi-pause-circle" aria-hidden="true" />
                  SLA dijeda sejak {formatDateTime(ticket.sla_paused_at)}.
                  Tenggat digeser otomatis saat tiket dilanjutkan.
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                {ticket.first_response_at ? (
                  <div className="sla-note is-ok">
                    <i className="bi bi-check2-circle" aria-hidden="true" />
                    Respons pertama: {formatDateTime(ticket.first_response_at)}
                  </div>
                ) : (
                  <div className="sla-note is-muted">
                    <i className="bi bi-hourglass" aria-hidden="true" />
                    Belum ada respons publik dari tim IT.
                  </div>
                )}
              </div>
            </div>
          </section>

          {approvalSteps.length > 0 && (
            <section className="panel is-approval">
              <div className="panel-head">
                <div className="panel-title">Approval</div>
                <span className="panel-count">
                  {approvalSteps.filter((step) => step.status === "approved").length}
                  /{approvalSteps.length} disetujui
                </span>
              </div>
              <div className="panel-body">
                <ol className="approval-steps">
                  {approvalSteps.map((step) => (
                    <li
                      key={step.id}
                      className={`approval-step is-${step.status}${
                        currentApproval?.id === step.id ? " is-current" : ""
                      }`}
                    >
                      <span className="approval-step-no">{step.step}</span>
                      <div className="approval-step-copy">
                        <div className="approval-step-head">
                          <span className="approval-step-title">
                            {APPROVAL_KIND_LABELS[step.kind] || step.kind}
                          </span>
                          <span
                            className={`lozenge ${
                              APPROVAL_STATUS_TONES[step.status] ||
                              "lozenge--neutral"
                            }`}
                          >
                            {APPROVAL_STATUS_LABELS[step.status] || step.status}
                          </span>
                        </div>
                        <div className="approval-step-meta">
                          {step.expand?.approver?.name ||
                            (step.kind === "it_lead"
                              ? "Salah satu Kepala IT"
                              : step.kind === "cab"
                                ? "Kepala IT lain (belum ditentukan)"
                                : "—")}
                          {step.acted_at
                            ? ` · ${formatRelative(step.acted_at)}`
                            : ""}
                          {step.due_at && step.status === "pending" ? (
                            <span
                              className={`approval-step-due${
                                new Date(step.due_at) < new Date()
                                  ? " is-overdue"
                                  : ""
                              }`}
                            >
                              {" · batas "}
                              {formatDateTime(step.due_at)}
                            </span>
                          ) : null}
                        </div>
                        {step.delegated_at && (
                          <div className="approval-step-delegation">
                            <i className="bi bi-person-up" aria-hidden="true" />
                            <span>
                              Didelegasikan
                              {step.expand?.delegated_from?.name
                                ? ` dari ${step.expand.delegated_from.name}`
                                : ""}
                              {step.expand?.delegated_by?.name
                                ? ` oleh ${step.expand.delegated_by.name}`
                                : ""}
                              {step.delegation_note
                                ? ` · ${step.delegation_note}`
                                : ""}
                            </span>
                          </div>
                        )}
                        {step.note && step.status !== "pending" && (
                          <div className="approval-step-note">{step.note}</div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          )}

          <section className="panel">
            <div className="panel-head">
              <div className="panel-title">Detail</div>
            </div>
            <div className="panel-body">
              <DetailField label="Status">
                <StatusLozenge status={ticket.status} />
              </DetailField>
              <DetailField label="Prioritas">
                <Priority priority={ticket.priority} />
              </DetailField>
              <DetailField label="Dampak">{impactLabel(ticket.impact)}</DetailField>
              <DetailField label="Jenis">{typeLabel(ticket.type)}</DetailField>
              <DetailField label="Unit">
                {ticket.expand?.unit?.name || "—"}
              </DetailField>
              <DetailField label="Tim">
                {ticket.team ? teamLabel(ticket.team) : "—"}
              </DetailField>
              <DetailField label="Kategori">
                {ticket.expand?.category?.name || "—"}
              </DetailField>
              <DetailField label="Layanan">
                {ticket.expand?.service?.name || "—"}
              </DetailField>
              {ticket.expand?.service_item && (
                <DetailField label="Item">
                  {ticket.expand.service_item.name}
                </DetailField>
              )}
              {ticket.location && (
                <DetailField label="Lokasi">{ticket.location}</DetailField>
              )}
              <DetailField label="Pemohon">
                {ticket.expand?.requester?.name ||
                  ticket.reporter_name ||
                  "Tamu QR"}
              </DetailField>
              {!ticket.requester && ticket.reporter_contact && (
                <DetailField label="Kontak pelapor">
                  {ticket.reporter_contact}
                </DetailField>
              )}
              {ticket.intake_channel && (
                <DetailField label="Kanal">
                  {{
                    qr: "QR publik",
                    web: "Portal web",
                    email: "Email",
                    telegram: "Telegram",
                    whatsapp: "WhatsApp",
                    manual: "Manual",
                  }[ticket.intake_channel] || ticket.intake_channel}
                </DetailField>
              )}
              {ticket.expand?.requested_for &&
                ticket.expand.requested_for.id !== ticket.requester && (
                  <DetailField label="Dibuat untuk">
                    {ticket.expand.requested_for.name}
                  </DetailField>
                )}
              <DetailField label="Assignee">
                {ticket.expand?.assignee?.name || (
                  <span className="muted">Belum di-assign</span>
                )}
              </DetailField>
              <DetailField label="Approval">
                <ApprovalLozenge status={ticket.approval_status} />
              </DetailField>
              {ticket.approval_note && (
                <DetailField label="Catatan approval">
                  {ticket.approval_note}
                </DetailField>
              )}
              {ticket.resolution_summary && (
                <DetailField label="Resolusi">
                  <RichText value={ticket.resolution_summary} />
                </DetailField>
              )}
              {Number(ticket.sla_paused_minutes) > 0 && (
                <DetailField label="Total jeda SLA">
                  {ticket.sla_paused_minutes} menit
                </DetailField>
              )}
              {Number(ticket.escalation_level) > 0 && (
                <DetailField label="Eskalasi">
                  Level {ticket.escalation_level}
                </DetailField>
              )}
              <DetailField label="Dibuat">
                {formatDateTime(ticket.created)}
              </DetailField>
              <DetailField label="Aktivitas terakhir">
                {formatDateTime(ticket.last_activity_at)}
              </DetailField>
            </div>
          </section>

          {(csat || canSubmitCsat || (csatStatusOpen && staff)) && (
            <section className="panel">
              <div className="panel-head">
                <div className="panel-title">
                  <i className="bi bi-star" aria-hidden="true" />
                  Kepuasan pengguna
                </div>
              </div>
              <div className="panel-body">
                {csat ? (
                  <div className="csat-summary">
                    <div className="csat-stars" aria-label={`Skor ${csat.score} dari 5`}>
                      {[1, 2, 3, 4, 5].map((score) => (
                        <i
                          key={score}
                          className={`bi ${
                            score <= csat.score ? "bi-star-fill" : "bi-star"
                          }`}
                          aria-hidden="true"
                        />
                      ))}
                      <strong>{csat.score}/5</strong>
                    </div>
                    {csat.comment && (
                      <div className="rich-text rich-text--plain">
                        {csat.comment}
                      </div>
                    )}
                  </div>
                ) : canSubmitCsat ? (
                  <form onSubmit={csatForm.handleSubmit}>
                    <div className="field-row">
                      <span className="form-label">
                        Seberapa puas Anda dengan penanganan tiket ini?
                      </span>
                      <div className="csat-picker" role="radiogroup" aria-label="Skor CSAT">
                        {[1, 2, 3, 4, 5].map((score) => (
                          <button
                            key={score}
                            type="button"
                            className={`csat-star${
                              csatForm.values.score >= score ? " is-on" : ""
                            }`}
                            onClick={() => csatForm.setFieldValue("score", score)}
                            aria-label={`${score} dari 5`}
                            aria-pressed={csatForm.values.score === score}
                          >
                            <i className="bi bi-star-fill" aria-hidden="true" />
                          </button>
                        ))}
                      </div>
                      {csatForm.errors.score && (
                        <div className="field-error">{csatForm.errors.score}</div>
                      )}
                    </div>

                    <div className="field-row" style={{ marginTop: 12 }}>
                      <label className="form-label" htmlFor="csat-comment">
                        Komentar (opsional)
                      </label>
                      <textarea
                        id="csat-comment"
                        className="textarea"
                        rows={3}
                        maxLength={2000}
                        placeholder="Apa yang sudah baik atau perlu diperbaiki?"
                        {...csatForm.getFieldProps("comment")}
                      />
                    </div>

                    {formErrorText(csatForm) && (
                      <div className="alert alert--error" role="alert">
                        <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                        <div>{formErrorText(csatForm)}</div>
                      </div>
                    )}

                    <button
                      className="btn btn-primary"
                      type="submit"
                      disabled={csatForm.isSubmitting}
                    >
                      {csatForm.isSubmitting ? "Mengirim..." : "Kirim penilaian"}
                    </button>
                  </form>
                ) : (
                  <div className="muted">
                    Pengguna belum mengisi penilaian untuk tiket ini.
                  </div>
                )}
              </div>
            </section>
          )}

          <section className="panel">
            <div className="panel-head">
              <div className="panel-title">
                <i className="bi bi-diagram-3" aria-hidden="true" />
                Problem & pengetahuan
              </div>
            </div>
            <div className="panel-body">
              {ticket.expand?.problem ? (
                <div className="ticket-problem-box">
                  <div className="ticket-problem-head">
                    <Link to={`/problems/${ticket.problem}`}>
                      {ticket.expand.problem.problem_no}
                    </Link>
                    <span
                      className={`lozenge ${
                        ticket.expand.problem.status === "known_error"
                          ? "status-reopened"
                          : ticket.expand.problem.status === "resolved" ||
                              ticket.expand.problem.status === "closed"
                            ? "status-resolved"
                            : "lozenge--neutral"
                      }`}
                    >
                      {ticket.expand.problem.status === "known_error"
                        ? "Known error"
                        : ticket.expand.problem.status}
                    </span>
                  </div>
                  <div className="ticket-problem-title">
                    {ticket.expand.problem.title}
                  </div>

                  {ticket.expand.problem.status === "known_error" &&
                    ticket.expand.problem.workaround && (
                      <div className="callout callout--warning">
                        <i className="bi bi-lightbulb" aria-hidden="true" />
                        <div>
                          <strong>Workaround:</strong>{" "}
                          <RichText value={ticket.expand.problem.workaround} />
                        </div>
                      </div>
                    )}

                  {staff && (
                    <button
                      className="btn btn-subtle btn-sm"
                      type="button"
                      onClick={openLinkProblem}
                    >
                      Ganti problem
                    </button>
                  )}
                </div>
              ) : staff ? (
                <div className="ticket-problem-actions">
                  <button
                    className="btn btn-outline btn-sm"
                    type="button"
                    onClick={openProblem}
                  >
                    <i className="bi bi-plus-lg" aria-hidden="true" />
                    Buat problem
                  </button>
                  <button
                    className="btn btn-subtle btn-sm"
                    type="button"
                    onClick={openLinkProblem}
                  >
                    Tautkan problem
                  </button>
                </div>
              ) : (
                <div className="report-empty">Belum ada problem terkait.</div>
              )}

              <div className="ticket-knowledge-block">
                {ticket.expand?.kb_article ? (
                  <Link
                    className="ticket-knowledge-link"
                    to={`/knowledge/${ticket.kb_article}`}
                  >
                    <i className="bi bi-journal-text" aria-hidden="true" />
                    {ticket.expand.kb_article.title}
                  </Link>
                ) : staff ? (
                  <button
                    className="btn btn-subtle btn-sm"
                    type="button"
                    onClick={openKnowledge}
                  >
                    <i className="bi bi-journal-plus" aria-hidden="true" />
                    Buat artikel dari tiket
                  </button>
                ) : (
                  <div className="report-empty">Belum ada artikel terkait.</div>
                )}
              </div>
            </div>
          </section>

          

          <div className="callout callout--info">
            <i className="bi bi-shield-exclamation" aria-hidden="true" />
            <div>
              Tiket ini tidak boleh memuat identitas pasien. Jika Anda menemukan
              data pasien pada komentar atau lampiran, segera hubungi Kepala IT.
            </div>
          </div>
          </div>
        </aside>
      </div>

      {assetOpen && (
        <Modal
          title="Tautkan aset / CI"
          description={`${ticket.ticket_no} · ${ticket.title}`}
          onClose={() => (assetForm.isSubmitting ? null : setAssetOpen(false))}
          footer={
            <>
              <button
                className="btn btn-subtle"
                type="button"
                onClick={() => setAssetOpen(false)}
                disabled={assetForm.isSubmitting}
              >
                Batal
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                form="ticket-asset-form"
                disabled={assetForm.isSubmitting}
              >
                {assetForm.isSubmitting ? "Menautkan..." : "Tautkan aset"}
              </button>
            </>
          }
        >
          <form id="ticket-asset-form" onSubmit={assetForm.handleSubmit}>
            {formErrorText(assetForm) && (
              <div className="alert alert--error" role="alert">
                <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                <div>{formErrorText(assetForm)}</div>
              </div>
            )}

            <div className="field-row">
              <label className="form-label" htmlFor="ticket-asset">
                Aset <span className="req">*</span>
              </label>
              <select
                id="ticket-asset"
                className="select"
                {...assetForm.getFieldProps("asset_id")}
              >
                <option value="">Pilih aset</option>
                {assetOptions.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name} · {asset.asset_no}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-row" style={{ marginTop: 16 }}>
              <label className="form-label" htmlFor="ticket-asset-relation">
                Hubungan
              </label>
              <select
                id="ticket-asset-relation"
                className="select"
                {...assetForm.getFieldProps("relation")}
              >
                <option value="affected">Terdampak</option>
                <option value="caused">Penyebab</option>
                <option value="related">Terkait</option>
              </select>
            </div>
          </form>
        </Modal>
      )}

      {problemOpen && (
        <Modal
          title="Buat problem"
          description={`${ticket.ticket_no} · ${ticket.title}`}
          onClose={() => {
            if (!problemForm.isSubmitting) setProblemOpen(false);
          }}
          footer={
            <>
              <button
                className="btn btn-subtle"
                type="button"
                onClick={() => setProblemOpen(false)}
                disabled={problemForm.isSubmitting}
              >
                Batal
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                form="ticket-problem-form"
                disabled={problemForm.isSubmitting}
              >
                {problemForm.isSubmitting ? (
                  <span className="spinner" aria-hidden="true" />
                ) : (
                  <i className="bi bi-diagram-3" aria-hidden="true" />
                )}
                Buat problem
              </button>
            </>
          }
        >
          {formErrorText(problemForm) && (
            <div className="alert alert--error" role="alert">
              <i className="bi bi-exclamation-triangle" aria-hidden="true" />
              <div>{formErrorText(problemForm)}</div>
            </div>
          )}

          <form id="ticket-problem-form" onSubmit={problemForm.handleSubmit}>
            <div className="field-row">
              <label className="form-label" htmlFor="ticket-problem-title">
                Judul problem <span className="req">*</span>
              </label>
              <input
                id="ticket-problem-title"
                className="input"
                maxLength={160}
                {...problemForm.getFieldProps("title")}
                required
              />
            </div>

            <div className="field-row" style={{ marginTop: 16 }}>
              <label className="form-label" htmlFor="ticket-problem-description">
                Deskripsi
              </label>
              <RichTextEditor
                id="ticket-problem-description"
                value={problemForm.values.description}
                onChange={(html) =>
                  problemForm.setFieldValue("description", html)
                }
                onBlur={() =>
                  problemForm.setFieldTouched("description", true)
                }
                rows={4}
                maxLength={10000}
                compact
              />
              <div className="hint">
                Problem akan ditautkan ke tiket ini. Tambahkan insiden lain dari
                halaman problem.
              </div>
            </div>
          </form>
        </Modal>
      )}

      {linkProblemOpen && (
        <Modal
          title="Tautkan problem"
          description={`${ticket.ticket_no} · ${ticket.title}`}
          onClose={() => {
            if (!linkProblemForm.isSubmitting) setLinkProblemOpen(false);
          }}
          footer={
            <>
              <button
                className="btn btn-subtle"
                type="button"
                onClick={() => setLinkProblemOpen(false)}
                disabled={Boolean(busyAction)}
              >
                Batal
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                form="ticket-link-problem-form"
                disabled={linkProblemForm.isSubmitting || linkProblemLoading}
              >
                {linkProblemForm.isSubmitting ? (
                  <span className="spinner" aria-hidden="true" />
                ) : (
                  <i className="bi bi-link-45deg" aria-hidden="true" />
                )}
                Tautkan
              </button>
            </>
          }
        >
          {formErrorText(linkProblemForm) && (
            <div className="alert alert--error" role="alert">
              <i className="bi bi-exclamation-triangle" aria-hidden="true" />
              <div>{formErrorText(linkProblemForm)}</div>
            </div>
          )}

          <form
            id="ticket-link-problem-form"
            onSubmit={linkProblemForm.handleSubmit}
          >
            <div className="field-row">
              <label className="form-label" htmlFor="ticket-link-problem">
                Problem
              </label>
              <select
                id="ticket-link-problem"
                className="select"
                {...linkProblemForm.getFieldProps("problem")}
                disabled={linkProblemLoading}
              >
                <option value="">
                  {linkProblemLoading ? "Memuat problem..." : "Pilih problem"}
                </option>
                {problemOptions.map((problem) => (
                  <option key={problem.id} value={problem.id}>
                    {problem.problem_no} · {problem.title}
                  </option>
                ))}
              </select>
              <div className="hint">
                Tiket akan tercatat sebagai penyebab problem dan muncul di
                halaman problem.
              </div>
            </div>
          </form>
        </Modal>
      )}

      {knowledgeOpen && (
        <Modal
          title="Buat artikel pengetahuan"
          description={`${ticket.ticket_no} · ${ticket.title}`}
          onClose={() => {
            if (!knowledgeForm.isSubmitting) setKnowledgeOpen(false);
          }}
          wide
          footer={
            <>
              <button
                className="btn btn-subtle"
                type="button"
                onClick={() => setKnowledgeOpen(false)}
                disabled={knowledgeForm.isSubmitting}
              >
                Batal
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                form="ticket-knowledge-form"
                disabled={knowledgeForm.isSubmitting}
              >
                {knowledgeForm.isSubmitting ? (
                  <span className="spinner" aria-hidden="true" />
                ) : (
                  <i className="bi bi-journal-plus" aria-hidden="true" />
                )}
                Simpan draft
              </button>
            </>
          }
        >
          {formErrorText(knowledgeForm) && (
            <div className="alert alert--error" role="alert">
              <i className="bi bi-exclamation-triangle" aria-hidden="true" />
              <div>{formErrorText(knowledgeForm)}</div>
            </div>
          )}

          <form id="ticket-knowledge-form" onSubmit={knowledgeForm.handleSubmit}>
            <div className="field-row">
              <label className="form-label" htmlFor="ticket-knowledge-title">
                Judul artikel <span className="req">*</span>
              </label>
              <input
                id="ticket-knowledge-title"
                className="input"
                maxLength={160}
                {...knowledgeForm.getFieldProps("title")}
                required
              />
            </div>

            <div className="field-row" style={{ marginTop: 16 }}>
              <label className="form-label" htmlFor="ticket-knowledge-body">
                Isi artikel <span className="req">*</span>
              </label>
              <RichTextEditor
                id="ticket-knowledge-body"
                value={knowledgeForm.values.body}
                onChange={(html) =>
                  knowledgeForm.setFieldValue("body", html)
                }
                onBlur={() =>
                  knowledgeForm.setFieldTouched("body", true)
                }
                rows={8}
                maxLength={30000}
              />
            </div>

            <div className="form-grid" style={{ marginTop: 16 }}>
              <div>
                <label className="form-label" htmlFor="ticket-knowledge-visibility">
                  Visibilitas
                </label>
                <select
                  id="ticket-knowledge-visibility"
                  className="select"
                  {...knowledgeForm.getFieldProps("visibility")}
                >
                  <option value="internal">Internal IT</option>
                  <option value="public">Publik untuk pengguna</option>
                </select>
              </div>

              <div>
                <label className="form-label" htmlFor="ticket-knowledge-tags">
                  Tag
                </label>
                <input
                  id="ticket-knowledge-tags"
                  className="input"
                  maxLength={500}
                  placeholder="printer, farmasi, e-resep"
                  {...knowledgeForm.getFieldProps("tags")}
                />
              </div>
            </div>
          </form>
        </Modal>
      )}

      {triageOpen && (
        <Modal
          title="Triage tiket"
          description={`${ticket.ticket_no} · ${ticket.title} · koreksi prioritas, klasifikasi, dan layanan sebelum pekerjaan dimulai.`}
          onClose={closeTriage}
          wide
          footer={
            <>
              <button
                className="btn btn-subtle"
                type="button"
                onClick={closeTriage}
                disabled={triageForm.isSubmitting}
              >
                Batal
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                form="triage-form"
                disabled={triageForm.isSubmitting || triageLoading}
              >
                {triageForm.isSubmitting ? (
                  <span className="spinner" aria-hidden="true" />
                ) : (
                  <i className="bi bi-sliders2" aria-hidden="true" />
                )}
                Simpan triage
              </button>
            </>
          }
        >
          {formErrorText(triageForm) && (
            <div className="alert alert--error" role="alert">
              <i className="bi bi-exclamation-triangle" aria-hidden="true" />
              <div>{formErrorText(triageForm)}</div>
            </div>
          )}

          <form id="triage-form" onSubmit={triageForm.handleSubmit}>
            <div className="form-grid">
              <div>
                <label className="form-label" htmlFor="triagePriority">
                  Prioritas
                </label>
                <select
                  id="triagePriority"
                  className="select"
                  {...triageForm.getFieldProps("priority")}
                >
                  {PRIORITY_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label" htmlFor="triageImpact">
                  Dampak klinis
                </label>
                <select
                  id="triageImpact"
                  className="select"
                  {...triageForm.getFieldProps("impact")}
                >
                  {IMPACT_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-grid" style={{ marginTop: 16 }}>
              <div>
                <label className="form-label" htmlFor="triageCategory">
                  Kategori
                </label>
                <select
                  id="triageCategory"
                  className="select"
                  {...triageForm.getFieldProps("category")}
                  disabled={triageLoading}
                >
                  <option value="">Tanpa kategori</option>
                  {triageLookups.categories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label" htmlFor="triageService">
                  Layanan
                </label>
                <select
                  id="triageService"
                  className="select"
                  value={triageForm.values.service}
                  onChange={(event) => {
                    triageForm.setFieldValue("service", event.target.value);
                    triageForm.setFieldValue("service_item", "");
                  }}
                  disabled={triageLoading}
                >
                  <option value="">Tanpa layanan</option>
                  {triageLookups.services.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-grid" style={{ marginTop: 16 }}>
              <div>
                <label className="form-label" htmlFor="triageItem">
                  Item permintaan
                </label>
                <select
                  id="triageItem"
                  className="select"
                  {...triageForm.getFieldProps("service_item")}
                  disabled={triageLoading || !triageForm.values.service}
                >
                  <option value="">Tanpa item</option>
                  {triageLookups.items
                    .filter((item) => item.service === triageForm.values.service)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="form-label" htmlFor="triageLocation">
                  Lokasi / ruang
                </label>
                <input
                  id="triageLocation"
                  className="input"
                  maxLength={120}
                  {...triageForm.getFieldProps("location")}
                />
              </div>
            </div>

            <div className="field-row" style={{ marginTop: 16 }}>
              <label className="form-label" htmlFor="triageTeam">
                Tim penanggung jawab
              </label>
              <select
                id="triageTeam"
                className="select"
                {...triageForm.getFieldProps("team")}
              >
                <option value="">Tanpa tim</option>
                {TEAM_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <div className="hint">
                Menentukan antrean tim yang dapat melihat tiket ini.
              </div>
            </div>

            <div className="modal-field">
              <label className="form-label" htmlFor="triageReason">
                Alasan triage <span className="req">*</span>
              </label>
              <textarea
                id="triageReason"
                className="textarea"
                rows={3}
                minLength={5}
                maxLength={500}
                {...triageForm.getFieldProps("reason")}
                placeholder="Contoh: dampak klinis lebih tinggi dari laporan awal; prioritas dinaikkan."
                required
              />
              <div className="hint">
                SLA dan tahap approval dihitung ulang dari waktu tiket dibuat.
                Perubahan tercatat di audit dan riwayat.
              </div>
            </div>
          </form>
        </Modal>
      )}

      <ResolveTicketModal
        open={resolveOpen}
        ticket={ticket}
        onClose={closeResolve}
        onResolved={async () => {
          await refresh();
          setResolveOpen(false);
          setActionNotice("Tiket ditandai selesai.");
        }}
      />

      {delegateOpen && (
        <Modal
          title="Delegasikan approval"
          description={`${ticket.ticket_no} · ${ticket.title}${
            currentApproval
              ? ` · Tahap ${currentApproval.step} dari ${approvalSteps.length}`
              : ""
          }`}
          onClose={closeDelegate}
          footer={
            <>
              <button
                className="btn btn-subtle"
                type="button"
                onClick={closeDelegate}
                disabled={Boolean(busyAction)}
              >
                Batal
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={handleDelegate}
                disabled={
                  Boolean(busyAction) || delegateLoading || !delegateTarget
                }
              >
                {busyAction === "delegate" ? (
                  <span className="spinner" aria-hidden="true" />
                ) : (
                  <i className="bi bi-person-up" aria-hidden="true" />
                )}
                Delegasikan
              </button>
            </>
          }
        >
          {actionError && (
            <div className="alert alert--error" role="alert">
              <i className="bi bi-exclamation-triangle" aria-hidden="true" />
              <div>{actionError}</div>
            </div>
          )}

          <div className="modal-field">
            <label className="form-label" htmlFor="delegateTarget">
              Approver pengganti <span className="req">*</span>
            </label>
            <select
              id="delegateTarget"
              className="select"
              value={delegateTarget}
              onChange={(event) => setDelegateTarget(event.target.value)}
              disabled={delegateLoading}
            >
              <option value="">
                {delegateLoading ? "Memuat pengguna..." : "Pilih approver"}
              </option>
              {delegateOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name || item.email} ·{" "}
                  {item.role === "it_lead"
                    ? "Kepala IT"
                    : item.role === "it_support"
                      ? "Staff IT"
                      : item.role === "resolver"
                        ? "Teknisi"
                        : item.role === "viewer"
                          ? "Pengamat"
                          : "Pemohon"}
                </option>
              ))}
            </select>
            <div className="hint">
              Delegasi berlaku untuk tahap yang sedang menunggu. Approver asli
              tetap tercatat di riwayat.
            </div>
          </div>

          <div className="modal-field">
            <label className="form-label" htmlFor="delegateNote">
              Alasan delegasi <span className="req">*</span>
            </label>
            <textarea
              id="delegateNote"
              className="textarea"
              rows={3}
              maxLength={2000}
              minLength={5}
              value={delegateNote}
              onChange={(event) => setDelegateNote(event.target.value)}
              placeholder="Contoh: manajer unit sedang cuti sampai Jumat."
            />
            <div className="hint">
              Alasan ini tersimpan di audit log dan riwayat tiket.
            </div>
          </div>
        </Modal>
      )}

      {approvalDecision && (
        <Modal
          title={
            approvalDecision === "approved"
              ? approvalRejected
                ? "Setujui ulang permintaan"
                : "Setujui permintaan"
              : "Tolak permintaan"
          }
          description={`${ticket.ticket_no} · ${ticket.title}${
            currentApproval
              ? ` · Tahap ${currentApproval.step} dari ${approvalSteps.length}`
              : approvalRejected
                ? " · Setujui ulang"
                : ""
          }`}
          onClose={closeApproval}
          footer={
            <>
              <button
                className="btn btn-subtle"
                type="button"
                onClick={closeApproval}
                disabled={Boolean(busyAction)}
              >
                Batal
              </button>
              <button
                className={
                  approvalDecision === "approved"
                    ? "btn btn-primary"
                    : "btn btn-danger"
                }
                type="button"
                onClick={handleApproval}
                disabled={Boolean(busyAction)}
              >
                {busyAction === "approval" ? (
                  <span className="spinner" aria-hidden="true" />
                ) : (
                  <i
                    className={`bi ${
                      approvalDecision === "approved"
                        ? "bi-check-lg"
                        : "bi-x-lg"
                    }`}
                    aria-hidden="true"
                  />
                )}
                {approvalDecision === "approved"
                  ? approvalRejected
                    ? "Setujui ulang permintaan"
                    : "Setujui permintaan"
                  : "Tolak permintaan"}
              </button>
            </>
          }
        >
          {actionError && (
            <div className="alert alert--error" role="alert">
              <i className="bi bi-exclamation-triangle" aria-hidden="true" />
              <div>{actionError}</div>
            </div>
          )}

          <div className="modal-field">
            <label className="form-label" htmlFor="approvalNote">
              Catatan approval
              {approvalDecision === "rejected" && (
                <span className="req"> *</span>
              )}
            </label>
            <textarea
              id="approvalNote"
              className="textarea"
              rows={4}
              maxLength={2000}
              autoFocus
              placeholder={
                approvalDecision === "approved"
                  ? "Catatan persetujuan (opsional)..."
                  : "Alasan penolakan..."
              }
              value={approvalNote}
              onChange={(event) => setApprovalNote(event.target.value)}
            />
            <div className="hint">
              Catatan ini tersimpan di tiket dan audit log.
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
