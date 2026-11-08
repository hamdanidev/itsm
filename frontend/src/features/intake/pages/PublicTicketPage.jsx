import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import BrandMark from "../../../components/ui/BrandMark";
import RichText from "../../../components/ui/RichText";
import {
  fetchPublicTicket,
  getErrorMessage,
  submitPublicTicketCsat,
} from "../../../lib/api";
import {
  formatDateTime,
  impactLabel,
  priorityLabel,
  typeLabel,
} from "../../../lib/format";
import { teamLabel } from "../../../lib/teams";

const STATUS_LABELS = {
  open: "Diterima",
  assigned: "Diterima",
  in_progress: "Sedang dikerjakan",
  waiting: "Menunggu informasi",
  resolved: "Selesai",
  closed: "Ditutup",
  reopened: "Dibuka kembali",
};

const STATUS_HINTS = {
  open: "Laporan sudah masuk antrean tim IT.",
  assigned: "Tiket sudah ditugaskan ke tim IT.",
  in_progress: "Tim IT sedang mengerjakan tiket ini.",
  waiting: "Tim IT menunggu informasi tambahan.",
  resolved: "Pekerjaan selesai. Beri penilaian bila sudah sesuai.",
  closed: "Tiket sudah ditutup.",
  reopened: "Tiket dibuka kembali dan sedang ditangani.",
};

function statusText(status) {
  return STATUS_LABELS[status] || status || "—";
}

function statusHint(status) {
  return STATUS_HINTS[status] || "";
}

