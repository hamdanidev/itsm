import { Fragment } from "react";
import { Link } from "react-router-dom";

export default function PageHeader({
  breadcrumb,
  title,
  description,
  actions,
  children,
}) {
  return (
    <div className="page-head">
      <div className="page-head-copy">
        {Array.isArray(breadcrumb) && breadcrumb.length > 0 && (
          <nav className="breadcrumb" aria-label="Breadcrumb">
            {breadcrumb.map((item, index) => (
              <Fragment key={`${item.label}-${index}`}>
                {index > 0 && (
                  <span className="sep" aria-hidden="true">
                    /
                  </span>
                )}
                {item.to ? <Link to={item.to}>{item.label}</Link> : <span>{item.label}</span>}
              </Fragment>
            ))}
          </nav>
        )}
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-subtitle">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
      {children}
    </div>
  );
}
