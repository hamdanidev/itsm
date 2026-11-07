import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PageHeader from "../../../components/ui/PageHeader";
import EmptyState from "../../../components/ui/EmptyState";
import Modal from "../../../components/ui/Modal";
import RichText from "../../../components/ui/RichText";
import RichTextEditor from "../../../components/ui/RichTextEditor";
import { pb } from "../../../lib/pocketbase";
import {
  getErrorMessage,
  publishKnowledge,
  updateKnowledge,
} from "../../../lib/api";
import { useAuth } from "../../../app/providers/AuthProvider";
import { isLead, isStaff } from "../../../lib/permissions";
import { formErrorText, useAppForm } from "../../../lib/formik";
import { richTextLength } from "../../../lib/richText";
import { formatDateTime, formatRelative } from "../../../lib/format";

const STATUS_LABELS = {
  draft: "Draft",
  review: "Review",
  published: "Terbit",
  retired: "Pensiun",
};

const STATUS_TONES = {
  draft: "lozenge--neutral",
  review: "status-in_progress",
  published: "status-resolved",
  retired: "status-closed",
};

export default function KnowledgeDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const staff = isStaff(user);
  const lead = isLead(user);

  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editOpen, setEditOpen] = useState(false);

  const initialValues = useMemo(
    () => ({
      title: article?.title || "",
      body: article?.body || "",
      visibility: article?.visibility || "internal",
      tags: article?.tags || "",
    }),
    [article?.body, article?.tags, article?.title, article?.visibility]
  );

  const formik = useAppForm({
    enableReinitialize: true,
    initialValues,
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
        await updateKnowledge(id, {
          title: values.title.trim(),
          body: values.body.trim(),
          visibility: values.visibility,
          tags: values.tags.trim(),
        });
        setEditOpen(false);
        setNotice("Artikel diperbarui.");
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
      const record = await pb.collection("knowledge_articles").getOne(id, {
        expand: "service,problem,author,reviewer",
      });
      setArticle(record);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    document.title = "Artikel · Healthcare ITSM";
    load();
  }, [load]);

  async function changeStatus(status) {
    setError("");
    setNotice("");

    try {
      await publishKnowledge(id, status);
      setNotice(
        status === "published"
          ? "Artikel diterbitkan."
          : "Artikel dipensiunkan."
      );
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function submitReview() {
    setError("");
    setNotice("");

    try {
      await updateKnowledge(id, { status: "review" });
      setNotice("Artikel diajukan untuk review Kepala IT.");
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  if (loading) {
    return (
      <div className="list-panel">
        <div className="loading-state">
          <span className="spinner spinner--dark" role="status" />
          Memuat artikel...
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="list-panel">
        <EmptyState
          icon="bi-journal-text"
          title="Artikel tidak ditemukan"
          description={error || "Artikel belum dipublikasikan atau bukan untuk peran Anda."}
          action={
            <Link className="btn btn-primary" to="/knowledge">
              Kembali ke pengetahuan
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
          { label: "Pengetahuan", to: "/knowledge" },
          { label: article.title },
        ]}
        title={article.title}
        description={`${STATUS_LABELS[article.status] || article.status} · ${
          article.visibility === "public" ? "Publik" : "Internal IT"
        }${article.expand?.service?.name ? ` · ${article.expand.service.name}` : ""}`}
        actions={
          <Link className="btn btn-subtle" to="/knowledge">
            <i className="bi bi-arrow-left" aria-hidden="true" />
            Daftar artikel
          </Link>
        }
      />

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
        <article className="panel knowledge-article">
          <div className="panel-head">
            <div className="panel-title">
              <i className="bi bi-journal-text" aria-hidden="true" />
              Artikel
            </div>
            <span className={`lozenge ${STATUS_TONES[article.status] || ""}`}>
              {STATUS_LABELS[article.status] || article.status}
            </span>
          </div>
          <div className="panel-body">
            <RichText value={article.body} className="knowledge-body" />
          </div>
        </article>

        <aside className="detail-side">
          <section className="panel">
            <div className="panel-head">
              <div className="panel-title">Informasi</div>
            </div>
            <div className="panel-body">
              <dl className="summary-list">
                <div className="summary-row">
                  <dt>Status</dt>
                  <dd>{STATUS_LABELS[article.status] || article.status}</dd>
                </div>
                <div className="summary-row">
                  <dt>Visibilitas</dt>
                  <dd>{article.visibility === "public" ? "Publik" : "Internal IT"}</dd>
                </div>
                <div className="summary-row">
                  <dt>Layanan</dt>
                  <dd>{article.expand?.service?.name || "—"}</dd>
                </div>
                {article.expand?.problem && (
                  <div className="summary-row">
                    <dt>Problem</dt>
                    <dd>
                      <Link to={`/problems/${article.problem}`}>
                        {article.expand.problem.problem_no}
                      </Link>
                    </dd>
                  </div>
                )}
                <div className="summary-row">
                  <dt>Penulis</dt>
                  <dd>{article.expand?.author?.name || "—"}</dd>
                </div>
                <div className="summary-row">
                  <dt>Reviewer</dt>
                  <dd>{article.expand?.reviewer?.name || "—"}</dd>
                </div>
                <div className="summary-row">
                  <dt>Diperbarui</dt>
                  <dd title={formatDateTime(article.updated)}>
                    {formatRelative(article.updated)}
                  </dd>
                </div>
                {article.published_at && (
                  <div className="summary-row">
                    <dt>Terbit</dt>
                    <dd>{formatDateTime(article.published_at)}</dd>
                  </div>
                )}
              </dl>

              {article.tags && (
                <div className="knowledge-detail-tags">
                  {article.tags.split(",").map((tag) => (
                    <span key={tag.trim()} className="tag-chip">
                      {tag.trim()}
                    </span>
                  ))}
                </div>
              )}

              {staff && (
                <div className="knowledge-actions">
                  <button
                    className="btn btn-outline btn-sm"
                    type="button"
                    onClick={() => {
                      formik.setStatus("");
                      formik.resetForm();
                      setEditOpen(true);
                    }}
                  >
                    <i className="bi bi-pencil" aria-hidden="true" />
                    Edit
                  </button>

                  {article.status === "draft" && (
                    <button
                      className="btn btn-outline btn-sm"
                      type="button"
                      onClick={submitReview}
                    >
                      Ajukan review
                    </button>
                  )}

                  {lead &&
                    ["draft", "review"].includes(article.status) && (
                      <button
                        className="btn btn-primary btn-sm"
                        type="button"
                        onClick={() => changeStatus("published")}
                      >
                        <i className="bi bi-send" aria-hidden="true" />
                        Publikasikan
                      </button>
                    )}

                  {lead && article.status === "published" && (
                    <button
                      className="btn btn-outline-danger btn-sm"
                      type="button"
                      onClick={() => changeStatus("retired")}
                    >
                      Pensiunkan
                    </button>
                  )}
                </div>
              )}

              {!staff && (
                <div className="hint" style={{ marginTop: 12 }}>
                  Artikel ini bersifat publik. Hubungi IT jika ada langkah yang
                  tidak sesuai.
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>

      {editOpen && (
        <Modal
          title="Edit artikel"
          description="Perubahan berlaku langsung. Artikel yang sudah terbit tetap dapat diedit."
          onClose={() => {
            if (!formik.isSubmitting) setEditOpen(false);
          }}
          wide
          footer={
            <>
              <button
                className="btn btn-subtle"
                type="button"
                onClick={() => setEditOpen(false)}
                disabled={formik.isSubmitting}
              >
                Batal
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                form="knowledge-edit-form"
                disabled={formik.isSubmitting}
              >
                {formik.isSubmitting ? "Menyimpan..." : "Simpan"}
              </button>
            </>
          }
        >
          <form id="knowledge-edit-form" onSubmit={formik.handleSubmit}>
            {formError && (
              <div className="alert alert--error" role="alert">
                <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                <div>{formError}</div>
              </div>
            )}

            <div className="field-row">
              <label className="form-label" htmlFor="knowledge-edit-title">
                Judul
              </label>
              <input
                id="knowledge-edit-title"
                className="input"
                maxLength={160}
                {...formik.getFieldProps("title")}
                required
              />
            </div>

            <div className="field-row" style={{ marginTop: 16 }}>
              <label className="form-label" htmlFor="knowledge-edit-body">
                Isi artikel
              </label>
              <RichTextEditor
                id="knowledge-edit-body"
                value={formik.values.body}
                onChange={(html) => formik.setFieldValue("body", html)}
                onBlur={() => formik.setFieldTouched("body", true)}
                rows={12}
                maxLength={30000}
              />
            </div>

            <div className="form-grid" style={{ marginTop: 16 }}>
              <div>
                <label className="form-label" htmlFor="knowledge-edit-visibility">
                  Visibilitas
                </label>
                <select
                  id="knowledge-edit-visibility"
                  className="select"
                  {...formik.getFieldProps("visibility")}
                >
                  <option value="internal">Internal IT</option>
                  <option value="public">Publik untuk pengguna</option>
                </select>
              </div>

              <div>
                <label className="form-label" htmlFor="knowledge-edit-tags">
                  Tag
                </label>
                <input
                  id="knowledge-edit-tags"
                  className="input"
                  maxLength={500}
                  {...formik.getFieldProps("tags")}
                />
              </div>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
