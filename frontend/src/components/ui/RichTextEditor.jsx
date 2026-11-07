import { useEffect, useRef } from "react";
import {
  richTextLength,
  sanitizeHtml,
  toEditorHtml,
} from "../../lib/richText";

const TOOLS = [
  { command: "bold", icon: "bi-type-bold", label: "Tebal" },
  { command: "italic", icon: "bi-type-italic", label: "Miring" },
  { command: "underline", icon: "bi-type-underline", label: "Garis bawah" },
  { command: "formatBlock", arg: "h2", icon: "bi-type-h2", label: "Judul" },
  {
    command: "insertUnorderedList",
    icon: "bi-list-ul",
    label: "Daftar poin",
  },
  {
    command: "insertOrderedList",
    icon: "bi-list-ol",
    label: "Daftar nomor",
  },
  {
    command: "formatBlock",
    arg: "blockquote",
    icon: "bi-quote",
    label: "Kutipan",
  },
  { command: "formatBlock", arg: "pre", icon: "bi-code-slash", label: "Kode" },
];

export default function RichTextEditor({
  id,
  value,
  onChange,
  onBlur,
  placeholder = "Tulis penjelasan...",
  rows = 8,
  maxLength,
  compact = false,
  disabled = false,
  ariaLabel,
}) {
  const editorRef = useRef(null);
  const lastValue = useRef(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (lastValue.current === value) return;

    const html = toEditorHtml(value);
    if (editor.innerHTML !== html) editor.innerHTML = html;
    lastValue.current = value;
  }, [value]);

  function emit() {
    const editor = editorRef.current;
    if (!editor) return;

    const html = sanitizeHtml(editor.innerHTML);
    lastValue.current = html;
    onChange(html);
  }

  function exec(command, arg) {
    if (disabled) return;
    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();
    document.execCommand(command, false, arg || null);
    emit();
  }

  function handleLink() {
    if (disabled) return;
    const editor = editorRef.current;
    if (!editor) return;

    const url = window.prompt("Alamat tautan (https://...)");
    if (!url) return;
    if (!/^(https?:|mailto:)/i.test(url.trim())) {
      window.alert("Tautan harus diawali http://, https://, atau mailto:");
      return;
    }

    editor.focus();
    document.execCommand("createLink", false, url.trim());
    emit();
  }

  function handlePaste(event) {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
    emit();
  }

  function handleKeyDown(event) {
    if (!(event.ctrlKey || event.metaKey)) return;

    const key = event.key.toLowerCase();
    if (key === "b" || key === "i" || key === "u") {
      event.preventDefault();
      exec(key === "b" ? "bold" : key === "i" ? "italic" : "underline");
    }
  }

  function handleBlur() {
    const editor = editorRef.current;
    if (!editor) return;

    const html = sanitizeHtml(editor.innerHTML);
    if (editor.innerHTML !== html) editor.innerHTML = html;
    lastValue.current = html;
    onChange(html);
    onBlur?.();
  }

  const length = richTextLength(value);
  const overLimit = maxLength ? length > maxLength : false;

  return (
    <div
      className={`rich-editor${compact ? " rich-editor--compact" : ""}${
        disabled ? " is-disabled" : ""
      }`}
    >
      {!disabled && (
        <div className="rich-toolbar" role="toolbar" aria-label="Pemformatan teks">
          {TOOLS.map((tool) => (
            <button
              key={`${tool.command}-${tool.arg || ""}`}
              type="button"
              className="rich-tool"
              title={tool.label}
              aria-label={tool.label}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => exec(tool.command, tool.arg)}
            >
              <i className={`bi ${tool.icon}`} aria-hidden="true" />
            </button>
          ))}

          <button
            type="button"
            className="rich-tool"
            title="Tautan"
            aria-label="Tautan"
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleLink}
          >
            <i className="bi bi-link-45deg" aria-hidden="true" />
          </button>

          <button
            type="button"
            className="rich-tool"
            title="Hapus format"
            aria-label="Hapus format"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              exec("removeFormat");
              exec("formatBlock", "p");
            }}
          >
            <i className="bi bi-eraser" aria-hidden="true" />
          </button>
        </div>
      )}

      <div
        ref={editorRef}
        id={id}
        className="rich-content"
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel || placeholder}
        data-placeholder={placeholder}
        data-empty={length === 0 ? "true" : "false"}
        style={{ minHeight: compact ? 80 : rows * 24 }}
        onInput={emit}
        onBlur={handleBlur}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
      />

      {maxLength && (
        <div className={`rich-count${overLimit ? " is-over" : ""}`}>
          {length}/{maxLength}
        </div>
      )}
    </div>
  );
}
