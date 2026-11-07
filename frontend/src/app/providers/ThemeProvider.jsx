import { createContext, useContext, useEffect, useMemo, useState } from "react";

// Tema aplikasi: "auto" mengikuti setelan sistem, atau dipaksa "light"/"dark".
// Pilihan disimpan di localStorage dan diterapkan sebagai `data-theme` pada
// elemen <html> supaya CSS bisa memilih token warna yang tepat.
const STORAGE_KEY = "itsm-theme";
const VALID = ["auto", "light", "dark"];

const ThemeContext = createContext({
  preference: "auto",
  resolved: "light",
  setPreference: () => {},
});

function systemTheme() {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function readPreference() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return VALID.includes(saved) ? saved : "auto";
  } catch {
    return "auto";
  }
}

export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(readPreference);
  const [system, setSystem] = useState(systemTheme);

  // Ikuti perubahan setelan sistem selama pengguna memilih "auto".
  useEffect(() => {
    if (!window.matchMedia) return undefined;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystem(media.matches ? "dark" : "light");

    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const resolved = preference === "auto" ? system : preference;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", resolved === "dark" ? "#0f151f" : "#0052CC");
    }
  }, [resolved]);

  function setPreference(value) {
    if (!VALID.includes(value)) return;

    setPreferenceState(value);

    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Penyimpanan penuh/diblokir: tema tetap berlaku untuk sesi ini.
    }
  }

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
