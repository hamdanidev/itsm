import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { pb } from "../../../lib/pocketbase";
import {
  assignTicket,
  createComment,
  decideTicketApproval,
  delegateTicketApproval,
  fetchTimeline,
  getAttachmentUrl,
  getErrorMessage,
  transitionTicket,
  uploadAttachment,
} from "../../../lib/api";
import {
  formatDateTime,
  formatRelative,
  impactLabel,
  isOpen,
  statusLabel,
  typeLabel,
} from "../../../lib/format";
import { isLead, isStaff } from "../../../lib/permissions";
import { useAuth } from "../../../app/providers/AuthProvider";
import Modal from "../../../components/ui/Modal";
import Avatar from "../../../components/ui/Avatar";
import useTicketRealtime from "../lib/useTicketRealtime";
import {
  ApprovalLozenge,
  Priority,
  StatusLozenge,
  TypeIcon,
} from "../components/Badges";

const RISK_LABELS = {
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
};

const RESOLUTION_OPTIONS = [
  ["fixed", "Diperbaiki"],
  ["workaround", "Workaround"],
  ["duplicate", "Duplikat"],
  ["not_reproducible", "Tidak dapat direproduksi"],
  ["rejected", "Ditolak"],
  ["other", "Lainnya"],
];

const STAFF_ROLE_LABELS = {
  it_support: "IT Support",
  it_lead: "IT Lead",
};

const RESOLUTION_LABELS = Object.fromEntries(RESOLUTION_OPTIONS);

const SLA_FIELD_LABELS = {
  response_due_at: "batas respons",
  approval_due_at: "batas approval",
  resolution_due_at: "batas penyelesaian",
};

