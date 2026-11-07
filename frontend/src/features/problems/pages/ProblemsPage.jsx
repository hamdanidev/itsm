import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PageHeader from "../../../components/ui/PageHeader";
import EmptyState from "../../../components/ui/EmptyState";
import Modal from "../../../components/ui/Modal";
import Pagination from "../../../components/ui/Pagination";
import RichTextEditor from "../../../components/ui/RichTextEditor";
import { TableSkeleton } from "../../../components/ui/Skeleton";
import { pb } from "../../../lib/pocketbase";
import { createProblem, escapeFilterValue, getErrorMessage } from "../../../lib/api";
import { usePagedList, useDebouncedValue } from "../../../lib/pagedList";
import { formErrorText, useAppForm } from "../../../lib/formik";
import { formatDateTime, formatRelative } from "../../../lib/format";

const STATUSES = [
  ["", "Semua"],
  ["identified", "Teridentifikasi"],
  ["investigating", "Investigasi"],
  ["known_error", "Known error"],
  ["resolved", "Selesai"],
  ["closed", "Ditutup"],
];

const STATUS_LABELS = {
  identified: "Teridentifikasi",
  investigating: "Investigasi",
  known_error: "Known error",
  resolved: "Selesai",
  closed: "Ditutup",
};

const STATUS_TONES = {
  identified: "lozenge--neutral",
  investigating: "status-in_progress",
  known_error: "status-reopened",
  resolved: "status-resolved",
  closed: "status-closed",
};

