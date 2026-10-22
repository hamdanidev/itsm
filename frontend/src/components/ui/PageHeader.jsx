export default function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
}) {
  return (
    <div className="page-header mb-4">
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3">
        <div>
          {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
          <h1 className="h3 fw-bold mb-2">{title}</h1>
          {description && (
            <p className="text-secondary mb-0 page-description">{description}</p>
          )}
        </div>
        {actions && <div className="d-flex gap-2 flex-wrap">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
