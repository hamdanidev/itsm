import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { pb } from "../../../lib/pocketbase";
import {
  createComment,
  getAttachmentUrl,
  getErrorMessage,
  uploadAttachment,
} from "../../../lib/api";
import {
  approvalLabel,
  formatDateTime,
  formatRelative,
  impactLabel,
  initials,
  isOpen,
  typeLabel,
} from "../../../lib/format";
import { isStaff } from "../../../lib/permissions";
import { useAuth } from "../../../app/providers/AuthProvider";
import {
  PriorityBadge,
  SlaPill,
  StatusBadge,
  TypeBadge,
} from "../components/Badges";

function DetailRow({ label, children }) {
  return (
    <div className="detail-row">
      <div className="detail-label">{label}</div>
      <div className="detail-value">{children || "—"}</div>
    </div>
  );
}

function AttachmentItem({ attachment, onDownload, downloading }) {
  const isInternal = attachment.visibility === "internal";

  return (
    <div className="attachment-item">
      <div className="attachment-icon">
        <i className="bi bi-file-earmark-text" />
      </div>
      <div className="flex-grow-1 min-w-0">
        <div className="fw-medium text-truncate">
          {attachment.original_name || attachment.file}
        </div>
        <div className="small text-secondary">
          {attachment.expand?.uploader?.name || "—"} ·{" "}
          {formatDateTime(attachment.created)}
          {isInternal && (
            <span className="badge text-bg-warning ms-2">Internal</span>
          )}
        </div>
      </div>
      <button
        className="btn btn-sm btn-outline-secondary"
        type="button"
        onClick={() => onDownload(attachment)}
        disabled={downloading === attachment.id}
        title="Unduh lampiran"
      >
        {downloading === attachment.id ? (
          <span className="spinner-border spinner-border-sm" />
        ) : (
          <i className="bi bi-download" />
        )}
      </button>
    </div>
  );
}

