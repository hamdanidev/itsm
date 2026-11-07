import { useEffect } from "react";
import { getErrorMessage, transitionTicket } from "../../../lib/api";
import { formErrorText, useAppForm } from "../../../lib/formik";
import { richTextLength } from "../../../lib/richText";
import Modal from "../../../components/ui/Modal";
import RichTextEditor from "../../../components/ui/RichTextEditor";

// Modal penyelesaian tiket dipakai halaman detail dan (nanti) papan Kanban.
// Komponen ini memegang form sendiri; pemanggil cukup memberi tiket dan
// menerima hasilnya lewat `onResolved`.
export const RESOLUTION_OPTIONS = [
  ["fixed", "Diperbaiki"],
  ["workaround", "Workaround"],
  ["duplicate", "Duplikat"],
  ["not_reproducible", "Tidak dapat direproduksi"],
  ["rejected", "Ditolak"],
  ["other", "Lainnya"],
];

export const CHANGE_OUTCOME_OPTIONS = [
  ["successful", "Berhasil"],
  ["partial", "Berhasil sebagian"],
  ["failed", "Gagal"],
  ["rolled_back", "Dibatalkan (rollback)"],
];

export default function ResolveTicketModal({
  open,
  ticket,
  onClose,
  onResolved,
}) {
  const formik = useAppForm({
    initialValues: {
      summary: "",
      code: "fixed",
      change_outcome: "successful",
    },
    validate: (values) => {
      const errors = {};

      if (richTextLength(values.summary) < 10) {
        errors.summary = "Ringkasan resolusi wajib diisi minimal 10 karakter.";
      }

      return errors;
    },
    onSubmit: async (values, helpers) => {
      helpers.setStatus("");

      try {
        await transitionTicket(ticket.id, {
          status: "resolved",
          resolution_summary: values.summary.trim(),
          resolution_code: values.code,
          ...(ticket.type === "change_request"
            ? { change_outcome: values.change_outcome }
            : {}),
        });

        helpers.resetForm();
        if (onResolved) await onResolved();
      } catch (err) {
        helpers.setStatus(getErrorMessage(err));
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  // Form selalu mulai bersih saat modal dibuka untuk tiket (lain).
  useEffect(() => {
    if (!open) return;
    formik.resetForm();
    formik.setStatus("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ticket?.id]);

  if (!open || !ticket) return null;

  return (
    <Modal
      title="Selesaikan tiket"
      description={`${ticket.ticket_no} · ${ticket.title}`}
      onClose={() => (formik.isSubmitting ? null : onClose())}
      footer={
        <>
          <button
            className="btn btn-subtle"
            type="button"
            onClick={onClose}
            disabled={formik.isSubmitting}
          >
            Batal
          </button>
          <button
            className="btn btn-primary"
            type="submit"
            form="resolve-form"
            disabled={formik.isSubmitting}
          >
            {formik.isSubmitting ? (
              <span className="spinner" aria-hidden="true" />
            ) : (
              <i className="bi bi-check2" aria-hidden="true" />
            )}
            Tandai selesai
          </button>
        </>
      }
    >
      {formErrorText(formik) && (
        <div className="alert alert--error" role="alert">
          <i className="bi bi-exclamation-triangle" aria-hidden="true" />
          <div>{formErrorText(formik)}</div>
        </div>
      )}

      <form id="resolve-form" onSubmit={formik.handleSubmit}>
        <div className="modal-field">
          <label className="form-label" htmlFor="resolutionSummary">
            Ringkasan resolusi <span className="req">*</span>
          </label>
          <RichTextEditor
            id="resolutionSummary"
            value={formik.values.summary}
            onChange={(html) => formik.setFieldValue("summary", html)}
            onBlur={() => formik.setFieldTouched("summary", true)}
            placeholder="Jelaskan penyebab dan langkah perbaikan yang dilakukan..."
            rows={4}
            maxLength={5000}
            compact
          />
          <div className="char-count">
            <span>Terlihat pada riwayat tiket.</span>
            <span>{richTextLength(formik.values.summary)}/5.000</span>
          </div>
        </div>

        <div className="modal-field">
          <label className="form-label" htmlFor="resolutionCode">
            Kode resolusi
          </label>
          <select
            id="resolutionCode"
            className="select"
            {...formik.getFieldProps("code")}
          >
            {RESOLUTION_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {ticket.type === "change_request" && (
          <div className="modal-field">
            <label className="form-label" htmlFor="changeOutcome">
              Hasil perubahan <span className="req">*</span>
            </label>
            <select
              id="changeOutcome"
              className="select"
              {...formik.getFieldProps("change_outcome")}
            >
              {CHANGE_OUTCOME_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <div className="hint">
              Hasil dan waktu implementasi aktual disimpan bersama resolusi.
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
