export default function EmptyState({ icon = "bi-inbox", title, description, action }) {
  return (
    <div className="empty-state text-center py-5">
      <div className="empty-state-icon mb-3">
        <i className={`bi ${icon}`} />
      </div>
      <h2 className="h5 fw-semibold mb-2">{title}</h2>
      {description && (
        <p className="text-secondary mx-auto mb-3" style={{ maxWidth: 460 }}>
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
