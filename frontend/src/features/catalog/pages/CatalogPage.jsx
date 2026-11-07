import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../../../components/ui/PageHeader";
import EmptyState from "../../../components/ui/EmptyState";
import { pb } from "../../../lib/pocketbase";
import { getErrorMessage } from "../../../lib/api";

const APPROVAL_LABELS = {
  none: "Tanpa approval",
  manager: "Persetujuan manajer unit",
  lead: "Persetujuan Kepala IT",
  cab: "Persetujuan CAB",
};

export default function CatalogPage() {
  const [services, setServices] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Katalog Layanan · Healthcare ITSM";
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const [serviceList, itemList] = await Promise.all([
          pb.collection("services").getFullList({
            filter: "is_active = true",
            sort: "name",
            expand: "support_unit",
          }),
          pb.collection("service_items").getFullList({
            filter: "is_active = true",
            sort: "sort,name",
          }),
        ]);

        if (!active) return;
        setServices(serviceList);
        setItems(itemList);
      } catch (err) {
        if (active) setError(getErrorMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  const byService = useMemo(() => {
    const map = new Map();

    for (const item of items) {
      if (!map.has(item.service)) map.set(item.service, []);
      map.get(item.service).push(item);
    }

    return map;
  }, [items]);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Layanan" }, { label: "Katalog" }]}
        title="Katalog layanan"
        description="Pilih layanan dan jenis permintaan agar tiket masuk ke alur, SLA, dan persetujuan yang tepat. Untuk gangguan yang sedang terjadi, gunakan tombol Laporkan gangguan."
        actions={
          <Link className="btn btn-subtle" to="/tickets">
            <i className="bi bi-ticket-detailed" aria-hidden="true" />
            Daftar tiket
          </Link>
        }
      />

      {error && (
        <div className="alert alert--error" role="alert">
          <i className="bi bi-exclamation-triangle" aria-hidden="true" />
          <div>{error}</div>
        </div>
      )}

      {loading ? (
        <div className="list-panel">
          <div className="loading-state">
            <span className="spinner spinner--dark" role="status" />
            Memuat katalog...
          </div>
        </div>
      ) : services.length === 0 ? (
        <div className="list-panel">
          <EmptyState
            icon="bi-grid-1x2"
            title="Katalog layanan belum tersedia"
            description="Kepala IT dapat menambahkan layanan dan item permintaan dari menu Pengaturan > Layanan."
            action={
              <Link className="btn btn-primary" to="/tickets/new">
                Buat tiket manual
              </Link>
            }
          />
        </div>
      ) : (
        <div className="catalog-grid">
          {services.map((service) => {
            const serviceItems = byService.get(service.id) || [];

            return (
              <section className="panel catalog-card" key={service.id}>
                <div className="panel-head">
                  <div className="panel-title">
                    <i className="bi bi-box-seam" aria-hidden="true" />
                    {service.name}
                  </div>
                  <span className="panel-count">{service.code}</span>
                </div>

                <div className="panel-body">
                  <p className="catalog-desc">
                    {service.description || "Layanan ini belum memiliki deskripsi."}
                  </p>

                  {service.expand?.support_unit?.name && (
                    <div className="catalog-meta">
                      <i className="bi bi-people" aria-hidden="true" />
                      Ditangani {service.expand.support_unit.name}
                    </div>
                  )}

                  {serviceItems.length > 0 ? (
                    <ul className="catalog-items">
                      {serviceItems.map((item) => (
                        <li key={item.id} className="catalog-item">
                          <div>
                            <div className="catalog-item-name">{item.name}</div>
                            <div className="catalog-item-desc">
                              {item.description || "Tanpa deskripsi."}
                            </div>
                            <div className="catalog-item-meta">
                              {APPROVAL_LABELS[item.approval_mode] ||
                                item.approval_mode}
                            </div>
                          </div>
                          <Link
                            className="btn btn-subtle btn-sm"
                            to={`/tickets/new?type=service_request&service=${service.id}&item=${item.id}`}
                          >
                            Ajukan
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="catalog-empty">
                      Belum ada item permintaan untuk layanan ini.
                    </div>
                  )}

                  <div className="catalog-actions">
                    <Link
                      className="btn btn-outline btn-sm"
                      to={`/tickets/new?type=incident&service=${service.id}`}
                    >
                      <i className="bi bi-exclamation-triangle" aria-hidden="true" />
                      Laporkan gangguan
                    </Link>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
