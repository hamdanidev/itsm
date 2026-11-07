import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import PageHeader from "../../../components/ui/PageHeader";
import EmptyState from "../../../components/ui/EmptyState";
import Modal from "../../../components/ui/Modal";
import Pagination from "../../../components/ui/Pagination";
import RichTextEditor from "../../../components/ui/RichTextEditor";
import { TableSkeleton } from "../../../components/ui/Skeleton";
import { pb } from "../../../lib/pocketbase";
import {
  createKnowledge,
  escapeFilterValue,
  getErrorMessage,
} from "../../../lib/api";
import { usePagedList, useDebouncedValue } from "../../../lib/pagedList";
import { useAuth } from "../../../app/providers/AuthProvider";
import { isStaff } from "../../../lib/permissions";
import { formErrorText, useAppForm } from "../../../lib/formik";
import { richTextLength } from "../../../lib/richText";
import { formatRelative } from "../../../lib/format";

const STATUSES = [
  ["", "Semua"],
  ["draft", "Draft"],
  ["review", "Review"],
  ["published", "Terbit"],
  ["retired", "Pensiun"],
];

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

export default function KnowledgePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const staff = isStaff(user);
  const openedFromProblem = useRef(false);

  const [services, setServices] = useState([]);
  const [problems, setProblems] = useState([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [optionsError, setOptionsError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const debouncedQuery = useDebouncedValue(query, 350);

  const filter = useMemo(() => {
    const parts = [];
    const needle = debouncedQuery.trim();

    if (needle) {
      const value = escapeFilterValue(needle);
      parts.push(
        `(title ~ "${value}" || body ~ "${value}" || tags ~ "${value}")`
      );
    }

    if (status) parts.push(`status = "${escapeFilterValue(status)}"`);

    return parts.join(" && ");
  }, [debouncedQuery, status]);

  const list = usePagedList({
    collection: "knowledge_articles",
    filter,
    sort: "-updated",
    expand: "service,problem",
  });
  const { setPage } = list;

  // Filter atau pencarian berubah -> kembali ke halaman pertama.
  useEffect(() => {
    setPage(1);
  }, [filter, setPage]);

  const formik = useAppForm({
    initialValues: {
      title: "",
      body: "",
      visibility: "internal",
      service: "",
      problem: "",
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
        const created = await createKnowledge({
          title: values.title.trim(),
          body: values.body.trim(),
          visibility: values.visibility,
          service: values.service || undefined,
          problem: values.problem || undefined,
          tags: values.tags.trim(),
        });
        setModalOpen(false);
        formik.resetForm();
        navigate(`/knowledge/${created.id}`);
      } catch (err) {
        helpers.setStatus(getErrorMessage(err));
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  const formError = formErrorText(formik);

  const loadOptions = useCallback(async () => {
    setOptionsError("");

    try {
      const [serviceList, problemList] = await Promise.all([
        pb.collection("services").getFullList({
          filter: "is_active = true",
          sort: "name",
        }),
        staff
          ? pb.collection("problems").getFullList({ sort: "-updated" })
          : Promise.resolve([]),
      ]);

      setServices(serviceList);
      setProblems(problemList);
    } catch (err) {
      setOptionsError(getErrorMessage(err));
    }
  }, [staff]);

  useEffect(() => {
    document.title = "Pengetahuan · Healthcare ITSM";
    loadOptions();
  }, [loadOptions]);

  const error = optionsError || list.error;
  const hasFilters = Boolean(debouncedQuery.trim() || status);

  useEffect(() => {
    if (!staff || openedFromProblem.current || list.loading) return;

    const problemId = searchParams.get("problem");
    if (!problemId) return;

    openedFromProblem.current = true;
    formik.setFieldValue("problem", problemId);
    setModalOpen(true);
  }, [list.loading, searchParams, staff]);

  function openCreate() {
    formik.resetForm();
    setModalOpen(true);
  }

  function closeCreate() {
    if (formik.isSubmitting) return;
    setModalOpen(false);
    formik.resetForm();
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Pengetahuan" }, { label: "Artikel" }]}
        title="Pengetahuan"
        description="SOP, panduan, dan known error yang bisa dipakai ulang. Artikel publik dapat dibaca pengguna; artikel internal hanya untuk tim IT."
        actions={
          staff ? (
            <button className="btn btn-primary" type="button" onClick={openCreate}>
              <i className="bi bi-plus-lg" aria-hidden="true" />
              Tulis artikel
            </button>
          ) : undefined
        }
      />

      {error && (
        <div className="alert alert--error" role="alert">
          <i className="bi bi-exclamation-triangle" aria-hidden="true" />
          <div>{error}</div>
        </div>
      )}

      <div className="filter-bar">
        <div className="search-box knowledge-search">
          <i className="bi bi-search" aria-hidden="true" />
          <input
            className="input"
            placeholder="Cari judul, isi, atau tag..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Cari artikel"
          />
        </div>

        {staff && (
          <div
            className="tabs knowledge-tabs filter-end"
            role="tablist"
            aria-label="Filter status artikel"
          >
            {STATUSES.map(([value, label]) => (
              <button
                key={value || "all"}
                className={`tab${status === value ? " is-active" : ""}`}
                type="button"
                role="tab"
                aria-selected={status === value}
                onClick={() => setStatus(value)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="list-panel">
        {list.loading ? (
          <TableSkeleton rows={5} />
        ) : list.items.length === 0 ? (
          <EmptyState
            icon="bi-journal-text"
            title={hasFilters ? "Tidak ada artikel yang cocok" : "Belum ada artikel"}
            description={
              hasFilters
                ? "Ubah kata kunci atau filter status untuk melihat artikel lain."
                : staff
                  ? "Tulis artikel pertama dari solusi tiket atau known error."
                  : "Belum ada artikel publik yang diterbitkan."
            }
            action={
              hasFilters ? (
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setStatus("");
                  }}
                >
                  Reset filter
                </button>
              ) : staff ? (
                <button className="btn btn-primary" type="button" onClick={openCreate}>
                  Tulis artikel
                </button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="issue-table-wrap">
              <table className="issue-table admin-table admin-table--fit">
                <thead>
                  <tr>
                    <th>Artikel</th>
                    <th className="col-status">Status</th>
                    <th className="is-hide-sm">Visibilitas</th>
                    <th className="is-hide-sm">Layanan</th>
                    <th className="col-updated is-hide-sm">Diperbarui</th>
                  </tr>
                </thead>
                <tbody>
                  {list.items.map((article) => (
                    <tr key={article.id}>
                      <td>
                        <Link className="issue-link" to={`/knowledge/${article.id}`}>
                          <span className="issue-summary">{article.title}</span>
                          {article.tags && (
                            <span className="knowledge-tags">{article.tags}</span>
                          )}
                        </Link>
                      </td>
                      <td className="col-status">
                        <span
                          className={`lozenge ${STATUS_TONES[article.status] || ""}`}
                        >
                          {STATUS_LABELS[article.status] || article.status}
                        </span>
                      </td>
                      <td className="is-hide-sm">
                        {article.visibility === "public" ? "Publik" : "Internal"}
                      </td>
                      <td className="is-hide-sm">
                        {article.expand?.service?.name || "—"}
                      </td>
                      <td
                        className="col-updated is-hide-sm nowrap"
                        title={article.updated}
                      >
                        {formatRelative(article.updated)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={list.page}
              perPage={list.perPage}
              totalItems={list.totalItems}
              totalPages={list.totalPages}
              onPageChange={list.setPage}
              onPerPageChange={list.setPerPage}
              label="artikel"
            />
          </>
        )}
      </div>

      {modalOpen && (
        <Modal
          title="Tulis artikel"
          description="Artikel disimpan sebagai draft. Kepala IT mempublikasikan atau mempensiunkannya."
          onClose={closeCreate}
          wide
          footer={
            <>
              <button
                className="btn btn-subtle"
                type="button"
                onClick={closeCreate}
                disabled={formik.isSubmitting}
              >
                Batal
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                form="knowledge-create-form"
                disabled={formik.isSubmitting}
              >
                {formik.isSubmitting ? "Menyimpan..." : "Simpan draft"}
              </button>
            </>
          }
        >
          <form id="knowledge-create-form" onSubmit={formik.handleSubmit}>
            {formError && (
              <div className="alert alert--error" role="alert">
                <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                <div>{formError}</div>
              </div>
            )}

            <div className="field-row">
              <label className="form-label" htmlFor="knowledge-title">
                Judul <span className="req">*</span>
              </label>
              <input
                id="knowledge-title"
                className="input"
                maxLength={160}
                {...formik.getFieldProps("title")}
                required
              />
            </div>

            <div className="field-row" style={{ marginTop: 16 }}>
              <label className="form-label" htmlFor="knowledge-body">
                Isi artikel <span className="req">*</span>
              </label>
              <RichTextEditor
                id="knowledge-body"
                value={formik.values.body}
                onChange={(html) => formik.setFieldValue("body", html)}
                onBlur={() => formik.setFieldTouched("body", true)}
                placeholder="Langkah-langkah, gejala, workaround, dan catatan penting."
                rows={10}
                maxLength={30000}
              />
            </div>

            <div className="form-grid" style={{ marginTop: 16 }}>
              <div>
                <label className="form-label" htmlFor="knowledge-visibility">
                  Visibilitas
                </label>
                <select
                  id="knowledge-visibility"
                  className="select"
                  {...formik.getFieldProps("visibility")}
                >
                  <option value="internal">Internal IT</option>
                  <option value="public">Publik untuk pengguna</option>
                </select>
              </div>

              <div>
                <label className="form-label" htmlFor="knowledge-service">
                  Layanan
                </label>
                <select
                  id="knowledge-service"
                  className="select"
                  {...formik.getFieldProps("service")}
                >
                  <option value="">Tanpa layanan</option>
                  {services.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-grid" style={{ marginTop: 16 }}>
              <div>
                <label className="form-label" htmlFor="knowledge-problem">
                  Problem terkait
                </label>
                <select
                  id="knowledge-problem"
                  className="select"
                  {...formik.getFieldProps("problem")}
                >
                  <option value="">Tanpa problem</option>
                  {problems.map((problem) => (
                    <option key={problem.id} value={problem.id}>
                      {problem.problem_no} · {problem.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label" htmlFor="knowledge-tags">
                  Tag
                </label>
                <input
                  id="knowledge-tags"
                  className="input"
                  maxLength={500}
                  {...formik.getFieldProps("tags")}
                  placeholder="printer, farmasi, e-resep"
                />
              </div>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
