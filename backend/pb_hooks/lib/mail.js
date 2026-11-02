// Email transaksional: konfigurasi SMTP dari environment, template, antrean,
// dan pengiriman.
//
// Alur:
// - Undangan akun dan reset password dikirim langsung (bukan antrean) supaya
//   password sementara tidak tersimpan lama di database. Bila SMTP belum aktif,
//   route tetap mengembalikan password agar IT Lead bisa menyerahkannya manual.
// - Notifikasi tiket masuk `email_outbox` dan dikirim cron `email_dispatch`.
//
// `MAIL_TRANSPORT=capture` dipakai suite test: email tidak keluar, tetapi
// salinannya tetap dicatat di outbox agar isi dan tautannya bisa diperiksa.

var MAX_ATTEMPTS = 5;
var RETRY_MINUTES = [1, 5, 15, 60, 240];
var OUTBOX_TTL_DAYS = 30;

function env(name) {
  try {
    return String($os.getenv(name) || "").trim();
  } catch (err) {
    return "";
  }
}

function transport() {
  return env("MAIL_TRANSPORT").toLowerCase() === "capture" ? "capture" : "smtp";
}

function appName(app) {
  return String(app.settings().meta.appName || "Healthcare ITSM");
}

function appUrl(app) {
  return String(app.settings().meta.appURL || "http://localhost:5173").replace(
    /\/+$/,
    ""
  );
}

function sender(app) {
  var meta = app.settings().meta;
  return {
    address: String(meta.senderAddress || "no-reply@itsm.local"),
    name: String(meta.senderName || appName(app)),
  };
}

function isConfigured(app) {
  var smtp = app.settings().smtp;
  return Boolean(smtp && smtp.enabled && String(smtp.host || ""));
}

function canSend(app) {
  return transport() === "capture" || isConfigured(app);
}

function pbDate(ms) {
  return new Date(ms).toISOString().replace("T", " ");
}

function maskError(err) {
  var text = String((err && err.message) || err || "Gagal mengirim email");
  return text.slice(0, 900);
}

