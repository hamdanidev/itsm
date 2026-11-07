// Primitif kerangka pemuatan (skeleton). Dipakai bersama agar semua halaman
// memakai pola pemuatan yang sama, bukan spinner yang berbeda-beda per fitur.

// Satu balok abu-abu berdenyut. Lebar/tinggi memakai angka px atau string CSS.
export function Skeleton({ width, height = 12, radius, style }) {
  return (
    <span
      className="skeleton"
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden="true"
    />
  );
}

// Kerangka daftar generik: beberapa baris dengan kolom ringkas, pengganti
// spinner "Memuat ..." pada halaman daftar.
export function TableSkeleton({ rows = 6 }) {
  return (
    <div className="table-skeleton" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div className="table-skeleton-row" key={index}>
          <Skeleton width={92} />
          <Skeleton width={index % 3 === 2 ? "45%" : "68%"} />
          <Skeleton width={64} />
          <Skeleton width={88} />
        </div>
      ))}
    </div>
  );
}
