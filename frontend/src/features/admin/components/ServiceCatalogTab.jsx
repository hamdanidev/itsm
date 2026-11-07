import { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "../../../components/ui/Modal";
import EmptyState from "../../../components/ui/EmptyState";
import { TableSkeleton } from "../../../components/ui/Skeleton";
import { pb } from "../../../lib/pocketbase";
import { getErrorMessage } from "../../../lib/api";
import { useAuth } from "../../../app/providers/AuthProvider";
import { formErrorText, useAppForm } from "../../../lib/formik";
import { priorityLabel, typeLabel } from "../../../lib/format";
import { TEAM_OPTIONS, teamLabel } from "../../../lib/teams";

const APPROVAL_MODES = [
  ["none", "Tanpa approval"],
  ["manager", "Manajer unit"],
  ["lead", "Kepala IT"],
  ["cab", "CAB / Kepala IT kedua"],
];

const EMPTY_SERVICE = {
  name: "",
  code: "",
  description: "",
  owner: "",
  support_unit: "",
  team: "",
  default_sla: "",
  is_active: true,
};

const EMPTY_ITEM = {
  name: "",
  code: "",
  description: "",
  approval_mode: "lead",
  sla_policy: "",
  sort: 10,
  is_active: true,
};

function activeLozenge(isActive) {
  return (
    <span
      className={`lozenge ${isActive ? "status-resolved" : "lozenge--neutral"}`}
    >
      {isActive ? "Aktif" : "Nonaktif"}
    </span>
  );
}

function policyLabel(policy) {
  if (!policy) return "";
  return `${typeLabel(policy.ticket_type)} · ${priorityLabel(policy.priority)}`;
}

export default function ServiceCatalogTab() {
  const { user } = useAuth();
  const [services, setServices] = useState([]);
  const [items, setItems] = useState([]);
  const [units, setUnits] = useState([]);
  const [people, setPeople] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [serviceModal, setServiceModal] = useState(null);
  const [itemModal, setItemModal] = useState(null);

  const serviceFormik = useAppForm({
    initialValues: { ...EMPTY_SERVICE },
    validate: (values) => {
      const errors = {};
      if (values.name.trim().length < 2) {
        errors.name = "Nama layanan minimal 2 karakter.";
      }
      if (!values.code.trim()) errors.code = "Kode layanan wajib diisi.";
      return errors;
    },
    onSubmit: async (values, helpers) => {
      helpers.setStatus("");

      try {
        const payload = {
          ...values,
          name: values.name.trim(),
          code: values.code.trim().toUpperCase(),
          description: values.description.trim(),
        };

        if (serviceModal.record) {
          await pb
            .collection("services")
            .update(serviceModal.record.id, payload);
        } else {
          await pb.collection("services").create({
            ...payload,
            tenant: user.tenant,
          });
        }

        setServiceModal(null);
        setNotice(
          serviceModal.record ? "Layanan diperbarui." : "Layanan ditambahkan."
        );
        serviceFormik.resetForm();
        await load();
      } catch (err) {
        helpers.setStatus(getErrorMessage(err));
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  const itemFormik = useAppForm({
    initialValues: { ...EMPTY_ITEM },
    validate: (values) => {
      const errors = {};
      if (!selected) errors.name = "Pilih layanan terlebih dahulu.";
      if (values.name.trim().length < 2) {
        errors.name = "Nama item minimal 2 karakter.";
      }
      if (!values.code.trim()) errors.code = "Kode item wajib diisi.";
      return errors;
    },
    onSubmit: async (values, helpers) => {
      helpers.setStatus("");

      try {
        const payload = {
          ...values,
          name: values.name.trim(),
          code: values.code.trim().toUpperCase(),
          description: values.description.trim(),
          sort: Number(values.sort) || 10,
        };

        if (itemModal.record) {
          await pb
            .collection("service_items")
            .update(itemModal.record.id, payload);
        } else {
          await pb.collection("service_items").create({
            ...payload,
            tenant: user.tenant,
            service: selected.id,
          });
        }

        setItemModal(null);
        setNotice(itemModal.record ? "Item diperbarui." : "Item ditambahkan.");
        itemFormik.resetForm();
        await load();
      } catch (err) {
        helpers.setStatus(getErrorMessage(err));
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  const serviceFormError = formErrorText(serviceFormik);
  const itemFormError = formErrorText(itemFormik);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [serviceList, itemList, unitList, userList, policyList] =
        await Promise.all([
          pb.collection("services").getFullList({
            filter: `tenant = "${user.tenant}"`,
            sort: "name",
            expand: "support_unit,owner",
          }),
          pb.collection("service_items").getFullList({
            filter: `tenant = "${user.tenant}"`,
            sort: "sort,name",
          }),
          pb.collection("units").getFullList({
            filter: `tenant = "${user.tenant}" && is_active = true`,
            sort: "name",
          }),
          pb.collection("users").getFullList({
            filter: `tenant = "${user.tenant}" && is_active = true`,
            sort: "name",
          }),
          pb.collection("sla_policies").getFullList({
            filter: `tenant = "${user.tenant}" && is_active = true`,
            sort: "ticket_type,priority",
          }),
        ]);

      setServices(serviceList);
      setItems(itemList);
      setUnits(unitList);
      setPeople(userList);
      setPolicies(policyList);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [user.tenant]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedId && services.length) {
      setSelectedId(services[0].id);
    }
  }, [selectedId, services]);

  const selected = useMemo(
    () => services.find((service) => service.id === selectedId) || null,
    [selectedId, services]
  );

  const selectedItems = useMemo(
    () => items.filter((item) => item.service === selectedId),
    [items, selectedId]
  );

  const policyById = useMemo(() => {
    const map = new Map();
    for (const policy of policies) map.set(policy.id, policy);
    return map;
  }, [policies]);

  function openService(record) {
    serviceFormik.setStatus("");
    serviceFormik.setValues(
      record
        ? {
            name: record.name || "",
            code: record.code || "",
            description: record.description || "",
            owner: record.owner || "",
            support_unit: record.support_unit || "",
            team: record.team || "",
            default_sla: record.default_sla || "",
            is_active: Boolean(record.is_active),
          }
        : { ...EMPTY_SERVICE }
    );
    setNotice("");
    setServiceModal({ record: record || null });
  }

  function openItem(record) {
    itemFormik.setStatus("");
    itemFormik.setValues(
      record
        ? {
            name: record.name || "",
            code: record.code || "",
            description: record.description || "",
            approval_mode: record.approval_mode || "lead",
            sla_policy: record.sla_policy || "",
            sort: Number(record.sort) || 10,
            is_active: Boolean(record.is_active),
          }
        : { ...EMPTY_ITEM }
    );
    setNotice("");
    setItemModal({ record: record || null });
  }

  function closeService() {
    if (serviceFormik.isSubmitting) return;
    setServiceModal(null);
    serviceFormik.resetForm();
  }

  function closeItem() {
    if (itemFormik.isSubmitting) return;
    setItemModal(null);
    itemFormik.resetForm();
  }



  if (loading) {
    return (
      <div className="list-panel">
        <TableSkeleton rows={5} />
      </div>
    );
  }

  return (
    <>
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

      <div className="catalog-admin-grid">
        <section className="panel">
          <div className="panel-head">
            <div className="panel-title">
              <i className="bi bi-box-seam" aria-hidden="true" />
              Layanan
            </div>
            <button
              className="btn btn-primary btn-sm"
              type="button"
              onClick={() => openService(null)}
            >
              <i className="bi bi-plus-lg" aria-hidden="true" />
              Tambah layanan
            </button>
          </div>

          <div className="panel-body">
            {services.length === 0 ? (
              <EmptyState
                icon="bi-box-seam"
                title="Belum ada layanan"
                description="Tambahkan layanan pertama agar tiket bisa dikaitkan ke katalog."
                action={
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => openService(null)}
                  >
                    Tambah layanan
                  </button>
                }
              />
            ) : (
              <div className="issue-table-wrap">
                <table className="issue-table admin-table catalog-admin-table">
                  <thead>
                    <tr>
                      <th>Nama layanan</th>
                      <th className="col-code">Kode</th>
                      <th>Unit</th>
                      <th>Tim</th>
                      <th className="col-num">Item</th>
                      <th className="col-status">Status</th>
                      <th className="col-actions">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((service) => (
                      <tr
                        key={service.id}
                        className={`${service.is_active ? "" : "is-inactive"} ${
                          service.id === selectedId ? "is-selected" : ""
                        }`}
                        onClick={() => setSelectedId(service.id)}
                      >
                        <td>
                          <span className="admin-name">{service.name}</span>
                          {service.description && (
                            <div className="admin-sub">{service.description}</div>
                          )}
                        </td>
                        <td className="col-code">
                          <code>{service.code}</code>
                        </td>
                        <td>
                          {service.expand?.support_unit?.name || (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          {service.team ? (
                            teamLabel(service.team)
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className="col-num">
                          {
                            items.filter((item) => item.service === service.id)
                              .length
                          }
                        </td>
                        <td className="col-status">
                          {activeLozenge(service.is_active)}
                        </td>
                        <td className="col-actions">
                          <button
                            className="btn btn-subtle btn-sm"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openService(service);
                            }}
                          >
                            <i className="bi bi-pencil" aria-hidden="true" />
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div className="panel-title">
              <i className="bi bi-list-check" aria-hidden="true" />
              {selected ? `Item · ${selected.name}` : "Item layanan"}
            </div>
            <button
              className="btn btn-primary btn-sm"
              type="button"
              disabled={!selected}
              onClick={() => openItem(null)}
            >
              <i className="bi bi-plus-lg" aria-hidden="true" />
              Tambah item
            </button>
          </div>

          <div className="panel-body">
            {!selected ? (
              <div className="catalog-empty">
                Pilih layanan di sebelah kiri untuk mengelola item.
              </div>
            ) : selectedItems.length === 0 ? (
              <EmptyState
                icon="bi-list-check"
                title="Belum ada item"
                description={`Tambahkan item permintaan untuk ${selected.name}.`}
                action={
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => openItem(null)}
                  >
                    Tambah item
                  </button>
                }
              />
            ) : (
              <div className="issue-table-wrap">
                <table className="issue-table admin-table">
                  <thead>
                    <tr>
                      <th>Nama item</th>
                      <th>Approval</th>
                      <th>SLA</th>
                      <th className="col-status">Status</th>
                      <th className="col-actions">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedItems.map((item) => (
                      <tr
                        key={item.id}
                        className={item.is_active ? "" : "is-inactive"}
                      >
                        <td>
                          <span className="admin-name">{item.name}</span>
                          <div className="admin-sub">
                            <code>{item.code}</code>
                            {item.description ? ` · ${item.description}` : ""}
                          </div>
                        </td>
                        <td>
                          {APPROVAL_MODES.find(
                            ([value]) => value === item.approval_mode
                          )?.[1] || item.approval_mode}
                        </td>
                        <td>
                          {policyById.get(item.sla_policy)
                            ? policyLabel(policyById.get(item.sla_policy))
                            : "Mengikuti layanan"}
                        </td>
                        <td className="col-status">
                          {activeLozenge(item.is_active)}
                        </td>
                        <td className="col-actions">
                          <button
                            className="btn btn-subtle btn-sm"
                            type="button"
                            onClick={() => openItem(item)}
                          >
                            <i className="bi bi-pencil" aria-hidden="true" />
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>

      {serviceModal && (
        <Modal
          title={serviceModal.record ? "Edit layanan" : "Tambah layanan"}
          description="Layanan menjadi jangkar tiket, SLA, dan laporan. Nonaktifkan layanan alih-alih menghapusnya."
          onClose={closeService}
          wide
          footer={
            <>
              <button
                className="btn btn-subtle"
                type="button"
                onClick={closeService}
                disabled={serviceFormik.isSubmitting}
              >
                Batal
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                form="service-form"
                disabled={serviceFormik.isSubmitting}
              >
                {serviceFormik.isSubmitting ? "Menyimpan..." : "Simpan"}
              </button>
            </>
          }
        >
          <form
            id="service-form"
            className="admin-form"
            onSubmit={serviceFormik.handleSubmit}
          >
            {serviceFormError && (
              <div className="alert alert--error" role="alert">
                <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                <div>{serviceFormError}</div>
              </div>
            )}

            <div className="form-grid">
              <div>
                <label className="form-label" htmlFor="service-name">
                  Nama layanan <span className="req">*</span>
                </label>
                <input
                  id="service-name"
                  className="input"
                  maxLength={120}
                  {...serviceFormik.getFieldProps("name")}
                  required
                />
              </div>

              <div>
                <label className="form-label" htmlFor="service-code">
                  Kode <span className="req">*</span>
                </label>
                <input
                  id="service-code"
                  className="input"
                  maxLength={20}
                  placeholder="Contoh: SIMRS"
                  {...serviceFormik.getFieldProps("code")}
                  required
                />
              </div>
            </div>

            <div className="field-row" style={{ marginTop: 16 }}>
              <label className="form-label" htmlFor="service-description">
                Deskripsi
              </label>
              <textarea
                id="service-description"
                className="textarea"
                rows={3}
                maxLength={2000}
                placeholder="Apa yang dicakup layanan ini dan siapa penggunanya."
                {...serviceFormik.getFieldProps("description")}
              />
            </div>

            <div className="form-grid" style={{ marginTop: 16 }}>
              <div>
                <label className="form-label" htmlFor="service-owner">
                  Service owner
                </label>
                <select
                  id="service-owner"
                  className="select"
                  {...serviceFormik.getFieldProps("owner")}
                >
                  <option value="">Belum ditentukan</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label" htmlFor="service-unit">
                  Unit pendukung
                </label>
                <select
                  id="service-unit"
                  className="select"
                  {...serviceFormik.getFieldProps("support_unit")}
                >
                  <option value="">Belum ditentukan</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field-row" style={{ marginTop: 16 }}>
              <label className="form-label" htmlFor="service-team">
                Tim penanggung jawab
              </label>
              <select
                id="service-team"
                className="select"
                {...serviceFormik.getFieldProps("team")}
              >
                <option value="">Tanpa tim</option>
                {TEAM_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <div className="hint">
                Tiket baru dari layanan ini otomatis masuk antrean tim tersebut.
              </div>
            </div>

            <div className="field-row" style={{ marginTop: 16 }}>
              <label className="form-label" htmlFor="service-sla">
                SLA default layanan
              </label>
              <select
                id="service-sla"
                className="select"
                {...serviceFormik.getFieldProps("default_sla")}
              >
                <option value="">Ikuti policy tipe × prioritas</option>
                {policies.map((policy) => (
                  <option key={policy.id} value={policy.id}>
                    {policyLabel(policy)} · {policy.name}
                  </option>
                ))}
              </select>
              <div className="hint">
                Dipakai bila item tidak punya SLA sendiri. Tiket lama tetap
                memakai snapshot SLA saat dibuat.
              </div>
            </div>

            <label className="checkline" htmlFor="service-active">
              <input
                id="service-active"
                type="checkbox"
                {...serviceFormik.getFieldProps({
                  name: "is_active",
                  type: "checkbox",
                })}
              />
              <span>Layanan aktif dan tampil di katalog</span>
            </label>
          </form>
        </Modal>
      )}

      {itemModal && (
        <Modal
          title={itemModal.record ? "Edit item" : "Tambah item"}
          description={`Item permintaan untuk ${selected?.name || "layanan"}. Mode approval menentukan siapa yang harus menyetujui sebelum pekerjaan dimulai.`}
          onClose={closeItem}
          wide
          footer={
            <>
              <button
                className="btn btn-subtle"
                type="button"
                onClick={closeItem}
                disabled={itemFormik.isSubmitting}
              >
                Batal
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                form="item-form"
                disabled={itemFormik.isSubmitting}
              >
                {itemFormik.isSubmitting ? "Menyimpan..." : "Simpan"}
              </button>
            </>
          }
        >
          <form
            id="item-form"
            className="admin-form"
            onSubmit={itemFormik.handleSubmit}
          >
            {itemFormError && (
              <div className="alert alert--error" role="alert">
                <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                <div>{itemFormError}</div>
              </div>
            )}

            <div className="form-grid">
              <div>
                <label className="form-label" htmlFor="item-name">
                  Nama item <span className="req">*</span>
                </label>
                <input
                  id="item-name"
                  className="input"
                  maxLength={120}
                  placeholder="Contoh: Reset password"
                  {...itemFormik.getFieldProps("name")}
                  required
                />
              </div>

              <div>
                <label className="form-label" htmlFor="item-code">
                  Kode <span className="req">*</span>
                </label>
                <input
                  id="item-code"
                  className="input"
                  maxLength={40}
                  placeholder="Contoh: RESET-PASSWORD"
                  {...itemFormik.getFieldProps("code")}
                  required
                />
              </div>
            </div>

            <div className="field-row" style={{ marginTop: 16 }}>
              <label className="form-label" htmlFor="item-description">
                Deskripsi
              </label>
              <textarea
                id="item-description"
                className="textarea"
                rows={3}
                maxLength={2000}
                placeholder="Panduan singkat yang tampil saat pengguna memilih item ini."
                {...itemFormik.getFieldProps("description")}
              />
            </div>

            <div className="form-grid" style={{ marginTop: 16 }}>
              <div>
                <label className="form-label" htmlFor="item-approval">
                  Mode approval
                </label>
                <select
                  id="item-approval"
                  className="select"
                  {...itemFormik.getFieldProps("approval_mode")}
                >
                  {APPROVAL_MODES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label" htmlFor="item-sla">
                  SLA item
                </label>
                <select
                  id="item-sla"
                  className="select"
                  {...itemFormik.getFieldProps("sla_policy")}
                >
                  <option value="">Ikuti SLA layanan</option>
                  {policies.map((policy) => (
                    <option key={policy.id} value={policy.id}>
                      {policyLabel(policy)} · {policy.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-grid" style={{ marginTop: 16 }}>
              <div>
                <label className="form-label" htmlFor="item-sort">
                  Urutan
                </label>
                <input
                  id="item-sort"
                  className="input"
                  type="number"
                  min={0}
                  {...itemFormik.getFieldProps("sort")}
                />
              </div>

              <div className="checkline" style={{ alignSelf: "end" }}>
                <input
                  id="item-active"
                  type="checkbox"
                  {...itemFormik.getFieldProps({
                    name: "is_active",
                    type: "checkbox",
                  })}
                />
                <label htmlFor="item-active">Item aktif</label>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
