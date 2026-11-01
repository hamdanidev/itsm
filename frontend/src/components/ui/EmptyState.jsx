export default function EmptyState({
  icon = "bi-inbox",
  title,
  description,
  action,
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <i className={`bi ${icon}`} aria-hidden="true" />
      </div>
      <div className="empty-title">{title}</div>
      {description && <p className="empty-text">{description}</p>}
      {action}
    </div>
  );
}
