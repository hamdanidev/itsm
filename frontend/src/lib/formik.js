import { useFormik } from "formik";

// Semua form aplikasi memakai Formik. Validasi dijalankan saat blur/submit
// (bukan setiap ketikan) agar pesan error tidak muncul terlalu dini.
export function useAppForm(config) {
  return useFormik({
    validateOnChange: false,
    validateOnBlur: false,
    ...config,
  });
}

// Form lama menampilkan satu alert error. Helper ini menjaga pola yang sama:
// error server (status) diutamakan, lalu error validasi pertama.
export function formErrorText(formik) {
  if (formik.status) return formik.status;

  const errors = formik.errors || {};
  const firstKey = Object.keys(errors)[0];
  return firstKey ? String(errors[firstKey]) : "";
}

export function fieldError(formik, name) {
  if (!formik.touched[name] || !formik.errors[name]) return "";
  return String(formik.errors[name]);
}
