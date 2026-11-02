// Data master rumah sakit yang dapat dikelola vendor dari Konsol Vendor.
//
// Validasi dan normalisasi sengaja dikumpulkan di sini supaya route konsol,
// form frontend, dan test memakai aturan yang sama. Penulisan tetap lewat
// $app.save di route (bukan collection API), sehingga rule tulis tenant tidak
// perlu dilonggarkan.

var KINDS = {
  units: "units",
  categories: "ticket_categories",
  policies: "sla_policies",
  holidays: "holidays",
};

var UNIT_KINDS = ["clinical", "support", "management"];
var CATEGORY_KINDS = ["all", "incident", "service_request", "change_request"];
var TICKET_TYPES = ["incident", "service_request", "change_request"];
var PRIORITIES = ["critical", "high", "normal", "low"];
var CALENDAR_MODES = ["24x7", "business_hours"];

function text(value, max) {
  var result = String(value == null ? "" : value).trim();
  if (max && result.length > max) {
    throw new BadRequestError("Teks melebihi " + max + " karakter");
  }
  return result;
}

function normalizeCode(raw) {
  return String(raw == null ? "" : raw)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function boolOr(value, fallback) {
  return value === undefined ? fallback : Boolean(value);
}

function numberOr(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  var parsed = Number(value);
  if (isNaN(parsed)) throw new BadRequestError("Nilai angka tidak valid");
  return parsed;
}

function codeField(value, label) {
  var code = normalizeCode(value);
  if (!/^[A-Z0-9][A-Z0-9._-]{0,19}$/.test(code)) {
    throw new BadRequestError(
      label + " 1–20 karakter: huruf, angka, titik, garis bawah, atau strip"
    );
  }
  return code;
}

function timeField(value, label) {
  var text = String(value == null ? "" : value).trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) {
    throw new BadRequestError(label + " harus berformat HH:MM");
  }
  return text;
}

function daysField(value) {
  var list = Array.isArray(value) ? value : [];
  var out = [];
  var seen = {};

  for (var i = 0; i < list.length; i++) {
    var day = Number(list[i]);
    if (!(day >= 1 && day <= 7)) {
      throw new BadRequestError("Hari kerja harus 1–7 (Senin–Minggu)");
    }
    if (seen[day]) continue;
    seen[day] = true;
    out.push(day);
  }

  out.sort(function (a, b) {
    return a - b;
  });

  return out;
}

function dateField(value) {
  var text = String(value == null ? "" : value).trim();
  var match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);

  if (!match) throw new BadRequestError("Tanggal harus berformat YYYY-MM-DD");

  return match[1] + "-" + match[2] + "-" + match[3] + " 00:00:00.000Z";
}

function dateOnly(value) {
  return String(value || "").slice(0, 10);
}

// Mengubah body menjadi field yang boleh disimpan. `partial` dipakai PATCH:
// hanya field yang dikirim yang divalidasi dan diubah.
function normalize(kind, body, partial) {
  var input = body || {};
  var out = {};
  var has = function (key) {
    return !partial || input[key] !== undefined;
  };

  if (kind === "units") {
    if (has("name")) {
      out.name = text(input.name, 120);
      if (out.name.length < 2) {
        throw new BadRequestError("Nama unit minimal 2 karakter");
      }
    }
    if (has("code")) out.code = codeField(input.code, "Kode unit");
    if (has("kind")) {
      out.kind = text(input.kind, 20);
      if (UNIT_KINDS.indexOf(out.kind) < 0) {
        throw new BadRequestError("Jenis unit tidak dikenal");
      }
    }
    if (input.manager !== undefined) out.manager = text(input.manager, 64);
    if (input.is_active !== undefined) out.is_active = Boolean(input.is_active);
    return out;
  }

  if (kind === "categories") {
    if (has("name")) {
      out.name = text(input.name, 120);
      if (out.name.length < 2) {
        throw new BadRequestError("Nama kategori minimal 2 karakter");
      }
    }
    if (has("code")) out.code = codeField(input.code, "Kode kategori");
    if (has("kind")) {
      out.kind = text(input.kind, 20);
      if (CATEGORY_KINDS.indexOf(out.kind) < 0) {
        throw new BadRequestError("Jenis kategori tidak dikenal");
      }
    }
    if (input.is_active !== undefined) out.is_active = Boolean(input.is_active);
    return out;
  }

  if (kind === "policies") {
    if (has("name")) {
      out.name = text(input.name, 120);
      if (out.name.length < 2) {
        throw new BadRequestError("Nama kebijakan minimal 2 karakter");
      }
    }
    if (has("ticket_type")) {
      out.ticket_type = text(input.ticket_type, 30);
      if (TICKET_TYPES.indexOf(out.ticket_type) < 0) {
        throw new BadRequestError("Tipe tiket tidak dikenal");
      }
    }
    if (has("priority")) {
      out.priority = text(input.priority, 20);
      if (PRIORITIES.indexOf(out.priority) < 0) {
        throw new BadRequestError("Prioritas tidak dikenal");
      }
    }

    if (has("response_minutes")) {
      out.response_minutes = numberOr(input.response_minutes, 0);
      if (out.response_minutes < 1) {
        throw new BadRequestError("Batas respons minimal 1 menit");
      }
    }
    if (has("approval_minutes")) {
      out.approval_minutes = numberOr(input.approval_minutes, 0);
      if (out.approval_minutes < 0) {
        throw new BadRequestError("Batas approval tidak boleh negatif");
      }
    }
    if (has("resolution_minutes")) {
      out.resolution_minutes = numberOr(input.resolution_minutes, 0);
      if (out.resolution_minutes < 0) {
        throw new BadRequestError("Batas penyelesaian tidak boleh negatif");
      }
    }

    if (has("calendar_mode")) {
      out.calendar_mode = text(input.calendar_mode, 20);
      if (CALENDAR_MODES.indexOf(out.calendar_mode) < 0) {
        throw new BadRequestError("Mode kalender tidak dikenal");
      }
    }
    if (input.business_days !== undefined) {
      out.business_days = daysField(input.business_days);
    }
    if (has("business_start")) {
      out.business_start = timeField(input.business_start, "Jam mulai");
    }
    if (has("business_end")) {
      out.business_end = timeField(input.business_end, "Jam selesai");
    }

    if (has("version")) {
      out.version = numberOr(input.version, 1);
      if (out.version < 1) {
        throw new BadRequestError("Versi minimal 1");
      }
    }
    if (input.is_active !== undefined) out.is_active = Boolean(input.is_active);
    return out;
  }

  if (kind === "holidays") {
    if (has("date")) out.date = dateField(input.date);
    if (has("name")) {
      out.name = text(input.name, 120);
      if (out.name.length < 2) {
        throw new BadRequestError("Nama hari libur minimal 2 karakter");
      }
    }
    if (input.is_active !== undefined) out.is_active = Boolean(input.is_active);
    return out;
  }

  throw new BadRequestError("Jenis data master tidak dikenal");
}

