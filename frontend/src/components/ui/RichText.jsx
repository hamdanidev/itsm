import { isHtml, sanitizeHtml } from "../../lib/richText";

// Renderer aman untuk nilai lama (teks biasa) maupun HTML rich text.
export default function RichText({ value, className = "" }) {
  const raw = String(value || "");
  if (!raw) return null;

  if (isHtml(raw)) {
    return (
      <div
        className={`rich-text${className ? ` ${className}` : ""}`}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(raw) }}
      />
    );
  }

  return (
    <div
      className={`rich-text rich-text--plain${className ? ` ${className}` : ""}`}
    >
      {raw}
    </div>
  );
}
