export default function BrandMark({ size = 24, className = "" }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="Healthcare ITSM"
    >
      <rect width="32" height="32" rx="4" fill="#0052CC" />
      <path
        d="M6.5 18.5h4.2l2.4-7.5 4 12 2.6-8h5.8"
        fill="none"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
