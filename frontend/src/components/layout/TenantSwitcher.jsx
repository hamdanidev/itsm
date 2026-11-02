import { useLocation, useNavigate } from "react-router-dom";
import { useTenant } from "../../app/providers/TenantProvider";

// Pemilih rumah sakit aktif untuk akun vendor (scope platform). Akun rumah
// sakit tidak melihat kontrol ini.
export default function TenantSwitcher() {
  const {
    isPlatformScope,
    tenants,
    activeTenantId,
    setActiveTenant,
  } = useTenant();
  const location = useLocation();
  const navigate = useNavigate();

  if (!isPlatformScope) return null;

  // Detail tiket terikat ke satu rumah sakit. Mengganti rumah sakit di sini
  // harus meninggalkan halaman detail, bukan menampilkan tiket RS lain di
  // bawah pemilih yang baru.
  const onTicketDetail =
    /^\/tickets\/[^/]+$/.test(location.pathname) &&
    location.pathname !== "/tickets/new";

  // Tiket dari rumah sakit nonaktif tidak ada di daftar pilihan; tetap
  // tampilkan supaya nilai select tidak menunjuk opsi yang salah.
  const activeMissing =
    Boolean(activeTenantId) && !tenants.some((item) => item.id === activeTenantId);

  function handleChange(event) {
    setActiveTenant(event.target.value);

    if (onTicketDetail) {
      navigate("/tickets");
    }
  }

  return (
    <label
      className="tenant-switcher"
      title="Rumah sakit yang sedang ditangani"
    >
      <i className="bi bi-buildings" aria-hidden="true" />
      <span className="visually-hidden">Rumah sakit aktif</span>
      <select
        className="select select-sm"
        value={activeTenantId}
        onChange={handleChange}
        disabled={tenants.length === 0 && !activeMissing}
      >
        {tenants.length === 0 && !activeMissing && (
          <option value="">Belum ada rumah sakit</option>
        )}
        {activeMissing && (
          <option value={activeTenantId}>Rumah sakit nonaktif</option>
        )}
        {tenants.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  );
}
