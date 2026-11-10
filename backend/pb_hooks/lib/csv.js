// Parser CSV kecil untuk impor massal (tanpa dependensi).
//
// Mendukung pemisah koma, titik koma, atau tab (Excel Indonesia sering memakai
// titik koma), tanda kutip ganda dengan escape `""`, BOM UTF-8, dan akhir baris
// CRLF. Baris kosong dibuang agar nomor baris pada ringkasan menunjuk ke baris
// data yang benar-benar berisi.
//
// Tidak ada I/O di sini supaya modul bisa diuji sebagai unit test Node.

function stripBom(text) {
  if (text.charCodeAt(0) === 0xfeff) return text.slice(1);
  return text;
}

// Memilih pemisah dari baris pertama (header). Tanda kutip diabaikan supaya
// nama seperti "Budi, S.Kom" tidak dianggap pemisah.
function detectDelimiter(text) {
  var firstLine = "";
  var inQuotes = false;

  for (var i = 0; i < text.length; i++) {
    var ch = text[i];

    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (ch === "\n" || ch === "\r")) break;
    firstLine += ch;
  }

  var candidates = [",", ";", "\t"];
  var best = ",";
  var bestCount = 0;

  for (var c = 0; c < candidates.length; c++) {
    var delimiter = candidates[c];
    var count = 0;
    var quoted = false;

    for (var j = 0; j < firstLine.length; j++) {
      var current = firstLine[j];

      if (current === '"') {
        quoted = !quoted;
      } else if (!quoted && current === delimiter) {
        count += 1;
      }
    }

    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }

  return best;
}

// Mengembalikan array baris; setiap baris adalah array string. Baris kosong dan
// sel kosong di ujung baris tetap dipertahankan agar pemetaan kolom konsisten.
function parse(text) {
  var source = stripBom(String(text == null ? "" : text));
  var delimiter = detectDelimiter(source);
  var rows = [];
  var row = [];
  var field = "";
  var inQuotes = false;
  var fieldStarted = false;

  function pushField() {
    row.push(field);
    field = "";
    fieldStarted = false;
  }

  function pushRow() {
    pushField();
    rows.push(row);
    row = [];
  }

  for (var i = 0; i < source.length; i++) {
    var ch = source[i];

    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      fieldStarted = true;
      continue;
    }

    if (ch === delimiter) {
      pushField();
      continue;
    }

    if (ch === "\n") {
      pushRow();
      continue;
    }

    if (ch === "\r") {
      // CRLF: baris diakhiri pada \n berikutnya. CR tunggal juga akhir baris.
      if (source[i + 1] === "\n") continue;
      pushRow();
      continue;
    }

    field += ch;
    fieldStarted = true;
  }

  if (fieldStarted || field !== "" || row.length) pushRow();

  // Buang baris yang seluruh selnya kosong (mis. dari newline di akhir berkas).
  var cleaned = [];

  for (var r = 0; r < rows.length; r++) {
    var empty = true;

    for (var c = 0; c < rows[r].length; c++) {
      if (String(rows[r][c] || "").trim() !== "") {
        empty = false;
        break;
      }
    }

    if (!empty) cleaned.push(rows[r]);
  }

  return cleaned;
}

module.exports = {
  parse: parse,
  detectDelimiter: detectDelimiter,
};
