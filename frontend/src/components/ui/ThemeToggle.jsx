import { useTheme } from "../../app/providers/ThemeProvider";

// Tombol tema sekali klik: berganti antara terang dan gelap. Pilihan "Sistem"
// tersedia di menu pengguna; tombol ini untuk akses cepat.
export default function ThemeToggle({ className = "icon-button" }) {
  const { resolved, setPreference } = useTheme();
  const next = resolved === "dark" ? "light" : "dark";
  const label = next === "dark" ? "Aktifkan tema gelap" : "Aktifkan tema terang";

  return (
    <button
      className={className}
      type="button"
      onClick={() => setPreference(next)}
      aria-label={label}
      title={label}
    >
      <i
        className={`bi ${resolved === "dark" ? "bi-sun" : "bi-moon-stars"}`}
        aria-hidden="true"
      />
    </button>
  );
}
