import { pb } from "../../lib/pocketbase";
import { initials } from "../../lib/format";

export default function Avatar({ user, size = 24, className = "", alt }) {
  const classes = `avatar${className ? ` ${className}` : ""}`;
  const url =
    user?.avatar && user?.collectionId
      ? pb.files.getURL(user, user.avatar, { thumb: "96x96" })
      : "";

  if (url) {
    return (
      <img
        className={`${classes} avatar--image`}
        src={url}
        alt={alt || user.name || "Foto profil"}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        loading="lazy"
      />
    );
  }

  return (
    <span className={classes} aria-hidden="true">
      {initials(user?.name)}
    </span>
  );
}