// Aturan kombinasi yang hanya bisa diperiksa setelah semua field diketahui,
// dipakai baik untuk create maupun update (dengan nilai lama sebagai dasar).
function assertConsistent(kind, values) {
  if (kind !== "policies") return;

  if (values.calendar_mode === "business_hours") {
    if (values.business_start >= values.business_end) {
      throw new BadRequestError("Jam mulai harus lebih awal dari jam selesai");
    }
    if (!values.business_days || !values.business_days.length) {
      throw new BadRequestError("Pilih minimal satu hari kerja");
    }
  }
}

function serialize(kind, record) {
  var base = {
    id: record.id,
    name: String(record.get("name") || ""),
    is_active: Boolean(record.get("is_active")),
  };

  if (kind === "units") {
    base.code = String(record.get("code") || "");
    base.kind = String(record.get("kind") || "");
    base.manager = String(record.get("manager") || "");
    return base;
  }

  if (kind === "categories") {
    base.code = String(record.get("code") || "");
    base.kind = String(record.get("kind") || "");
    return base;
  }

  if (kind === "policies") {
    base.ticket_type = String(record.get("ticket_type") || "");
    base.priority = String(record.get("priority") || "");
    base.response_minutes = Number(record.get("response_minutes")) || 0;
    base.approval_minutes = Number(record.get("approval_minutes")) || 0;
    base.resolution_minutes = Number(record.get("resolution_minutes")) || 0;
    base.calendar_mode = String(record.get("calendar_mode") || "");
    base.business_days = record.get("business_days") || [];
    base.business_start = String(record.get("business_start") || "");
    base.business_end = String(record.get("business_end") || "");
    base.version = Number(record.get("version")) || 1;
    return base;
  }

  base.date = dateOnly(record.get("date"));
  return base;
}

// Filter keunikan per tenant. `excludeId` dipakai saat update.
function uniqueCheck(kind, tenantId, values, excludeId) {
  var filter = "";
  var params = { tenant: tenantId };

  if (kind === "units" || kind === "categories") {
    if (!values.code) return null;
    filter = "tenant = {:tenant} && code = {:code}";
    params.code = values.code;
  } else if (kind === "policies") {
    if (!values.ticket_type || !values.priority) return null;
    filter =
      "tenant = {:tenant} && ticket_type = {:type} && priority = {:priority}";
    params.type = values.ticket_type;
    params.priority = values.priority;
  } else if (kind === "holidays") {
    if (!values.date) return null;
    filter = "tenant = {:tenant} && date = {:date}";
    params.date = values.date;
  } else {
    return null;
  }

  if (excludeId) filter += ' && id != "' + String(excludeId) + '"';

  return { filter: filter, params: params };
}

module.exports = {
  KINDS: KINDS,
  UNIT_KINDS: UNIT_KINDS,
  CATEGORY_KINDS: CATEGORY_KINDS,
  TICKET_TYPES: TICKET_TYPES,
  PRIORITIES: PRIORITIES,
  CALENDAR_MODES: CALENDAR_MODES,
  normalize: normalize,
  assertConsistent: assertConsistent,
  serialize: serialize,
  uniqueCheck: uniqueCheck,
  dateOnly: dateOnly,
};