// Terapkan konfigurasi dari environment saat boot. Env menang atas Admin UI
// supaya deployment (Docker/Mailtrap) bisa dikonfigurasi tanpa klik manual.
function applyEnv(app) {
  var host = env("SMTP_HOST");
  var fromAddress = env("SMTP_FROM");
  var fromName = env("SMTP_FROM_NAME");
  var url = env("APP_URL");
  var name = env("APP_NAME");

  if (!host && !fromAddress && !fromName && !url && !name) return false;

  var settings = app.settings();

  if (host) {
    settings.smtp.enabled = env("SMTP_ENABLED") !== "false";
    settings.smtp.host = host;
    settings.smtp.port = Number(env("SMTP_PORT") || "587");
    settings.smtp.username = env("SMTP_USERNAME");
    settings.smtp.password = env("SMTP_PASSWORD");
    settings.smtp.authMethod = (env("SMTP_AUTH_METHOD") || "PLAIN").toUpperCase();
    settings.smtp.tls = env("SMTP_TLS").toLowerCase() === "true";
    settings.smtp.localName = env("SMTP_LOCAL_NAME");
  }

  if (fromAddress) settings.meta.senderAddress = fromAddress;
  if (fromName) settings.meta.senderName = fromName;
  if (url) settings.meta.appURL = url;
  if (name) settings.meta.appName = name;

  try {
    app.save(settings);
    return true;
  } catch (err) {
    console.log("SMTP env tidak valid: " + String(err));
    return false;
  }
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function roleLabel(role) {
  if (role === "it_lead") return "IT Lead";
  if (role === "it_support") return "IT Support";
  if (role === "requester") return "Requester";
  return String(role || "Anggota tim");
}

function paragraph(text) {
  return (
    '<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#344563">' +
    text +
    "</p>"
  );
}

function detailsTable(rows) {
  var html =
    '<table role="presentation" cellpadding="0" cellspacing="0" ' +
    'style="width:100%;margin:0 0 20px;border-collapse:collapse">';

  for (var i = 0; i < rows.length; i++) {
    var label = escapeHtml(rows[i][0]);
    var value = rows[i][1];
    html +=
      '<tr><td style="padding:8px 0;border-bottom:1px solid #ebecf0;' +
      'font-size:13px;color:#6b778c;width:38%">' +
      label +
      '</td><td style="padding:8px 0;border-bottom:1px solid #ebecf0;' +
      'font-size:14px;color:#172b4d">' +
      value +
      "</td></tr>";
  }

  return html + "</table>";
}

function button(url, label) {
  return (
    '<table role="presentation" cellpadding="0" cellspacing="0" ' +
    'style="margin:8px 0 24px"><tr><td style="border-radius:6px;background:#0c66e4">' +
    '<a href="' +
    escapeHtml(url) +
    '" style="display:inline-block;padding:11px 20px;font-family:Arial,sans-serif;' +
    'font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">' +
    escapeHtml(label) +
    "</a></td></tr></table>"
  );
}

function layout(app, opts) {
  return (
    '<div style="margin:0;padding:24px 12px;background:#f4f5f7;' +
    'font-family:Arial,Helvetica,sans-serif">' +
    '<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dfe1e6;' +
    'border-radius:10px;padding:28px">' +
    '<div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;' +
    'color:#6b778c;margin-bottom:18px">' +
    escapeHtml(appName(app)) +
    "</div>" +
    '<h1 style="margin:0 0 12px;font-size:21px;line-height:1.3;color:#172b4d">' +
    escapeHtml(opts.title) +
    "</h1>" +
    paragraph(opts.intro) +
    (opts.body || "") +
    (opts.ctaUrl ? button(opts.ctaUrl, opts.ctaLabel || "Buka") : "") +
    '<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #ebecf0;' +
    'font-size:12px;line-height:1.6;color:#6b778c">' +
    (opts.footer || "") +
    "</p>" +
    "</div></div>"
  );
}

function credentialEmail(app, opts) {
  var tenantName = "";

  try {
    tenantName = String(
      app.findRecordById("tenants", String(opts.tenantId || "")).get("name") || ""
    );
  } catch (err) {
    tenantName = "";
  }

  var isInvite = opts.kind === "invitation";
  var title = isInvite ? "Undangan akses " + appName(app) : "Password baru";
  var intro = isInvite
    ? escapeHtml(String(opts.inviterName || "IT Lead")) +
      " mengundang Anda bergabung sebagai " +
      escapeHtml(roleLabel(opts.role)) +
      (tenantName ? " di " + escapeHtml(tenantName) : "") +
      "."
    : "Password akun Anda telah direset oleh " +
      escapeHtml(String(opts.inviterName || "IT Lead")) +
      ".";

  var rows = [
    ["Email", escapeHtml(opts.email)],
    [
      isInvite ? "Password awal" : "Password baru",
      '<code style="display:inline-block;padding:4px 8px;border-radius:4px;' +
        'background:#f4f5f7;border:1px solid #dfe1e6;font-size:14px;' +
        'letter-spacing:.04em">' +
        escapeHtml(opts.password) +
        "</code>",
    ],
    ["Peran", escapeHtml(roleLabel(opts.role))],
  ];

  if (tenantName) rows.push(["Rumah sakit", escapeHtml(tenantName)]);

  var html = layout(app, {
    title: title,
    intro: intro,
    body:
      detailsTable(rows) +
      paragraph(
        "Masuk dengan email dan password di atas. Anda wajib mengganti password " +
          "saat login pertama."
      ),
    ctaUrl: appUrl(app) + "/login",
    ctaLabel: "Masuk dan ganti password",
    footer:
      "Email ini hanya ditampilkan sekali. Jangan teruskan pesan ini. " +
      "Bila Anda tidak mengenal pengirimnya, abaikan email ini.",
  });

  var text =
    (isInvite ? "Undangan akses " : "Password baru ") +
    appName(app) +
    "\n\n" +
    (isInvite
      ? String(opts.inviterName || "IT Lead") +
        " mengundang Anda bergabung sebagai " +
        roleLabel(opts.role) +
        (tenantName ? " di " + tenantName : "") +
        "."
      : "Password akun Anda telah direset oleh " +
        String(opts.inviterName || "IT Lead") +
        ".") +
    "\n\nEmail: " +
    opts.email +
    "\n" +
    (isInvite ? "Password awal" : "Password baru") +
    ": " +
    opts.password +
    "\nPeran: " +
    roleLabel(opts.role) +
    (tenantName ? "\nRumah sakit: " + tenantName : "") +
    "\n\nMasuk di " +
    appUrl(app) +
    "/login dan ganti password saat login pertama.";

  return {
    subject:
      (isInvite ? "Undangan akses " : "Password baru ") +
      appName(app) +
      (tenantName ? " — " + tenantName : ""),
    html: html,
    text: text,
  };
}

function saveOutbox(app, opts, status) {
  var collection = app.findCollectionByNameOrId("email_outbox");
  var record = new Record(collection);

  if (opts.tenantId) record.set("tenant", String(opts.tenantId));
  if (opts.userId) record.set("user", String(opts.userId));
  if (opts.ticketId) record.set("ticket", String(opts.ticketId));
  record.set("to", String(opts.to).toLowerCase());
  record.set("recipient_name", String(opts.recipientName || "").slice(0, 200));
  record.set("subject", String(opts.subject || "").slice(0, 300));
  record.set("html", String(opts.html || ""));
  record.set("text", String(opts.text || ""));
  record.set("template", opts.template);
  record.set("event", String(opts.event || "").slice(0, 50));
  record.set("status", status);
  record.set("attempts", 0);
  record.set("last_error", "");

  if (status === "sent") record.set("sent_at", pbDate(Date.now()));

  app.save(record);
  return record;
}

// Email berisi password sementara: kirim langsung, jangan simpan di antrean.
// Pada mode capture, simpan salinan sebagai `sent` agar test bisa memeriksa isi.
function sendCredential(app, opts) {
  var result = {
    configured: isConfigured(app),
    sent: false,
    transport: transport(),
  };

  if (!canSend(app)) return result;

  var content = credentialEmail(app, opts);

  if (transport() === "capture") {
    saveOutbox(
      app,
      {
        tenantId: opts.tenantId,
        userId: opts.userId,
        to: opts.email,
        recipientName: opts.name,
        subject: content.subject,
        html: content.html,
        text: content.text,
        template: opts.kind,
      },
      "sent"
    );

    result.sent = true;
    return result;
  }

  try {
    var from = sender(app);
    var message = new MailerMessage({
      from: { address: from.address, name: from.name },
      to: [{ address: String(opts.email), name: String(opts.name || "") }],
      subject: content.subject,
      html: content.html,
      text: content.text,
    });

    app.newMailClient().send(message);
    result.sent = true;
  } catch (err) {
    result.error = maskError(err);
    console.log("Gagal mengirim email " + opts.kind + ": " + result.error);
  }

  return result;
}

function notificationContent(app, opts) {
  var ticketNo = "";
  var ticketTitle = "";
  var tenantName = "";

  if (opts.ticketId) {
    try {
      var ticket = app.findRecordById("tickets", String(opts.ticketId));
      ticketNo = String(ticket.get("ticket_no") || "");
      ticketTitle = String(ticket.get("title") || "");
    } catch (err) {
      ticketNo = "";
    }
  }

  if (opts.tenantId) {
    try {
      tenantName = String(
        app.findRecordById("tenants", String(opts.tenantId)).get("name") || ""
      );
    } catch (err) {
      tenantName = "";
    }
  }

  var subject = ticketNo
    ? "[" + ticketNo + "] " + String(opts.title || "Pembaruan tiket")
    : String(opts.title || "Pembaruan tiket") + " — " + appName(app);

  var intro =
    "Halo " +
    escapeHtml(String(opts.recipientName || "")) +
    ", ada pembaruan pada " +
    (ticketNo ? "tiket berikut." : "akun Anda.");

  var body = "";

  if (ticketNo) {
    body += detailsTable([
      ["Tiket", escapeHtml(ticketNo)],
      ["Judul", escapeHtml(ticketTitle)],
      ["Rumah sakit", escapeHtml(tenantName || "—")],
    ]);
  }

  body += paragraph(escapeHtml(String(opts.body || "")));

  var url = opts.ticketId
    ? appUrl(app) + "/tickets/" + String(opts.ticketId)
    : appUrl(app) + "/notifications";

  var html = layout(app, {
    title: String(opts.title || "Pembaruan tiket"),
    intro: intro,
    body: body,
    ctaUrl: url,
    ctaLabel: opts.ticketId ? "Buka tiket" : "Lihat notifikasi",
    footer:
      "Email ini dikirim karena Anda terdaftar sebagai staf " +
      escapeHtml(tenantName || appName(app)) +
      '. <a href="' +
      escapeHtml(appUrl(app)) +
      '/profile" style="color:#6b778c">Ubah preferensi email</a>.',
  });

  var text =
    "Halo " +
    String(opts.recipientName || "") +
    ",\n\n" +
    String(opts.title || "Pembaruan tiket") +
    (ticketNo ? "\n" + ticketNo + " · " + ticketTitle : "") +
    "\n" +
    String(opts.body || "") +
    "\n\n" +
    url +
    "\n\nUbah preferensi email di " +
    appUrl(app) +
    "/profile";

  return { subject: subject, html: html, text: text };
}

// Dipanggil dari lib/notify.js untuk setiap notifikasi in-app.
function enqueueNotification(app, opts) {
  if (!opts || !opts.user || !opts.tenant) return null;

  var user;

  try {
    user = app.findRecordById("users", String(opts.user));
  } catch (err) {
    return null;
  }

  if (!user || !Boolean(user.get("is_active"))) return null;
  if (Boolean(user.get("email_opt_out"))) return null;

  var to = String(user.get("email") || "");
  if (!to) return null;

  var recipientName = String(user.get("name") || "");
  var content = notificationContent(app, {
    tenantId: opts.tenant,
    ticketId: opts.ticket,
    recipientName: recipientName,
    title: opts.title,
    body: opts.body,
  });

  var record = saveOutbox(
    app,
    {
      tenantId: opts.tenant,
      userId: user.id,
      ticketId: opts.ticket,
      to: to,
      recipientName: recipientName,
      subject: content.subject,
      html: content.html,
      text: content.text,
      template: "notification",
      event: opts.type,
    },
    "queued"
  );

  return record;
}

function sendOutbox(app, record) {
  var from = sender(app);
  var message = new MailerMessage({
    from: { address: from.address, name: from.name },
    to: [{ address: String(record.get("to")), name: String(record.get("recipient_name") || "") }],
    subject: String(record.get("subject") || ""),
    html: String(record.get("html") || ""),
    text: String(record.get("text") || ""),
  });

  app.newMailClient().send(message);
}

function cleanup(app) {
  var cutoff = pbDate(Date.now() - OUTBOX_TTL_DAYS * 24 * 60 * 60 * 1000);
  var old = app.findRecordsByFilter(
    "email_outbox",
    'status = "sent" && sent_at != "" && sent_at <= {:cutoff}',
    "sent_at",
    100,
    0,
    { cutoff: cutoff }
  );

  for (var i = 0; i < old.length; i++) {
    try {
      app.delete(old[i]);
    } catch (err) {
      // best effort
    }
  }
}

function dispatch(app, limit) {
  var max = Number(limit) || 20;
  cleanup(app);

  if (!canSend(app)) {
    return { sent: 0, failed: 0, skipped: "smtp_disabled" };
  }

  var now = pbDate(Date.now());
  var rows = app.findRecordsByFilter(
    "email_outbox",
    'status = "queued" && (next_attempt_at = "" || next_attempt_at <= {:now})',
    "created",
    max,
    0,
    { now: now }
  );

  var sent = 0;
  var failed = 0;

  for (var i = 0; i < rows.length; i++) {
    var record = rows[i];
    var attempts = Number(record.get("attempts")) || 0;

    try {
      if (transport() !== "capture") sendOutbox(app, record);

      record.set("status", "sent");
      record.set("sent_at", pbDate(Date.now()));
      record.set("last_error", "");
      record.set("attempts", attempts);
      app.save(record);
      sent += 1;
    } catch (err) {
      attempts += 1;
      record.set("attempts", attempts);
      record.set("last_error", maskError(err));

      if (attempts >= MAX_ATTEMPTS) {
        record.set("status", "failed");
        failed += 1;
      } else {
        var minutes = RETRY_MINUTES[Math.min(attempts - 1, RETRY_MINUTES.length - 1)];
        record.set("next_attempt_at", pbDate(Date.now() + minutes * 60 * 1000));
      }

      app.save(record);
      console.log(
        "Email " + record.id + " gagal (percobaan " + attempts + "): " +
          String(record.get("last_error"))
      );
    }
  }

  return { sent: sent, failed: failed, pending: rows.length - sent - failed };
}

function status(app, opts) {
  var tenantId = String((opts && opts.tenantId) || "");
  var params = tenantId ? { tenant: tenantId } : {};
  var tenantFilter = tenantId ? "tenant = {:tenant} && " : "";

  function count(statusValue) {
    var query = { status: statusValue };
    if (tenantId) query.tenant = tenantId;

    var rows = app.findRecordsByFilter(
      "email_outbox",
      tenantFilter + "status = {:status}",
      "-created",
      500,
      0,
      query
    );

    return rows.length;
  }

  var latestFailed = app.findRecordsByFilter(
    "email_outbox",
    tenantFilter + 'status = "failed"',
    "-created",
    1,
    0,
    params
  );

  var smtp = app.settings().smtp;

  return {
    configured: isConfigured(app),
    can_send: canSend(app),
    transport: transport(),
    host: String(smtp.host || ""),
    port: Number(smtp.port) || 0,
    from: String(app.settings().meta.senderAddress || ""),
    app_url: appUrl(app),
    queued: count("queued"),
    failed: count("failed"),
    last_error: latestFailed.length
      ? String(latestFailed[0].get("last_error") || "")
      : "",
  };
}

module.exports = {
  applyEnv: applyEnv,
  transport: transport,
  isConfigured: isConfigured,
  canSend: canSend,
  sendCredential: sendCredential,
  enqueueNotification: enqueueNotification,
  dispatch: dispatch,
  status: status,
  roleLabel: roleLabel,
};
