import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PageHeader from "../../../components/ui/PageHeader";
import EmptyState from "../../../components/ui/EmptyState";
import RichTextEditor from "../../../components/ui/RichTextEditor";
import { pb } from "../../../lib/pocketbase";
import { getErrorMessage, updateProblem } from "../../../lib/api";
import { formErrorText, useAppForm } from "../../../lib/formik";
import { richTextLength } from "../../../lib/richText";
import { formatDateTime, formatRelative } from "../../../lib/format";

const STATUSES = [
  ["identified", "Teridentifikasi"],
  ["investigating", "Investigasi"],
  ["known_error", "Known error"],
  ["resolved", "Selesai"],
  ["closed", "Ditutup"],
];

const STATUS_LABELS = Object.fromEntries(STATUSES);

const STATUS_TONES = {
  identified: "lozenge--neutral",
  investigating: "status-in_progress",
  known_error: "status-reopened",
  resolved: "status-resolved",
  closed: "status-closed",
};

export default function ProblemDetailPage() {
  const { id } = useParams();
  const [problem, setProblem] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const initialValues = useMemo(
    () => ({
      title: problem?.title || "",
      description: problem?.description || "",
      status: problem?.status || "identified",
      root_cause: problem?.root_cause || "",
      workaround: problem?.workaround || "",
      permanent_fix: problem?.permanent_fix || "",
    }),
    [
      problem?.description,
      problem?.permanent_fix,
      problem?.root_cause,
      problem?.status,
      problem?.title,
      problem?.workaround,
    ]
  );

  const formik = useAppForm({
    enableReinitialize: true,
    initialValues,
    validate: (values) => {
      const errors = {};
      if (values.title.trim().length < 5) {
        errors.title = "Judul problem minimal 5 karakter.";
      }
      if (
        values.status === "known_error" &&
        (richTextLength(values.root_cause) === 0 ||
          richTextLength(values.workaround) === 0)
      ) {
        errors.root_cause =
          "Known error membutuhkan root cause dan workaround.";
      }
      if (
        values.status === "resolved" &&
        richTextLength(values.permanent_fix) === 0
      ) {
        errors.permanent_fix =
          "Problem selesai membutuhkan permanent fix.";
      }
      return errors;
    },
    onSubmit: async (values, helpers) => {
      helpers.setStatus("");
      setNotice("");

      try {
        await updateProblem(id, {
          title: values.title.trim(),
          description: values.description.trim(),
          status: values.status,
          root_cause: values.root_cause.trim(),
          workaround: values.workaround.trim(),
          permanent_fix: values.permanent_fix.trim(),
        });
        setNotice("Perubahan problem disimpan.");
        await load();
      } catch (err) {
        helpers.setStatus(getErrorMessage(err));
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  const formError = formErrorText(formik);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const record = await pb.collection("problems").getOne(id, {
        expand: "service,owner",
      });
      const [links, articleList] = await Promise.all([
        pb.collection("problem_tickets").getFullList({
          filter: `problem = "${id}"`,
          sort: "-created",
          expand: "ticket",
        }),
        pb.collection("knowledge_articles").getFullList({
          filter: `problem = "${id}"`,
          sort: "-updated",
        }),
      ]);

      setProblem(record);
      setTickets(links);
      setArticles(articleList);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    document.title = "Problem · Healthcare ITSM";
    load();
  }, [load]);



  if (loading) {
    return (
      <div className="list-panel">
        <div className="loading-state">
          <span className="spinner spinner--dark" role="status" />
          Memuat problem...
        </div>
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="list-panel">
        <EmptyState
          icon="bi-diagram-3"
          title="Problem tidak ditemukan"
          description={error || "Problem mungkin sudah dihapus atau bukan milik rumah sakit ini."}
          action={
            <Link className="btn btn-primary" to="/problems">
              Kembali ke daftar problem
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Problem", to: "/problems" },
          { label: problem.problem_no },
        ]}
        title={problem.title}
        description={`${problem.problem_no} · ${problem.expand?.service?.name || "Tanpa layanan"} · owner ${problem.expand?.owner?.name || "—"}`}
        actions={
          <Link className="btn btn-subtle" to="/problems">
            <i className="bi bi-arrow-left" aria-hidden="true" />
            Daftar problem
          </Link>
        }
      />

      <div className="problem-head-meta">
        <span className={`lozenge ${STATUS_TONES[problem.status] || ""}`}>
          {STATUS_LABELS[problem.status] || problem.status}
        </span>
        <span>Dibuat {formatDateTime(problem.created)}</span>
        <span>Diperbarui {formatRelative(problem.updated)}</span>
        {problem.resolved_at && <span>Selesai {formatDateTime(problem.resolved_at)}</span>}
      </div>

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

      <div className="detail-grid">
        <section className="panel">
          <div className="panel-head">
            <div className="panel-title">
              <i className="bi bi-search" aria-hidden="true" />
              Analisis problem
            </div>
          </div>
          <div className="panel-body">
            <form onSubmit={formik.handleSubmit}>
              {formError && (
                <div className="alert alert--error" role="alert">
                  <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                  <div>{formError}</div>
                </div>
              )}

              <div className="field-row">
                <label className="form-label" htmlFor="problem-title">
                  Judul
                </label>
                <input
                  id="problem-title"
                  className="input"
                  maxLength={160}
                  {...formik.getFieldProps("title")}
                  required
                />
              </div>

              <div className="field-row" style={{ marginTop: 16 }}>
                <label className="form-label" htmlFor="problem-description">
                  Deskripsi
                </label>
                <RichTextEditor
                  id="problem-description"
                  value={formik.values.description}
                  onChange={(html) => formik.setFieldValue("description", html)}
                  onBlur={() => formik.setFieldTouched("description", true)}
                  rows={4}
                  maxLength={10000}
                />
              </div>

              <div className="field-row" style={{ marginTop: 16 }}>
                <label className="form-label" htmlFor="problem-status">
                  Status
                </label>
                <select
                  id="problem-status"
                  className="select"
                  {...formik.getFieldProps("status")}
                >
                  {STATUSES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field-row" style={{ marginTop: 16 }}>
                <label className="form-label" htmlFor="problem-root">
                  Root cause
                </label>
                <RichTextEditor
                  id="problem-root"
                  value={formik.values.root_cause}
                  onChange={(html) => formik.setFieldValue("root_cause", html)}
                  onBlur={() => formik.setFieldTouched("root_cause", true)}
                  placeholder="Penyebab mendasar yang sudah diverifikasi."
                  rows={4}
                  maxLength={10000}
                />
              </div>

              <div className="field-row" style={{ marginTop: 16 }}>
                <label className="form-label" htmlFor="problem-workaround">
                  Workaround
                </label>
                <RichTextEditor
                  id="problem-workaround"
                  value={formik.values.workaround}
                  onChange={(html) => formik.setFieldValue("workaround", html)}
                  onBlur={() => formik.setFieldTouched("workaround", true)}
                  placeholder="Langkah sementara agar layanan bisa dipakai."
                  rows={4}
                  maxLength={10000}
                />
                <div className="hint">
                  Wajib saat status menjadi known error. Workaround tampil pada
                  saran artikel di form intake.
                </div>
              </div>

              <div className="field-row" style={{ marginTop: 16 }}>
                <label className="form-label" htmlFor="problem-fix">
                  Permanent fix
                </label>
                <RichTextEditor
                  id="problem-fix"
                  value={formik.values.permanent_fix}
                  onChange={(html) => formik.setFieldValue("permanent_fix", html)}
                  onBlur={() => formik.setFieldTouched("permanent_fix", true)}
                  placeholder="Perbaikan permanen atau perubahan yang menutup problem."
                  rows={4}
                  maxLength={10000}
                />
              </div>

              <div className="form-actions">
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={formik.isSubmitting}
                >
                  {formik.isSubmitting ? "Menyimpan..." : "Simpan problem"}
                </button>
              </div>
            </form>
          </div>
        </section>

        <aside className="detail-side">
          <section className="panel">
            <div className="panel-head">
              <div className="panel-title">
                <i className="bi bi-ticket-detailed" aria-hidden="true" />
                Tiket terkait
              </div>
              <span className="panel-count">{tickets.length}</span>
            </div>
            <div className="panel-body">
              {tickets.length === 0 ? (
                <div className="report-empty">Belum ada tiket terkait.</div>
              ) : (
                <ul className="problem-ticket-list">
                  {tickets.map((link) => (
                    <li key={link.id}>
                      <Link to={`/tickets/${link.ticket}`}>
                        <span className="issue-key">{link.expand?.ticket?.ticket_no}</span>
                        <span>{link.expand?.ticket?.title || "Tiket"}</span>
                      </Link>
                      <span className="problem-relation">
                        {link.relation === "duplicate"
                          ? "duplikat"
                          : link.relation === "related"
                            ? "terkait"
                            : "penyebab"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div className="panel-title">
                <i className="bi bi-journal-text" aria-hidden="true" />
                Artikel pengetahuan
              </div>
              <Link
                className="btn btn-subtle btn-sm"
                to={`/knowledge?problem=${problem.id}`}
              >
                Tulis artikel
              </Link>
            </div>
            <div className="panel-body">
              {articles.length === 0 ? (
                <div className="report-empty">
                  Belum ada artikel yang ditautkan ke problem ini.
                </div>
              ) : (
                <ul className="problem-ticket-list">
                  {articles.map((article) => (
                    <li key={article.id}>
                      <Link to={`/knowledge/${article.id}`}>{article.title}</Link>
                      <span className="problem-relation">
                        {article.status === "published" ? "terbit" : article.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
