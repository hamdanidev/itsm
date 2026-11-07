// Kontrol halaman daftar: rentang data, ukuran halaman, dan tombol navigasi.
export default function Pagination({
  page,
  perPage,
  totalItems,
  totalPages,
  onPageChange,
  onPerPageChange,
  pageSizes = [25, 50, 100],
  label = "data",
  loading = false,
}) {
  const from = totalItems === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, totalItems);
  const lastPage = Math.max(totalPages, 1);

  return (
    <div className="pagination">
      <span className="pagination-info">
        {loading
          ? "Memuat..."
          : `Menampilkan ${from}–${to} dari ${totalItems} ${label}`}
      </span>

      <div className="pagination-controls">
        <select
          className="select select-sm"
          aria-label={`Jumlah ${label} per halaman`}
          value={perPage}
          onChange={(event) => onPerPageChange(Number(event.target.value))}
        >
          {pageSizes.map((size) => (
            <option key={size} value={size}>
              {size} / halaman
            </option>
          ))}
        </select>

        <button
          className="page-btn"
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Halaman sebelumnya"
        >
          <i className="bi bi-chevron-left" aria-hidden="true" />
        </button>
        <span className="pagination-page">
          Halaman {page} / {lastPage}
        </span>
        <button
          className="page-btn"
          type="button"
          disabled={page >= lastPage}
          onClick={() => onPageChange(page + 1)}
          aria-label="Halaman berikutnya"
        >
          <i className="bi bi-chevron-right" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