export default function TicketDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const staff = isStaff(user);
  const fileInputRef = useRef(null);

  const [ticket, setTicket] = useState(null);
  const [comments, setComments] = useState([]);
  const [attachments, setAttachments] = useState([]);
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

  const loadData = useCallback(async () => {
    setError("");
    try {
      const [ticketRecord, commentList, attachmentList] = await Promise.all([
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
      ]);

      setTicket(ticketRecord);
      setComments(commentList);
      setAttachments(attachmentList);
      document.title = `${ticketRecord.ticket_no} · Healthcare ITSM`;
    } catch (err) {
      setError(getErrorMessage(err));
      setTicket(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

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
      await loadData();
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
      await loadData();
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

  if (loading) {
    return (
      <div className="py-5 text-center">
        <div className="spinner-border text-primary" role="status" />
        <div className="small text-secondary mt-2">Memuat tiket...</div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="card border-0 shadow-sm">
        <div className="card-body p-5 text-center">
          <div className="display-6 text-danger mb-3">
            <i className="bi bi-exclamation-triangle" />
          </div>
          <h1 className="h4">Tiket tidak dapat dibuka</h1>
          <p className="text-secondary">
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

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
        <div>
          <Link
            className="small text-decoration-none text-secondary d-inline-flex align-items-center gap-1 mb-2"
            to="/tickets"
          >
            <i className="bi bi-arrow-left" />
            Kembali ke daftar tiket
          </Link>
          <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
            <span className="ticket-no">{ticket.ticket_no}</span>
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} compact />
            <TypeBadge type={ticket.type} />
          </div>
          <h1 className="h3 fw-bold mb-1">{ticket.title}</h1>
          <div className="text-secondary small">
            Dibuat oleh {ticket.expand?.requester?.name || "—"} ·{" "}
            {formatDateTime(ticket.created)} WIB
          </div>
        </div>
        <div className="d-flex flex-column align-items-end gap-2">
          <SlaPill
            label="Respon"
            dueAt={ticket.response_due_at}
            breached={ticket.response_breach_at}
            active={active}
          />
          <SlaPill
            label="Selesai"
            dueAt={ticket.resolution_due_at}
            breached={ticket.resolution_breach_at}
            active={active}
          />
        </div>
      </div>

      <div className="row g-4">
        <div className="col-12 col-xl-8">
          <div className="card border-0 shadow-sm mb-4">
            <div className="card-body p-4">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <h2 className="h6 text-uppercase text-secondary fw-bold letter-spacing mb-0">
                  Deskripsi
                </h2>
                <span className="small text-secondary">
                  <i className="bi bi-shield-check text-success me-1" />
                  Attestasi tanpa data pasien
                </span>
              </div>
              <div className="ticket-description">{ticket.description}</div>
            </div>
          </div>

          {ticket.type === "change_request" && (
            <div className="card border-0 shadow-sm mb-4">
              <div className="card-body p-4">
                <h2 className="h6 text-uppercase text-secondary fw-bold letter-spacing mb-3">
                  Rencana perubahan
                </h2>
                <div className="row g-3">
                  <div className="col-12 col-md-4">
                    <div className="mini-label">Risiko</div>
                    <div className="fw-medium">
                      {ticket.change_risk || "Belum ditentukan"}
                    </div>
                  </div>
                  <div className="col-12 col-md-4">
                    <div className="mini-label">Jadwal mulai</div>
                    <div className="fw-medium">
                      {formatDateTime(ticket.planned_start)}
                    </div>
                  </div>
                  <div className="col-12 col-md-4">
                    <div className="mini-label">Jadwal selesai</div>
                    <div className="fw-medium">
                      {formatDateTime(ticket.planned_end)}
                    </div>
                  </div>
                  <div className="col-12 col-md-6">
                    <div className="mini-label">Rencana implementasi</div>
                    <div className="pre-wrap small">
                      {ticket.implementation_plan || "Belum diisi"}
                    </div>
                  </div>
                  <div className="col-12 col-md-6">
                    <div className="mini-label">Rollback plan</div>
                    <div className="pre-wrap small">
                      {ticket.rollback_plan || "Belum diisi"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="card border-0 shadow-sm mb-4">
            <div className="card-body p-4">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h2 className="h6 text-uppercase text-secondary fw-bold letter-spacing mb-0">
                  Lampiran
                </h2>
                <span className="small text-secondary">
                  {attachments.length}/3
                </span>
              </div>

              {attachments.length === 0 ? (
                <div className="text-secondary small py-2">
                  <i className="bi bi-paperclip me-1" />
                  Belum ada lampiran.
                </div>
              ) : (
                <div className="d-grid gap-2">
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
                <form className="mt-4 border-top pt-3" onSubmit={handleUpload}>
                  {uploadError && (
                    <div className="alert alert-danger py-2 small">
                      {uploadError}
                    </div>
                  )}
                  <div className="row g-2 align-items-end">
                    <div className="col-12 col-md-6">
                      <label className="form-label small fw-semibold">
                        Tambah lampiran
                      </label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="form-control form-control-sm"
                        accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.log"
                        onChange={(event) =>
                          setSelectedFile(event.target.files?.[0] || null)
                        }
                      />
                    </div>
                    {staff && (
                      <div className="col-6 col-md-3">
                        <label className="form-label small fw-semibold">
                          Visibilitas
                        </label>
                        <select
                          className="form-select form-select-sm"
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
                    <div className="col-6 col-md-3">
                      <button
                        className="btn btn-outline-primary btn-sm w-100"
                        type="submit"
                        disabled={uploading}
                      >
                        {uploading ? (
                          <span className="spinner-border spinner-border-sm" />
                        ) : (
                          <>
                            <i className="bi bi-upload me-1" />
                            Unggah
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="form-text">
                    PDF, PNG, JPEG, WebP, TXT, atau LOG. Maksimal 10 MB.
                  </div>
                </form>
              )}

              {!canUpload && canComment && (
                <div className="alert alert-light border small mt-3 mb-0">
                  Batas 3 lampiran per tiket sudah tercapai.
                </div>
              )}
            </div>
          </div>

          <div className="card border-0 shadow-sm">
            <div className="card-body p-4">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h2 className="h6 text-uppercase text-secondary fw-bold letter-spacing mb-0">
                  Komentar & riwayat
                </h2>
                <span className="small text-secondary">
                  {comments.length} komentar
                </span>
              </div>

              {comments.length === 0 ? (
                <div className="text-secondary small py-2">
                  Belum ada komentar.
                </div>
              ) : (
                <div className="comment-list">
                  {comments.map((comment) => (
                    <div
                      key={comment.id}
                      className={`comment-item ${
                        comment.visibility === "internal"
                          ? "comment-internal"
                          : ""
                      }`}
                    >
                      <div className="avatar-circle avatar-sm flex-shrink-0">
                        {initials(comment.expand?.author?.name)}
                      </div>
                      <div className="flex-grow-1 min-w-0">
                        <div className="d-flex flex-wrap align-items-center gap-2">
                          <span className="fw-semibold small">
                            {comment.expand?.author?.name || "—"}
                          </span>
                          {comment.visibility === "internal" && (
                            <span className="badge text-bg-warning">
                              Internal
                            </span>
                          )}
                          <span className="small text-secondary">
                            {formatRelative(comment.created)}
                          </span>
                        </div>
                        <div className="comment-body">{comment.body}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {canComment ? (
                <form
                  className="mt-4 border-top pt-3"
                  onSubmit={handleCommentSubmit}
                >
                  {commentError && (
                    <div className="alert alert-danger py-2 small">
                      {commentError}
                    </div>
                  )}
                  <label className="form-label fw-semibold" htmlFor="comment">
                    Tambah komentar
                  </label>
                  <textarea
                    id="comment"
                    className="form-control"
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
                  <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-2">
                    <div className="d-flex align-items-center gap-2">
                      {staff ? (
                        <>
                          <label className="small text-secondary" htmlFor="visibility">
                            Visibilitas
                          </label>
                          <select
                            id="visibility"
                            className="form-select form-select-sm"
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
                        <span className="small text-secondary">
                          Komentar Anda terlihat oleh tim IT.
                        </span>
                      )}
                    </div>
                    <button
                      className="btn btn-primary"
                      type="submit"
                      disabled={submittingComment}
                    >
                      {submittingComment ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" />
                          Mengirim...
                        </>
                      ) : (
                        <>
                          <i className="bi bi-send me-2" />
                          Kirim komentar
                        </>
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="alert alert-light border small mt-4 mb-0">
                  <i className="bi bi-lock me-1" />
                  Tiket sudah ditutup. Komentar baru tidak dapat ditambahkan.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-12 col-xl-4">
          <div className="card border-0 shadow-sm mb-4">
            <div className="card-body p-4">
              <h2 className="h6 fw-bold mb-3">
                <i className="bi bi-info-circle text-primary me-2" />
                Detail tiket
              </h2>

              <DetailRow label="Status">
                <StatusBadge status={ticket.status} />
              </DetailRow>
              <DetailRow label="Prioritas">
                <PriorityBadge priority={ticket.priority} compact />
              </DetailRow>
              <DetailRow label="Dampak">
                {impactLabel(ticket.impact)}
              </DetailRow>
              <DetailRow label="Jenis">{typeLabel(ticket.type)}</DetailRow>
              <DetailRow label="Unit">
                {ticket.expand?.unit?.name || "—"}
              </DetailRow>
              <DetailRow label="Kategori">
                {ticket.expand?.category?.name || "—"}
              </DetailRow>
              <DetailRow label="Requester">
                {ticket.expand?.requester?.name || "—"}
              </DetailRow>
              <DetailRow label="Assignee">
                {ticket.expand?.assignee?.name || (
                  <span className="text-secondary">Belum di-assign</span>
                )}
              </DetailRow>
              <DetailRow label="Approval">
                <span
                  className={`badge ${
                    ticket.approval_status === "approved"
                      ? "text-bg-success"
                      : ticket.approval_status === "pending"
                        ? "text-bg-warning"
                        : ticket.approval_status === "rejected"
                          ? "text-bg-danger"
                          : "text-bg-light"
                  }`}
                >
                  {approvalLabel(ticket.approval_status)}
                </span>
              </DetailRow>
              <DetailRow label="Dibuat">
                {formatDateTime(ticket.created)}
              </DetailRow>
              <DetailRow label="Aktivitas terakhir">
                {formatDateTime(ticket.last_activity_at)}
              </DetailRow>
            </div>
          </div>

          <div className="card border-0 shadow-sm mb-4">
            <div className="card-body p-4">
              <h2 className="h6 fw-bold mb-3">
                <i className="bi bi-stopwatch text-primary me-2" />
                SLA
              </h2>
              <div className="d-grid gap-2">
                <SlaPill
                  label="Batas respons"
                  dueAt={ticket.response_due_at}
                  breached={ticket.response_breach_at}
                  active={active}
                />
                {ticket.approval_due_at && (
                  <SlaPill
                    label="Batas approval"
                    dueAt={ticket.approval_due_at}
                    breached={ticket.approval_breach_at}
                    active={active}
                  />
                )}
                {ticket.resolution_due_at && (
                  <SlaPill
                    label="Batas selesai"
                    dueAt={ticket.resolution_due_at}
                    breached={ticket.resolution_breach_at}
                    active={active}
                  />
                )}
              </div>
              {ticket.first_response_at ? (
                <div className="small text-success mt-3">
                  <i className="bi bi-check2-circle me-1" />
                  Respons pertama: {formatDateTime(ticket.first_response_at)}
                </div>
              ) : (
                <div className="small text-secondary mt-3">
                  <i className="bi bi-hourglass me-1" />
                  Belum ada respons publik dari tim IT.
                </div>
              )}
            </div>
          </div>

          <div className="card border-0 shadow-sm">
            <div className="card-body p-4">
              <h2 className="h6 fw-bold mb-2">
                <i className="bi bi-shield-exclamation text-primary me-2" />
                Pengingat privasi
              </h2>
              <p className="small text-secondary mb-0">
                Tiket ini tidak boleh memuat identitas pasien. Jika Anda
                menemukan data pasien pada komentar atau lampiran, segera
                hubungi IT Lead untuk penanganan.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
