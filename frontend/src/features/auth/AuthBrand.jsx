import { useState } from "react";
import { useMeta } from "../../app/providers/MetaProvider";
import { publicBrandingLogoUrl } from "../../lib/branding";
import BrandMark from "../../components/ui/BrandMark";

// Brand halaman masuk: logo rumah sakit bila tersedia, jika tidak brand aplikasi.
export default function AuthBrand() {
  const { tenant, appName } = useMeta();
  const [failed, setFailed] = useState(false);
  const hasLogo = Boolean(tenant?.logo_url) && !failed;

  return (
    <div className="login-brand">
      {/* Logo rumah sakit diberi alas putih; brand aplikasi sudah berbentuk ikon
          sendiri sehingga ditampilkan polos agar tidak berbingkai ganda. */}
      <span className={`login-brand-mark${hasLogo ? "" : " is-plain"}`}>
        {hasLogo ? (
          <img
            className="login-brand-logo"
            src={publicBrandingLogoUrl(tenant.logo_url)}
            alt=""
            onError={() => setFailed(true)}
          />
        ) : (
          <BrandMark size={32} />
        )}
      </span>
      <span className="login-brand-name">{tenant?.name || appName}</span>
    </div>
  );
}