export default function PublicTicketPage() {
  const { token } = useParams();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState("");
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [csatError, setCsatError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setFatal("");

      try {
        const result = await fetchPublicTicket(token);
        if (!active) return;

        setData(result);
        document.title = `Status ${result.ticket?.ticket_no || "tiket"} · ${
          result.tenant?.name || "Rumah Sakit"
        }`;
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

  const ticket = data?.ticket || null;
  const updates = data?.updates || [];
  const csat = data?.csat || null;
  const canSubmitCsat = Boolean(data?.can_submit_csat);

  const sortedUpdates = useMemo(
    () =>
      [...updates].sort((a, b) =>
        String(a.created || "").localeCompare(String(b.created || ""))
      ),
    [updates]
  );

  async function submitCsat(event) {
    event.preventDefault();

    if (!score) {
      setCsatError("Pilih skor 1–5 terlebih dahulu.");
      return;
    }

    setSubmitting(true);
    setCsatError("");

    try {
      const result = await submitPublicTicketCsat(token, {
        score,
        comment: comment.trim(),
      });

      setData((current) => ({
        ...current,
        csat: result,
        can_submit_csat: false,
      }));
    } catch (err) {
      setCsatError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="public-intake">
      <header className="public-intake-head">
        <div className="public-intake-brand">
          {data?.tenant?.logo_url ? (
            <img
              className="public-intake-logo"
              src={data.tenant.logo_url}
              alt={`Logo ${data.tenant?.name || "rumah sakit"}`}
            />
          ) : (
            <BrandMark size={44} />
          )}
          <div>
            <div className="public-intake-tenant">
              {data?.tenant?.name || "Rumah Sakit"}
            </div>
            <div className="public-intake-title">Status tiket</div>
          </div>
        </div>
      </header>

      <main className="public-intake-card public-ticket-card">
        {loading ? (
          <div className="public-ticket-skeleton" aria-label="Memuat status tiket">
            <div className="public-ticket-skeleton-line" />
            <div className="public-ticket-skeleton-line public-ticket-skeleton-line--title" />
            <div className="public-ticket-skeleton-block" />
          </div>
        ) : fatal ? (
          <section className="public-success">
            <div className="public-success-icon public-success-icon--warn">
              <i className="bi bi-link-45deg" aria-hidden="true" />
            </div>
            <h1 className="public-success-title">Tautan tidak berlaku</h1>
            <p className="muted">{fatal}</p>
            <p className="muted">
              Periksa kembali tautan dari layar sukses atau email konfirmasi.
              Bila masih bermasalah, hubungi tim IT rumah sakit.
            </p>
          </section>
        ) : ticket ? (
          <>
            <div className="public-ticket-head">
              <span
                className={`public-status public-status--${ticket.status}`}
              >
                <i className="bi bi-circle-fill" aria-hidden="true" />
                {statusText(ticket.status)}
              </span>
              <span className="public-ticket-number">{ticket.ticket_no}</span>
            </div>

            <h1 className="public-ticket-title">{ticket.title}</h1>
            <p className="public-ticket-hint">
              {csat
                ? "Pekerjaan selesai. Terima kasih atas penilaian Anda."
                : statusHint(ticket.status)}
            </p>

            <dl className="public-ticket-meta">
              <div>
                <dt>Jenis</dt>
                <dd>{typeLabel(ticket.type)}</dd>
              </div>
              <div>
                <dt>Prioritas</dt>
                <dd>{priorityLabel(ticket.priority)}</dd>
              </div>
              <div>
                <dt>Dampak</dt>
                <dd>{impactLabel(ticket.impact)}</dd>
              </div>
              <div>
                <dt>Tim tujuan</dt>
                <dd>
                  {ticket.team ? teamLabel(ticket.team) : "Tim IT rumah sakit"}
                </dd>
              </div>
              {ticket.service_name && (
                <div>
                  <dt>Layanan</dt>
                  <dd>{ticket.service_name}</dd>
                </div>
              )}
              {ticket.location && (
                <div>
                  <dt>Lokasi</dt>
                  <dd>{ticket.location}</dd>
                </div>
              )}
              <div>
                <dt>Dibuat</dt>
                <dd>{formatDateTime(ticket.created)}</dd>
              </div>
              {ticket.resolution_due_at && (
                <div>
                  <dt>Target selesai</dt>
                  <dd>{formatDateTime(ticket.resolution_due_at)}</dd>
                </div>
              )}
            </dl>

            {ticket.resolution_summary && (
              <section className="public-resolution">
                <div className="public-resolution-title">
                  <i className="bi bi-check-circle" aria-hidden="true" />
                  Ringkasan penyelesaian
                </div>
                <p>{ticket.resolution_summary}</p>
              </section>
            )}

            <section className="public-updates">
              <div className="public-section-title">Perkembangan</div>

              {sortedUpdates.length === 0 ? (
                <p className="muted">Belum ada pembaruan publik.</p>
              ) : (
                <ul className="public-update-list">
                  {sortedUpdates.map((update, index) => {
                    if (update.type === "comment") {
                      return (
                        <li
                          key={`comment-${index}`}
                          className="public-update public-update--comment"
                        >
                          <div className="public-update-head">
                            <span>
                              <i
                                className="bi bi-chat-left-text"
                                aria-hidden="true"
                              />
                              {update.author || "Tim IT"}
                            </span>
                            <time>{formatDateTime(update.created)}</time>
                          </div>
                          <RichText value={update.body} />
                        </li>
                      );
                    }

                    const label =
                      update.type === "created"
                        ? "Laporan diterima"
                        : update.status_from
                        ? `${statusText(update.status_from)} → ${statusText(
                            update.status_to
                          )}`
                        : statusText(update.status_to);

                    return (
                      <li
                        key={`status-${index}`}
                        className="public-update public-update--status"
                      >
                        <i className="bi bi-arrow-repeat" aria-hidden="true" />
                        <div>
                          <strong>{label}</strong>
                          <time>{formatDateTime(update.created)}</time>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {(csat || canSubmitCsat) && (
              <section className="public-csat">
                <div className="public-section-title">
                  Bagaimana penanganan tiket ini?
                </div>

                {csat ? (
                  <div className="public-csat-thanks">
                    <div
                      className="public-csat-stars"
                      aria-label={`Skor ${csat.score} dari 5`}
                    >
                      {[1, 2, 3, 4, 5].map((value) => (
                        <i
                          key={value}
                          className={`bi ${
                            value <= csat.score ? "bi-star-fill" : "bi-star"
                          }`}
                          aria-hidden="true"
                        />
                      ))}
                      <strong>{csat.score}/5</strong>
                    </div>
                    <p className="muted">
                      Terima kasih, penilaian Anda sudah kami terima.
                    </p>
                    {csat.comment && (
                      <div className="public-csat-comment">{csat.comment}</div>
                    )}
                  </div>
                ) : (
                  <form onSubmit={submitCsat}>
                    <p className="public-section-hint">
                      Penilaian membantu tim IT memperbaiki layanan. Satu
                      penilaian per tiket; jangan cantumkan data pasien.
                    </p>

                    <div
                      className="public-csat-stars public-csat-stars--input"
                      role="radiogroup"
                      aria-label="Skor penilaian"
                    >
                      {[1, 2, 3, 4, 5].map((value) => (
                        <button
                          key={value}
                          type="button"
                          className={`public-csat-star${
                            score >= value ? " is-on" : ""
                          }`}
                          onClick={() => {
                            setScore(value);
                            setCsatError("");
                          }}
                          aria-label={`${value} dari 5`}
                          aria-pressed={score === value}
                        >
                          <i className="bi bi-star-fill" aria-hidden="true" />
                        </button>
                      ))}
                    </div>

                    <label className="form-label" htmlFor="public-csat-comment">
                      Catatan (opsional)
                    </label>
                    <textarea
                      id="public-csat-comment"
                      className="form-input"
                      rows={3}
                      maxLength={2000}
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      placeholder="Apa yang sudah baik, atau apa yang perlu diperbaiki?"
                    />

                    {csatError && (
                      <div className="alert alert--error">{csatError}</div>
                    )}

                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={submitting}
                    >
                      {submitting ? "Mengirim..." : "Kirim penilaian"}
                    </button>
                  </form>
                )}
              </section>
            )}
          </>
        ) : null}
      </main>

      <footer className="public-intake-foot">
        <span>
          <i className="bi bi-shield-lock" aria-hidden="true" />
          Tautan ini hanya untuk tiket tersebut. Jangan dibagikan.
        </span>
        <span>Healthcare ITSM</span>
      </footer>
    </div>
  );
}