export default function ProblemsPage() {
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [counts, setCounts] = useState({ open: 0, known: 0, resolved: 0 });
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
      parts.push(`(problem_no ~ "${value}" || title ~ "${value}")`);
    }

    if (status) parts.push(`status = "${escapeFilterValue(status)}"`);

    return parts.join(" && ");
  }, [debouncedQuery, status]);

  const list = usePagedList({
    collection: "problems",
    filter,
    sort: "-updated",
    expand: "service,owner",
  });
  const { setPage } = list;

  // Filter atau pencarian berubah -> kembali ke halaman pertama.
  useEffect(() => {
    setPage(1);
  }, [filter, setPage]);

  const formik = useAppForm({
    initialValues: { title: "", description: "", service: "" },
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
        const created = await createProblem({
          title: values.title.trim(),
          description: values.description.trim(),
          service: values.service || undefined,
        });
        setModalOpen(false);
        formik.resetForm();
        navigate(`/problems/${created.id}`);
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
      const serviceList = await pb.collection("services").getFullList({
        filter: "is_active = true",
        sort: "name",
      });

      setServices(serviceList);
    } catch (err) {
      setOptionsError(getErrorMessage(err));
    }
  }, []);

  // Ringkasan dihitung di server agar tidak bergantung pada halaman aktif.
  const loadCounts = useCallback(async () => {
    try {
      const [open, known, resolved] = await Promise.all([
        pb.collection("problems").getList(1, 1, {
          filter: 'status != "closed"',
          fields: "id",
        }),
        pb.collection("problems").getList(1, 1, {
          filter: 'status = "known_error"',
          fields: "id",
        }),
        pb.collection("problems").getList(1, 1, {
          filter: 'status = "resolved"',
          fields: "id",
        }),
      ]);

      setCounts({
        open: open.totalItems,
        known: known.totalItems,
        resolved: resolved.totalItems,
      });
    } catch (err) {
      setOptionsError(getErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    document.title = "Problem · Healthcare ITSM";
    loadOptions();
    loadCounts();
  }, [loadOptions, loadCounts]);

  const error = optionsError || list.error;
  const hasFilters = Boolean(debouncedQuery.trim() || status);

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
        breadcrumb={[{ label: "Problem" }, { label: "Daftar" }]}
        title="Problem"
        description="Kelompokkan insiden berulang, cari akar masalah, dan dokumentasikan workaround agar layanan tidak diperbaiki dari nol setiap kali."
        actions={
          <button className="btn btn-primary" type="button" onClick={openCreate}>
            <i className="bi bi-plus-lg" aria-hidden="true" />
            Buat problem
          </button>
        }
      />

      {error && (
        <div className="alert alert--error" role="alert">
          <i className="bi bi-exclamation-triangle" aria-hidden="true" />
          <div>{error}</div>
        </div>
      )}

      <div className="problem-kpis">
        <div className="problem-kpi">
          <span>Problem aktif</span>
          <strong>{counts.open}</strong>
        </div>
        <div className="problem-kpi">
          <span>Known error</span>
          <strong>{counts.known}</strong>
        </div>
        <div className="problem-kpi">
          <span>Menunggu penutupan</span>
          <strong>{counts.resolved}</strong>
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-box">
          <i className="bi bi-search" aria-hidden="true" />
          <input
            className="input"
            type="search"
            placeholder="Cari nomor atau judul problem"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Cari problem"
          />
        </div>
        <span className="list-count">{list.totalItems} problem</span>
      </div>

      <div className="tabs" role="tablist" aria-label="Filter status problem">
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

      <div className="list-panel">
        {list.loading ? (
          <TableSkeleton rows={5} />
        ) : list.items.length === 0 ? (
          <EmptyState
            icon="bi-diagram-3"
            title={hasFilters ? "Tidak ada problem yang cocok" : "Belum ada problem"}
            description={
              hasFilters
                ? "Ubah kata kunci atau filter status untuk melihat problem lain."
                : "Buat problem dari tiket insiden, atau tambahkan problem baru untuk menelusuri akar masalah."
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
              ) : (
                <button className="btn btn-primary" type="button" onClick={openCreate}>
                  Buat problem
                </button>
              )
            }
          />
        ) : (
          <>
            <div className="issue-table-wrap">
              <table className="issue-table admin-table admin-table--fit">
                <thead>
                  <tr>
                    <th>Problem</th>
                    <th className="col-status">Status</th>
                    <th className="is-hide-sm">Layanan</th>
                    <th className="is-hide-sm">Owner</th>
                    <th className="col-updated is-hide-sm">Diperbarui</th>
                  </tr>
                </thead>
                <tbody>
                  {list.items.map((problem) => (
                    <tr key={problem.id}>
                      <td>
                        <Link className="issue-link" to={`/problems/${problem.id}`}>
                          <span className="issue-key">{problem.problem_no}</span>
                          <span className="issue-summary">{problem.title}</span>
                        </Link>
                      </td>
                      <td className="col-status">
                        <span
                          className={`lozenge ${STATUS_TONES[problem.status] || ""}`}
                        >
                          {STATUS_LABELS[problem.status] || problem.status}
                        </span>
                      </td>
                      <td className="is-hide-sm">
                        {problem.expand?.service?.name || "—"}
                      </td>
                      <td className="is-hide-sm">
                        {problem.expand?.owner?.name || "—"}
                      </td>
                      <td
                        className="col-updated is-hide-sm nowrap"
                        title={formatDateTime(problem.updated)}
                      >
                        {formatRelative(problem.updated)}
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
              label="problem"
            />
          </>
        )}
      </div>

      {modalOpen && (
        <Modal
          title="Buat problem"
          description="Problem dipakai untuk menelusuri akar masalah dari satu atau beberapa insiden."
          onClose={closeCreate}
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
                form="problem-create-form"
                disabled={formik.isSubmitting}
              >
                {formik.isSubmitting ? "Menyimpan..." : "Buat problem"}
              </button>
            </>
          }
        >
          <form id="problem-create-form" onSubmit={formik.handleSubmit}>
            {formError && (
              <div className="alert alert--error" role="alert">
                <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                <div>{formError}</div>
              </div>
            )}

            <div className="field-row">
              <label className="form-label" htmlFor="problem-title">
                Judul <span className="req">*</span>
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
                placeholder="Gejala, dampak, dan insiden yang terkait."
                rows={4}
                maxLength={10000}
              />
            </div>

            <div className="field-row" style={{ marginTop: 16 }}>
              <label className="form-label" htmlFor="problem-service">
                Layanan
              </label>
              <select
                id="problem-service"
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
          </form>
        </Modal>
      )}
    </>
  );
}