const APPROVAL_KIND_LABELS = {
  unit_manager: "Manajer unit",
  it_lead: "IT Lead",
  cab: "CAB · IT Lead kedua",
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
          {formatRelative(event.created)}
        </div>
      </div>
    </li>
  );
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
          {attachment.expand?.uploader?.name || "—"} ·{" "}
          {formatDateTime(attachment.created)}
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
  const { user } = useAuth();
  const staff = isStaff(user);
  const fileInputRef = useRef(null);
  const realtimeTimer = useRef(null);

  const [ticket, setTicket] = useState(null);
  const [comments, setComments] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [timelineError, setTimelineError] = useState("");
  const [activityTab, setActivityTab] = useState("comments");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [commentBody, setCommentBody] = useState("");
  const [commentVisibility, setCommentVisibility] = useState("public");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState("");

  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadVisibility, setUploadVisibility] = useState("public");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [downloading, setDownloading] = useState("");

  const [staffList, setStaffList] = useState([]);
  const [assignTarget, setAssignTarget] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [busyAction, setBusyAction] = useState("");

  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolutionSummary, setResolutionSummary] = useState("");
  const [resolutionCode, setResolutionCode] = useState("fixed");

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
      const [ticketRecord, commentList, attachmentList, stepList] =
        await Promise.all([
          pb.collection("tickets").getOne(id, {
            expand:
              "requester,assignee,unit,category,approved_by,resolved_by,closed_by",
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
        ]);

      setTicket(ticketRecord);
      setComments(commentList);
      setAttachments(attachmentList);
      setApprovalSteps(stepList);
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

  useEffect(() => {
    if (!staff) return undefined;

    let active = true;

    pb.collection("users")
      .getFullList({
        filter:
          'is_active = true && (role = "it_support" || role = "it_lead")',
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
  }, [staff]);

  useEffect(() => {
    if (ticket) setAssignTarget(ticket.assignee || "");
  }, [ticket?.id, ticket?.assignee]);

  async function handleCommentSubmit(event) {
    event.preventDefault();
    setCommentError("");

    if (!commentBody.trim()) {
      setCommentError("Komentar tidak boleh kosong.");
      return;
    }

    setSubmittingComment(true);
    try {
      await createComment(id, commentBody.trim(), commentVisibility);
      setCommentBody("");
      setCommentVisibility("public");
      await refresh();
    } catch (err) {
      setCommentError(getErrorMessage(err));
    } finally {
      setSubmittingComment(false);
    }
  }

  async function handleUpload(event) {
    event.preventDefault();
    setUploadError("");

    if (!selectedFile) {
      setUploadError("Pilih file terlebih dahulu.");
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setUploadError("Ukuran file maksimal 10 MB.");
      return;
    }

    setUploading(true);
    try {
      await uploadAttachment(id, selectedFile, uploadVisibility);
      setSelectedFile(null);
      setUploadVisibility("public");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await refresh();
    } catch (err) {
      setUploadError(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

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
    if (busyAction) return;
    setResolveOpen(false);
    setActionError("");
  }

  async function handleResolve(event) {
    event.preventDefault();

    if (resolutionSummary.trim().length < 10) {
      setActionError("Ringkasan resolusi wajib diisi minimal 10 karakter.");
      return;
    }

    const ok = await runAction(
      "resolve",
      () =>
        transitionTicket(id, {
          status: "resolved",
          resolution_summary: resolutionSummary.trim(),
          resolution_code: resolutionCode,
        }),
      "Tiket ditandai selesai."
    );

    if (ok) {
      setResolveOpen(false);
      setResolutionSummary("");
      setResolutionCode("fixed");
      setActionError("");
    }
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
      const filter =
        kind === "it_lead" || kind === "cab"
          ? 'is_active = true && role = "it_lead"'
          : "is_active = true";

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
  const canStart =
    staff &&
    ["open", "assigned", "reopened"].includes(status) &&
    (lead || !ticket.assignee || assignedToMe) &&
    (!approvalRequired || approvalApproved);
  const canResolve =
    staff &&
    ["assigned", "in_progress"].includes(status) &&
    (lead || assignedToMe) &&
    (!approvalRequired || approvalApproved);
  const canWait =
    staff &&
    ["assigned", "in_progress"].includes(status) &&
    (lead || assignedToMe) &&
    (!approvalRequired || approvalApproved);
  const canResume = staff && status === "waiting" && (lead || assignedToMe);
  const canClose = staff && status === "resolved";
  const canReopen =
    ["resolved", "closed"].includes(status) &&
    (staff || ticket.requester === user?.id);
  const canAssign = staff && !["resolved", "closed"].includes(status);
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

  const showActions = staff || canReopen || canApprove;

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

            {!canStart &&
              !canResolve &&
              !canClose &&
              !canReopen &&
              !canApprove &&
              !canWait &&
              !canResume && (
                <span className="ticket-action-hint">
                  {status === "waiting"
                    ? "Menunggu informasi dari requester. SLA penyelesaian dijeda."
                    : approvalRequired && !approvalApproved
                      ? approvalRejected
                        ? "Permintaan ditolak. IT Lead dapat menyetujui ulang."
                        : currentApproval?.kind === "cab"
                          ? "Menunggu persetujuan IT Lead kedua (CAB)."
                          : "Menunggu approval IT Lead sebelum pekerjaan dapat dimulai."
                      : status === "closed"
                        ? "Tiket sudah ditutup."
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

      {actionError && !resolveOpen && !approvalDecision && (
        <div className="alert alert--error" role="alert">
          <i className="bi bi-exclamation-triangle" aria-hidden="true" />
          <div>{actionError}</div>
        </div>
      )}

      {actionNotice && !resolveOpen && !approvalDecision && (
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

      <div className="issue-grid">
        <div className="issue-main">
          <section className="panel">
            <div className="panel-head">
              <div className="panel-title">Deskripsi</div>
              <span className="panel-count">
                <i className="bi bi-shield-check" aria-hidden="true" /> Attestasi
                tanpa data pasien
              </span>
            </div>
            <div className="panel-body">
              <div className="description">{ticket.description}</div>
            </div>
          </section>

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
                    <div className="description">
                      {ticket.implementation_plan || "Belum diisi"}
                    </div>
                  </DetailField>
                  <DetailField label="Rollback plan">
                    <div className="description">
                      {ticket.rollback_plan || "Belum diisi"}
                    </div>
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
                <form className="attach-form" onSubmit={handleUpload}>
                  {uploadError && (
                    <div className="alert alert--error" role="alert">
                      <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                      <div>{uploadError}</div>
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
                            setSelectedFile(event.target.files?.[0] || null)
                          }
                        />
                        <span className="btn btn-outline btn-sm">
                          <i className="bi bi-paperclip" aria-hidden="true" />
                          Pilih file
                        </span>
                        <span className="file-input-name">
                          {selectedFile
                            ? selectedFile.name
                            : "Tidak ada file dipilih"}
                        </span>
                      </label>
                    </div>

                    {staff && (
                      <div className="attach-visibility">
                        <label className="form-label" htmlFor="uploadVisibility">
                          Visibilitas
                        </label>
                        <select
                          id="uploadVisibility"
                          className="select select-sm"
                          value={uploadVisibility}
                          onChange={(event) =>
                            setUploadVisibility(event.target.value)
                          }
                        >
                          <option value="public">Publik</option>
                          <option value="internal">Internal</option>
                        </select>
                      </div>
                    )}

                    <button
                      className="btn btn-outline"
                      type="submit"
                      disabled={uploading}
                    >
                      {uploading ? (
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
                      <ul className="history-list">
                        {timeline.map((event) => (
                          <TimelineEvent key={event.id} event={event} />
                        ))}
                      </ul>
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
                        <div className="comment-body">{comment.body}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activityTab === "comments" && canComment ? (
                <>
                  {commentError && (
                    <div className="alert alert--error" style={{ marginTop: 16, marginBottom: 0 }}>
                      <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                      <div>{commentError}</div>
                    </div>
                  )}

                  <form className="composer" onSubmit={handleCommentSubmit}>
                    <label className="visually-hidden" htmlFor="comment">
                      Tambah komentar
                    </label>
                    <textarea
                      id="comment"
                      rows={4}
                      maxLength={5000}
                      placeholder={
                        staff
                          ? "Tulis pembaruan untuk requester atau catatan internal..."
                          : "Tulis pertanyaan atau informasi tambahan..."
                      }
                      value={commentBody}
                      onChange={(event) => setCommentBody(event.target.value)}
                    />
                    <div className="composer-bar">
                      <div className="composer-meta">
                        {staff ? (
                          <>
                            <label className="composer-note" htmlFor="visibility">
                              Visibilitas
                            </label>
                            <select
                              id="visibility"
                              className="select select-sm"
                              value={commentVisibility}
                              onChange={(event) =>
                                setCommentVisibility(event.target.value)
                              }
                            >
                              <option value="public">Publik</option>
                              <option value="internal">Internal</option>
                            </select>
                          </>
                        ) : (
                          <span className="composer-note">
                            Komentar Anda terlihat oleh tim IT.
                          </span>
                        )}
                      </div>

                      <div className="composer-actions">
                        <button
                          className="btn btn-primary"
                          type="submit"
                          disabled={submittingComment}
                        >
                          {submittingComment ? (
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

        <aside className="issue-side">
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
              <DetailField label="Kategori">
                {ticket.expand?.category?.name || "—"}
              </DetailField>
              <DetailField label="Requester">
                {ticket.expand?.requester?.name || "—"}
              </DetailField>
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
                  <div>{ticket.resolution_summary}</div>
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

          {approvalSteps.length > 0 && (
            <section className="panel">
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
                              ? "Salah satu IT Lead"
                              : step.kind === "cab"
                                ? "IT Lead lain (belum ditentukan)"
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

          <div className="callout callout--info">
            <i className="bi bi-shield-exclamation" aria-hidden="true" />
            <div>
              Tiket ini tidak boleh memuat identitas pasien. Jika Anda menemukan
              data pasien pada komentar atau lampiran, segera hubungi IT Lead.
            </div>
          </div>
        </aside>
      </div>

      {resolveOpen && (
        <Modal
          title="Selesaikan tiket"
          description={`${ticket.ticket_no} · ${ticket.title}`}
          onClose={closeResolve}
          footer={
            <>
              <button
                className="btn btn-subtle"
                type="button"
                onClick={closeResolve}
                disabled={Boolean(busyAction)}
              >
                Batal
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                form="resolve-form"
                disabled={Boolean(busyAction)}
              >
                {busyAction === "resolve" ? (
                  <span className="spinner" aria-hidden="true" />
                ) : (
                  <i className="bi bi-check2" aria-hidden="true" />
                )}
                Tandai selesai
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

          <form id="resolve-form" onSubmit={handleResolve}>
            <div className="modal-field">
              <label className="form-label" htmlFor="resolutionSummary">
                Ringkasan resolusi <span className="req">*</span>
              </label>
              <textarea
                id="resolutionSummary"
                className="textarea"
                rows={4}
                autoFocus
                minLength={10}
                maxLength={5000}
                placeholder="Jelaskan penyebab dan langkah perbaikan yang dilakukan..."
                value={resolutionSummary}
                onChange={(event) =>
                  setResolutionSummary(event.target.value)
                }
                required
              />
              <div className="char-count">
                <span>Terlihat pada riwayat tiket.</span>
                <span>{resolutionSummary.length}/5.000</span>
              </div>
            </div>

            <div className="modal-field">
              <label className="form-label" htmlFor="resolutionCode">
                Kode resolusi
              </label>
              <select
                id="resolutionCode"
                className="select"
                value={resolutionCode}
                onChange={(event) => setResolutionCode(event.target.value)}
              >
                {RESOLUTION_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </form>
        </Modal>
      )}

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
                    ? "IT Lead"
                    : item.role === "it_support"
                      ? "IT Support"
                      : "Staf"}
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
