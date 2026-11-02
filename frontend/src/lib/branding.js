import { pb } from "./pocketbase";

// URL file logo tenant. `tenant` boleh berasal dari record PocketBase atau dari
// payload konsol vendor (keduanya punya id dan logo).
export function tenantLogoUrl(tenant, thumb = "") {
  if (!tenant || !tenant.logo) return "";

  const base = `${pb.baseURL}/api/files/tenants/${tenant.id}/${tenant.logo}`;
  return thumb ? `${base}?thumb=${encodeURIComponent(thumb)}` : base;
}

export function publicBrandingLogoUrl(logoPath) {
  if (!logoPath) return "";
  return `${pb.baseURL}${logoPath}`;
}
