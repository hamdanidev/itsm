import { useState } from "react";
import { useMeta } from "../../app/providers/MetaProvider";
import { publicBrandingLogoUrl } from "../../lib/branding";
import BrandMark from "../../components/ui/BrandMark";

// Brand halaman masuk: logo rumah sakit bila tersedia, jika tidak brand aplikasi.
export default function AuthBrand() {
  const { tenant, appName } = useMeta();
  const [failed, setFailed] = useState(false);

  return (
    <div className="login-brand">
      {tenant?.logo_url && !failed ? (
        <img
          className="login-brand-logo"
          src={publicBrandingLogoUrl(tenant.logo_url)}
          alt=""
          onError={() => setFailed(true)}
        />
      ) : (
        <BrandMark size={30} />
      )}
      <span>{tenant?.name || appName}</span>
    </div>
  );
}
