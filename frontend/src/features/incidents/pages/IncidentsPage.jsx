import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import PageHeader from "../../../components/ui/PageHeader";
import EmptyState from "../../../components/ui/EmptyState";
import Modal from "../../../components/ui/Modal";
import Pagination from "../../../components/ui/Pagination";
import { TableSkeleton } from "../../../components/ui/Skeleton";
import { pb } from "../../../lib/pocketbase";
import { useAuth } from "../../../app/providers/AuthProvider";
import { useTenant } from "../../../app/providers/TenantProvider";
import { isPlatformStaff } from "../../../lib/permissions";
import {
  declareIncident,
  escapeFilterValue,
  getErrorMessage,
} from "../../../lib/api";
import { usePagedList, useDebouncedValue } from "../../../lib/pagedList";
import { formErrorText, useAppForm } from "../../../lib/formik";
import { formatDateTime, formatRelative } from "../../../lib/format";
import {
  ACTIVE_STATUSES,
  SEVERITIES,
  severityMeta,
  statusMeta,
} from "../meta";

const TABS = [
  { value: "active", label: "Aktif" },
  { value: "history", label: "Riwayat" },
  { value: "all", label: "Semua" },
];

export default function IncidentsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { tenant } = useTenant();
  const [searchParams, setSearchParams] = useSearchParams();

  const platform = isPlatformStaff(user);
  const tenantId = platform ? tenant?.id || "" : user?.tenant || "";

  const [services, setServices] = useState([]);
  const [commanders, setCommanders] = useState([]);
  const [counts, setCounts] = useState({ active: 0, sev1: 0, waitingPir: 0 });
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("active");
  const [optionsError, setOptionsError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [sourceTicket, setSourceTicket] = useState(null);

  const debouncedQuery = useDebouncedValue(query, 350);

  const filter = useMemo(() => {
    const parts = [];
    const needle = debouncedQuery.trim();

    if (tenantId) parts.push(`tenant = "${escapeFilterValue(tenantId)}"`);

    if (needle) {
      const value = escapeFilterValue(needle);
      parts.push(`(incident_no ~ "${value}" || title ~ "${value}")`);
    }

    if (tab === "active") {
      parts.push(
        `(${ACTIVE_STATUSES.map((item) => `status = "${item}"`).join(" || ")})`
      );
    } else if (tab === "history") {
      parts.push(`(status = "resolved" || status = "closed")`);
    }

    return parts.join(" && ");
  }, [debouncedQuery, tab, tenantId]);

  const list = usePagedList({
    collection: "major_incidents",
    filter,
    sort: "-started_at",
    expand: "commander,affected_services",
    enabled: Boolean(tenantId),
  });
  const { setPage } = list;

  // Filter, tab, atau pencarian berubah -> kembali ke halaman pertama.
  useEffect(() => {
    setPage(1);
  }, [filter, setPage]);

  const declareForm = useAppForm({
    initialValues: {
      title: "",
      description: "",
      severity: "sev2",
      commander: "",
      affected_services: [],
    },
    validate: (values) => {
      const errors = {};
      if (values.title.trim().length < 5) {
        errors.title = "Judul insiden minimal 5 karakter.";
      }
      return errors;
    },
    onSubmit: async (values, helpers) => {
      helpers.setStatus("");

      try {
        const created = await declareIncident({
          title: values.title.trim(),
          description: values.description.trim(),
          severity: values.severity,
          commander: values.commander || undefined,
          affected_services: values.affected_services,
          source_ticket: sourceTicket?.id || undefined,
          tenant: platform ? tenantId : undefined,
        });

        setModalOpen(false);
        setSourceTicket(null);
        declareForm.resetForm();
        setSearchParams({}, { replace: true });
        navigate(`/incidents/${created.id}`);
      } catch (err) {
        helpers.setStatus(getErrorMessage(err));
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  const formError = formErrorText(declareForm);

  const loadOptions = useCallback(async () => {
    setOptionsError("");

    if (platform && !tenantId) {
      setServices([]);
      setCommanders([]);
      return;
    }

    try {
      const [serviceList, staffList] = await Promise.all([
        pb.collection("services").getFullList({
          filter: `is_active = true && tenant="${tenantId}"`,
          sort: "name",
        }),
        pb.collection("users").getFullList({
          filter: `is_active = true && tenant="${tenantId}" && (role="it_support" || role="it_lead")`,
          sort: "name",
        }),
      ]);

      setServices(serviceList);
      setCommanders(staffList);
    } catch (err) {
      setOptionsError(getErrorMessage(err));
    }
  }, [platform, tenantId]);

  // Ringkasan dihitung di server agar tetap benar saat daftar dibagi per halaman.
  const loadCounts = useCallback(async () => {
    if (!tenantId) {
      setCounts({ active: 0, sev1: 0, waitingPir: 0 });
      return;
    }

    const base = `tenant = "${escapeFilterValue(tenantId)}"`;
    const activeFilter = `${base} && (${ACTIVE_STATUSES.map(
      (item) => `status = "${item}"`
    ).join(" || ")})`;

    try {
      const [active, sev1, waitingPir] = await Promise.all([
        pb.collection("major_incidents").getList(1, 1, {
          filter: activeFilter,
          fields: "id",
        }),
        pb.collection("major_incidents").getList(1, 1, {
          filter: `${activeFilter} && severity = "sev1"`,
          fields: "id",
        }),
        pb.collection("major_incidents").getList(1, 1, {
          filter: `${base} && status = "resolved" && pir_completed_at = ""`,
          fields: "id",
        }),
      ]);

      setCounts({
        active: active.totalItems,
        sev1: sev1.totalItems,
        waitingPir: waitingPir.totalItems,
      });
    } catch (err) {
      setOptionsError(getErrorMessage(err));
    }
  }, [tenantId]);

  useEffect(() => {
    document.title = "Insiden mayor · Healthcare ITSM";
    loadOptions();
    loadCounts();
  }, [loadOptions, loadCounts]);

  // Deklarasi dari detail tiket: /incidents?ticket=<id>
  useEffect(() => {
    const ticketId = searchParams.get("ticket");

    if (!ticketId) return undefined;

    let active = true;

    pb.collection("tickets")
      .getOne(ticketId)
      .then((ticket) => {
        if (!active) return;

        setSourceTicket(ticket);
        declareForm.setFieldValue("title", ticket.title);
        if (ticket.service) {
          declareForm.setFieldValue("affected_services", [ticket.service]);
        }
        setModalOpen(true);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
    // Hanya reaksi saat parameter tiket berubah.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const error = optionsError || list.error;
  const hasFilters = Boolean(debouncedQuery.trim() || tab !== "active");

  const commanderOptions = useMemo(() => {
    if (!platform) return commanders;

    if (commanders.some((item) => item.id === user?.id)) return commanders;

    return [...commanders, { id: user?.id, name: `${user?.name} (vendor)` }];
  }, [commanders, platform, user]);

  function openCreate() {
    declareForm.resetForm();
    setSourceTicket(null);
    setSearchParams({}, { replace: true });
    setModalOpen(true);
  }

  function closeCreate() {
    if (declareForm.isSubmitting) return;

    setModalOpen(false);
    setSourceTicket(null);
    declareForm.resetForm();
    setSearchParams({}, { replace: true });
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Insiden mayor" }, { label: "Daftar" }]}
        title="Insiden mayor"
        description="Satu insiden induk untuk gangguan besar: komandan, layanan terdampak, komunikasi, dan post-incident review."
        actions={
          <button
            className="btn btn-primary"
            type="button"
            onClick={openCreate}
            disabled={platform && !tenantId}
          >
            <i className="bi bi-exclamation-octagon" aria-hidden="true" />
            Deklarasikan insiden
          </button>
        }
      />

      {error && (
        <div className="alert alert--error" role="alert">
          <i className="bi bi-exclamation-triangle" aria-hidden="true" />
          <div>{error}</div>
        </div>
      )}

      {platform && !tenantId && (
        <div className="alert alert--info" role="status">
          <i className="bi bi-info-circle" aria-hidden="true" />
          <div>Pilih rumah sakit di top bar untuk melihat insidennya.</div>
        </div>
      )}

      <div className="problem-kpis">
        <div className="problem-kpi">
          <span>Insiden aktif</span>
          <strong>{counts.active}</strong>
        </div>
        <div className="problem-kpi">
          <span>SEV-1 aktif</span>
          <strong>{counts.sev1}</strong>
        </div>
        <div className="problem-kpi">
          <span>Menunggu PIR</span>
          <strong>{counts.waitingPir}</strong>
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-box">
          <i className="bi bi-search" aria-hidden="true" />
          <input
            className="input"
            type="search"
            placeholder="Cari nomor atau judul insiden"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Cari insiden"
          />
        </div>
        <span className="list-count">{list.totalItems} insiden</span>
      </div>

      <div className="tabs" role="tablist" aria-label="Filter insiden">
        {TABS.map((item) => (
          <button
            key={item.value}
            className={`tab${tab === item.value ? " is-active" : ""}`}
            type="button"
            role="tab"
            aria-selected={tab === item.value}
            onClick={() => setTab(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="list-panel">
        {list.loading ? (
          <TableSkeleton rows={5} />
        ) : list.items.length === 0 ? (
          <EmptyState
            icon="bi-exclamation-octagon"
            title={
              hasFilters
                ? "Tidak ada insiden yang cocok"
                : tab === "active"
                  ? "Tidak ada insiden aktif"
                  : "Belum ada insiden"
            }
            description={
              hasFilters
                ? "Ubah kata kunci atau pilih tab lain untuk melihat insiden."
                : "Deklarasikan insiden mayor saat gangguan layanan berdampak luas agar penanganan dan komunikasinya terpusat."
            }
            action={
              hasFilters ? (
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setTab("active");
                  }}
                >
                  Reset filter
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={openCreate}
                  disabled={platform && !tenantId}
                >
                  Deklarasikan insiden
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
                    <th>Insiden</th>
                    <th className="col-status">Severity</th>
                    <th className="col-status">Status</th>
                    <th className="is-hide-sm">Komandan</th>
                    <th className="is-hide-sm">Layanan</th>
                    <th className="col-updated is-hide-sm">Mulai</th>
                  </tr>
                </thead>
                <tbody>
                  {list.items.map((incident) => {
                    const severity = severityMeta(incident.severity);
                    const status = statusMeta(incident.status);
                    const serviceNames = (incident.expand?.affected_services || [])
                      .map((item) => item.name)
                      .join(", ");

                    return (
                      <tr key={incident.id}>
                        <td>
                          <Link
                            className="issue-link"
                            to={`/incidents/${incident.id}`}
                          >
                            <span className="issue-key">
                              {incident.incident_no}
                            </span>
                            <span className="issue-summary">{incident.title}</span>
                          </Link>
                        </td>
                        <td className="col-status">
                          <span className={`lozenge ${severity.tone}`}>
                            {severity.short}
                          </span>
                        </td>
                        <td className="col-status">
                          <span className={`lozenge ${status.tone}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="is-hide-sm">
                          {incident.expand?.commander?.name || "—"}
                        </td>
                        <td className="is-hide-sm">{serviceNames || "—"}</td>
                        <td
                          className="col-updated is-hide-sm nowrap"
                          title={formatDateTime(incident.started_at)}
                        >
                          {formatRelative(incident.started_at)}
                        </td>
                      </tr>
                    );
                  })}
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
              label="insiden"
            />
          </>
        )}
      </div>

      {modalOpen && (
        <Modal
          title="Deklarasikan insiden mayor"
          description="Insiden mayor dipakai saat gangguan berdampak luas dan butuh satu komando serta komunikasi berkala."
          onClose={closeCreate}
          footer={
            <>
              <button
                className="btn btn-subtle"
                type="button"
                onClick={closeCreate}
                disabled={declareForm.isSubmitting}
              >
                Batal
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                form="incident-declare-form"
                disabled={declareForm.isSubmitting}
              >
                {declareForm.isSubmitting ? "Mendeklarasikan..." : "Deklarasikan"}
              </button>
            </>
          }
        >
          <form id="incident-declare-form" onSubmit={declareForm.handleSubmit}>
            {formError && (
              <div className="alert alert--error" role="alert">
                <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                <div>{formError}</div>
              </div>
            )}

            {sourceTicket && (
              <div className="alert alert--info" role="status">
                <i className="bi bi-ticket-detailed" aria-hidden="true" />
                <div>
                  Dari tiket <strong>{sourceTicket.ticket_no}</strong> ·{" "}
                  {sourceTicket.title}
                </div>
              </div>
            )}

            <div className="field-row">
              <label className="form-label" htmlFor="incident-title">
                Judul <span className="req">*</span>
              </label>
              <input
                id="incident-title"
                className="input"
                maxLength={160}
                {...declareForm.getFieldProps("title")}
                required
              />
              {declareForm.touched.title && declareForm.errors.title && (
                <div className="field-error">{declareForm.errors.title}</div>
              )}
            </div>

            <div className="field-row" style={{ marginTop: 16 }}>
              <label className="form-label" htmlFor="incident-description">
                Deskripsi dampak
              </label>
              <textarea
                id="incident-description"
                className="textarea"
                rows={4}
                maxLength={10000}
                placeholder="Gejala, unit terdampak, dan dampak klinis/operasional."
                {...declareForm.getFieldProps("description")}
              />
            </div>

            <div className="field-row" style={{ marginTop: 16 }}>
              <label className="form-label" htmlFor="incident-severity">
                Severity <span className="req">*</span>
              </label>
              <select
                id="incident-severity"
                className="select"
                {...declareForm.getFieldProps("severity")}
              >
                {SEVERITIES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <div className="hint">
                {severityMeta(declareForm.values.severity).hint}
              </div>
            </div>

            <div className="field-row" style={{ marginTop: 16 }}>
              <label className="form-label" htmlFor="incident-commander">
                Komandan insiden
              </label>
              <select
                id="incident-commander"
                className="select"
                {...declareForm.getFieldProps("commander")}
              >
                <option value="">Saya sendiri</option>
                {commanderOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-row" style={{ marginTop: 16 }}>
              <span className="form-label">Layanan terdampak</span>
              {services.length === 0 ? (
                <div className="hint">Belum ada layanan aktif.</div>
              ) : (
                <div className="check-grid">
                  {services.map((item) => (
                    <label className="check-row" key={item.id}>
                      <input
                        type="checkbox"
                        checked={declareForm.values.affected_services.includes(
                          item.id
                        )}
                        onChange={(event) => {
                          const next = event.target.checked
                            ? [
                                ...declareForm.values.affected_services,
                                item.id,
                              ]
                            : declareForm.values.affected_services.filter(
                                (value) => value !== item.id
                              );
                          declareForm.setFieldValue("affected_services", next);
                        }}
                      />
                      <span>{item.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
