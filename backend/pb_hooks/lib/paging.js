// Bantuan pagination untuk endpoint daftar khusus (bukan collection API).
//
// Endpoint memakai parameter query `page`, `perPage`, dan `q` (pencarian teks),
// lalu mengembalikan `page`, `perPage`, `totalItems`, dan `totalPages` bersama
// `items` agar frontend bisa memakai komponen Pagination yang sama.

var DEFAULT_PER_PAGE = 25;
var MAX_PER_PAGE = 100;
var MAX_QUERY = 100;

function numbers(query) {
  var page = parseInt(String((query && query.page) || "1"), 10);
  var perPage = parseInt(String((query && query.perPage) || DEFAULT_PER_PAGE), 10);

  if (!isFinite(page) || page < 1) page = 1;
  if (!isFinite(perPage) || perPage < 1) perPage = DEFAULT_PER_PAGE;
  if (perPage > MAX_PER_PAGE) perPage = MAX_PER_PAGE;

  return { page: page, perPage: perPage };
}

function search(query) {
  var raw = String((query && query.q) || "").trim();

  if (raw.length > MAX_QUERY) raw = raw.slice(0, MAX_QUERY);

  return raw;
}

// Total baris untuk filter yang sama. `countRecords` dipakai bila tersedia;
// kalau tidak, hitung dari pembacaan record (tanpa mengubah perilaku route).
function count(app, collection, filter, params) {
  try {
    if (typeof app.countRecords === "function") {
      return Number(app.countRecords(collection, filter, params)) || 0;
    }
  } catch (err) {
    console.log("countRecords gagal: " + String(err));
  }

  return app.findRecordsByFilter(collection, filter, "", 0, 0, params).length;
}

function meta(page, perPage, totalItems) {
  return {
    page: page,
    perPage: perPage,
    totalItems: totalItems,
    totalPages: perPage > 0 ? Math.ceil(totalItems / perPage) : 0,
  };
}

module.exports = {
  DEFAULT_PER_PAGE: DEFAULT_PER_PAGE,
  MAX_PER_PAGE: MAX_PER_PAGE,
  numbers: numbers,
  search: search,
  count: count,
  meta: meta,
};
