// Pembuat tiket demo: memilih skenario, menjalankan alur bisnis lewat API
// (approval, assign, komentar, transisi, CSAT), lalu menyiapkan rencana waktu
// untuk diproses route /api/itsm/dev/seed/age.
import { DAY, HOUR, MINUTE, iso } from "./util.mjs";
import {
  REQUESTERS_BY_UNIT,
  TICKET_STORIES,
  UNITS,
} from "./content.mjs";

const PRIORITY_BY_IMPACT = {
  patient_safety: "critical",
  clinical_workflow: "high",
  operational: "normal",
  convenience: "low",
};

const RESOLUTION_MINUTES = {
  incident: {
    critical: [40, 300],
    high: [45, 420],
    normal: [60, 600],
    low: [90, 900],
  },
  service_request: {
    critical: [60, 420],
    high: [90, 720],
    normal: [120, 1440],
    low: [180, 2160],
  },
  change_request: {
    critical: [90, 480],
    high: [120, 1440],
    normal: [180, 2160],
    low: [240, 2880],
  },
};

const SLA_RESOLUTION = {
  incident: { critical: 240, high: 480, normal: 960, low: 2400 },
  service_request: { critical: 480, high: 960, normal: 1920, low: 2400 },
  change_request: { critical: 0, high: 0, normal: 0, low: 0 },
};

const SLA_RESPONSE = { critical: 15, high: 30, normal: 120, low: 480 };

const RESPONSE_MINUTES = {
  critical: [2, 12],
  high: [4, 25],
  normal: [10, 60],
  low: [20, 120],
};

const TEAM_ASSIGNEE = {
  application: "resolverApp",
  network: "resolverNet",
  hardware: "resolverHw",
  database: "resolverDb",
  biomedical: "resolverBio",
  service_desk: "support",
  other: "support",
};

const STATE_SEQUENCE = [
  "open",
  "assigned",
  "in_progress",
  "waiting",
  "resolved",
  "closed",
  "approval_pending",
  "approval_rejected",
  "in_progress",
  "resolved",
  "closed",
  "reopened",
  "open",
  "assigned",
  "approval_pending",
  "resolved",
  "closed",
  "in_progress",
  "waiting",
  "closed",
  "resolved",
  "open",
  "assigned",
  "in_progress",
  "resolved",
  "closed",
  "approval_pending",
  "reopened",
  "closed",
  "in_progress",
];

const TINY_PLAN = [
  { state: "open", type: "incident" },
  { state: "approval_pending", type: "service_request" },
  { state: "in_progress", type: "incident" },
  { state: "waiting", type: "incident" },
  { state: "approval_rejected", type: "service_request" },
  { state: "approval_pending", type: "change_request" },
  { state: "resolved", type: "incident" },
  { state: "assigned", type: "incident" },
  { state: "reopened", type: "incident" },
  { state: "closed", type: "service_request" },
];

const TYPE_CYCLE = [
  "incident",
  "incident",
  "service_request",
  "incident",
  "change_request",
  "incident",
  "service_request",
  "incident",
  "incident",
  "change_request",
];

const QR_STATES = ["open", "assigned", "in_progress", "resolved"];

const SOURCES = [
  { value: "web", weight: 80 },
  { value: "phone", weight: 10 },
  { value: "email", weight: 6 },
  { value: "whatsapp", weight: 4 },
];

const WORK_STATES = [
  "assigned",
  "in_progress",
  "waiting",
  "resolved",
  "closed",
  "reopened",
];

const STARTED_STATES = ["in_progress", "waiting", "resolved", "closed", "reopened"];
const DONE_STATES = ["resolved", "closed", "reopened"];

function weightedPick(rng, entries) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let point = rng.next() * total;

  for (const entry of entries) {
    point -= entry.weight;
    if (point <= 0) return entry;
  }

  return entries[entries.length - 1];
}

function approvalModeFor(ctx, story) {
  if (story.type === "incident") return "none";
  if (!story.item) return "default";

  const item = ctx.items[story.item];
  return item ? String(item.approval_mode || "lead") : "lead";
}

function storiesFor(type, requireApproval) {
  return TICKET_STORIES.filter(
    (story) => story.type === type && (!requireApproval || approvalModeNeedsSteps(story))
  );
}

function approvalModeNeedsSteps(story) {
  if (story.type === "incident") return false;
  if (!story.item) return true;
  return story.item !== "RESET-PASSWORD" && story.item !== "PERBAIKAN-PERANGKAT";
}

function requesterKeyFor(unitCode, rng) {
  const list = REQUESTERS_BY_UNIT[unitCode] || REQUESTERS_BY_UNIT.MGT;
  return rng.pick(list);
}

function managerKeyFor(unitCode) {
  const unit = UNITS[unitCode];
  return unit ? unit.manager : "managerMgt";
}

function assigneeFor(story, ctx) {
  if (story.assignee) return story.assignee;

  const service = ctx.services[story.service];
  const team = service ? service.team : "other";
  return TEAM_ASSIGNEE[team] || "support";
}

function workingHour(ms, rng) {
  const wib = new Date(ms + 7 * HOUR);
  const hour = rng.int(7, 20);
  const minute = rng.int(0, 59);
  wib.setUTCHours(hour, minute, rng.int(0, 59), 0);
  return wib.getTime() - 7 * HOUR;
}

function pickState(index, profile, rng) {
  if (profile.key === "tiny" && index < TINY_PLAN.length) {
    return TINY_PLAN[index];
  }

  const state = STATE_SEQUENCE[index % STATE_SEQUENCE.length];

  if (state === "approval_pending" || state === "approval_rejected") {
    return {
      state,
      type: index % 2 === 0 ? "service_request" : "change_request",
    };
  }

  return {
    state,
    type: TYPE_CYCLE[index % TYPE_CYCLE.length],
  };
}

function buildTimeline(plan, rng, now, days) {
  const type = plan.type;
  const priority = PRIORITY_BY_IMPACT[plan.story.impact] || "normal";
  const resolutionRange = RESOLUTION_MINUTES[type][priority];
  const state = plan.state;
  const needsApproval = plan.approvalMode !== "none";
  const slaMinutes = SLA_RESOLUTION[type][priority];
  const activeState = !DONE_STATES.includes(state);

  const minAgeDays =
    {
      closed: 2.2,
      resolved: 0.4,
      reopened: 3,
      approval_rejected: 1,
      approval_pending: 0.2,
      waiting: 0.25,
      in_progress: 0.15,
      assigned: 0.1,
      open: 0,
    }[state] || 0;

  let maxAgeDays =
    {
      closed: days,
      resolved: days * 0.85,
      reopened: days * 0.75,
      approval_rejected: Math.min(days, 18),
      approval_pending: Math.min(days, 14),
      waiting: Math.min(days, 20),
      in_progress: Math.min(days, 18),
      assigned: Math.min(days, 12),
      open: Math.min(days, 10),
    }[state] || days;

  // Tiket yang masih aktif wajar berumur pendek; kalau tidak, hampir semuanya
  // akan breach dan dashboard tidak lagi menggambarkan operasi normal.
  if (activeState && slaMinutes > 0 && state !== "waiting") {
    const slaDays = slaMinutes / 1440;
    maxAgeDays = Math.min(
      maxAgeDays,
      Math.max(0.05, slaDays * (0.7 + rng.next() * 0.9))
    );
  }

  const lower = Math.min(minAgeDays, maxAgeDays);
  const ageDays =
    lower + Math.pow(rng.next(), 1.7) * Math.max(0.05, maxAgeDays - lower);
  let createdMs = workingHour(
    Math.round(now - ageDays * DAY - rng.int(0, 9) * HOUR),
    rng
  );

  if (createdMs > now - 45 * MINUTE) createdMs -= DAY;

  const responseDelay =
    rng.int(RESPONSE_MINUTES[priority][0], RESPONSE_MINUTES[priority][1]) *
    MINUTE;
  const assignDelay = rng.int(2, 60) * MINUTE;
  const approvalDelay = rng.int(20, 240) * MINUTE;

  let assignedMs = createdMs + assignDelay;
  let firstResponseMs = createdMs + responseDelay;
  let startMs =
    Math.max(assignedMs, firstResponseMs) + rng.int(5, 60) * MINUTE;
  let waitingMs = 0;
  let resumeMs = 0;
  let resolvedMs = 0;
  let closedMs = 0;
  let reopenedMs = 0;
  let pausedMinutes = 0;

  if (needsApproval) startMs += approvalDelay;

  const resolutionMinutes = rng.int(resolutionRange[0], resolutionRange[1]);
  let approvalLastMs = createdMs + rng.int(30, 240) * MINUTE;

  if (DONE_STATES.includes(state)) {
    if (rng.chance(0.2)) {
      waitingMs = startMs + rng.int(20, 180) * MINUTE;
      resumeMs = waitingMs + rng.int(45, 300) * MINUTE;
      pausedMinutes = Math.round((resumeMs - waitingMs) / MINUTE);
      resolvedMs = resumeMs + resolutionMinutes * MINUTE;
    } else {
      resolvedMs = startMs + resolutionMinutes * MINUTE;
    }

    if (state === "closed") {
      closedMs = resolvedMs + rng.int(15, 480) * MINUTE;
    }

    if (state === "reopened") {
      closedMs = resolvedMs + rng.int(30, 600) * MINUTE;
      reopenedMs = closedMs + rng.int(30, 1440) * MINUTE;
    }
  } else if (state === "waiting") {
    waitingMs = startMs + rng.int(20, 180) * MINUTE;
  }

  const usedEvents = [createdMs];

  if (WORK_STATES.includes(state)) {
    usedEvents.push(assignedMs);
    usedEvents.push(firstResponseMs);
  }
  if (STARTED_STATES.includes(state)) usedEvents.push(startMs);
  if (waitingMs) usedEvents.push(waitingMs);
  if (resumeMs) usedEvents.push(resumeMs);
  if (resolvedMs) usedEvents.push(resolvedMs);
  if (closedMs) usedEvents.push(closedMs);
  if (reopenedMs) usedEvents.push(reopenedMs);
  if (state === "approval_pending" || state === "approval_rejected") {
    usedEvents.push(approvalLastMs);
  }
  if (state === "open" || state === "assigned") {
    usedEvents.push(createdMs + rng.int(5, 90) * MINUTE);
  }

  const latest = Math.max(...usedEvents);
  const limit = now - 8 * MINUTE;
  let overflow = 0;

  if (latest > limit) {
    overflow = latest - limit;
    createdMs -= overflow;
    assignedMs -= overflow;
    firstResponseMs -= overflow;
    startMs -= overflow;
    approvalLastMs -= overflow;
    if (waitingMs) waitingMs -= overflow;
    if (resumeMs) resumeMs -= overflow;
    if (resolvedMs) resolvedMs -= overflow;
    if (closedMs) closedMs -= overflow;
    if (reopenedMs) reopenedMs -= overflow;
  }

  plan.createdMs = createdMs;
  plan.assignedMs = assignedMs;
  plan.firstResponseMs = firstResponseMs;
  plan.startMs = startMs;
  plan.waitingMs = waitingMs;
  plan.resumeMs = resumeMs;
  plan.resolvedMs = resolvedMs;
  plan.closedMs = closedMs;
  plan.reopenedMs = reopenedMs;
  plan.approvalLastMs = approvalLastMs;
  plan.pausedMinutes = pausedMinutes;
  plan.priority = priority;

  const lastActivity = Math.max(
    createdMs,
    WORK_STATES.includes(state) ? assignedMs : 0,
    STARTED_STATES.includes(state) ? startMs : 0,
    waitingMs,
    resumeMs,
    resolvedMs,
    closedMs,
    reopenedMs,
    state === "approval_pending" || state === "approval_rejected"
      ? approvalLastMs
      : 0,
    state === "open" ? createdMs + rng.int(5, 90) * MINUTE : 0
  );

  plan.lastActivityMs = lastActivity;

  const workedState = STARTED_STATES.includes(state);
  plan.showFirstResponse = workedState;

  // Simulasi breach SLA.
  const breaches = {};
  const resolutionMinutesActual = resolvedMs
    ? Math.round((resolvedMs - createdMs) / MINUTE)
    : 0;
  const ageMinutes = Math.round((now - createdMs) / MINUTE);

  if (slaMinutes > 0 && resolvedMs) {
    if (resolutionMinutesActual > slaMinutes * 0.95 || rng.chance(0.12)) {
      breaches.resolution = true;
    }
  } else if (slaMinutes > 0 && activeState && state !== "waiting") {
    if (ageMinutes > slaMinutes * 1.05 || rng.chance(0.1)) {
      breaches.resolution = true;
      breaches.escalation_level = ageMinutes > slaMinutes + 240 ? 3 : 2;
    }
  }

  if (workedState) {
    const responseMinutes = Math.round(
      (firstResponseMs - createdMs) / MINUTE
    );
    if (responseMinutes > SLA_RESPONSE[priority] * 1.2 || rng.chance(0.04)) {
      breaches.response = true;
    }
  } else if (
    activeState &&
    ageMinutes > SLA_RESPONSE[priority] * 2 &&
    rng.chance(0.35)
  ) {
    breaches.response = true;
    if (!breaches.escalation_level) breaches.escalation_level = 1;
  }

  if (state === "approval_pending" && ageMinutes > 1440) {
    breaches.approval = true;
    if (!breaches.escalation_level) breaches.escalation_level = 1;
  }

  if (breaches.resolution && resolvedMs && breaches.escalation_level) {
    delete breaches.escalation_level;
  }

  plan.breaches = breaches;
}

export function buildPlans(ctx) {
  const { profile, opts, rng } = ctx;
  const days = opts.days || profile.days;
  const total = ctx.ticketCount || opts.tickets || profile.tickets;
  const now = Date.now();
  const cursor = { incident: 0, service_request: 0, change_request: 0 };
  const plans = [];

  for (let index = 0; index < total; index += 1) {
    const picked = pickState(index, profile, rng);
    const state = picked.state;
    const type = picked.type;
    const requireApproval =
      state === "approval_pending" || state === "approval_rejected";

    const pool = storiesFor(type, requireApproval);
    let list = pool.length ? pool : storiesFor(type, false);

    // Change Request tanpa item memakai alur default (manajer -> Lead -> CAB),
    // sehingga tahap CAB ikut terlihat pada data demo.
    if (type === "change_request" && requireApproval) {
      const defaults = list.filter((story) => !story.item);
      if (defaults.length) list = defaults;
    }

    const story = list[cursor[type] % list.length];
    cursor[type] += 1;

    const unitCode = story.unit;
    const requesterKey = requesterKeyFor(unitCode, rng);
    const assigneeKey = assigneeFor(story, ctx);
    const managerKey = managerKeyFor(unitCode);
    const source = weightedPick(rng, SOURCES).value;
    const staffCreated = source !== "web";
    const creatorKey = staffCreated ? "support" : requesterKey;
    const onBehalf = staffCreated && creatorKey !== requesterKey;

    const plan = {
      index,
      story,
      storyKey: story.key,
      type: story.type,
      state,
      unitCode,
      requesterKey,
      assigneeKey,
      managerKey,
      managerUserId: ctx.users[managerKey] ? ctx.users[managerKey].id : "",
      requesterId: ctx.users[requesterKey] ? ctx.users[requesterKey].id : "",
      assigneeId: ctx.users[assigneeKey] ? ctx.users[assigneeKey].id : "",
      creatorKey,
      source,
      onBehalf,
      reporterName: onBehalf ? ctx.users[requesterKey].name : "",
      reporterContact: onBehalf
        ? rng.pick([
            `ext. ${rng.int(1000, 1999)}`,
            `+62 812-${rng.int(1000, 9999)}-${rng.int(1000, 9999)}`,
            ctx.users[requesterKey].email,
          ])
        : "",
      approvalMode: approvalModeFor(ctx, story),
      attachment: rng.chance(0.07),
      changeOutcome: rng.pick(["successful", "successful", "successful", "partial"]),
      csv: false,
      staffPublicComment: false,
      delegated: rng.chance(0.12),
    };

    buildTimeline(plan, rng, now, days);
    plans.push(plan);
  }

  return plans;
}

export function buildQrPlans(ctx, count) {
  const plans = [];
  const points = ctx.points || [];
  if (!points.length || count <= 0) return plans;

  const qrStories = TICKET_STORIES.filter(
    (story) => story.type === "incident"
  );

  for (let index = 0; index < count; index += 1) {
    const point = points[index % points.length];
    const unitCode = pointUnitCode(ctx, point);
    const candidates = qrStories.filter((story) => story.unit === unitCode);
    const list = candidates.length ? candidates : qrStories;
    const story = list[index % list.length];
    const state = QR_STATES[index % QR_STATES.length];
    const now = Date.now();
    const days = ctx.opts.days || ctx.profile.days;
    let createdMs =
      now - ctx.rng.int(0, Math.min(days, 10)) * DAY - ctx.rng.int(0, 8) * HOUR;

    if (createdMs > now - 3 * HOUR) createdMs = now - 3 * HOUR;

    const assignedMs = Math.min(
      createdMs + ctx.rng.int(10, 90) * MINUTE,
      now - 2 * MINUTE
    );
    const firstResponseMs = Math.min(
      createdMs + ctx.rng.int(5, 60) * MINUTE,
      now - MINUTE
    );
    let startMs = Math.min(
      Math.max(assignedMs, firstResponseMs) + ctx.rng.int(10, 120) * MINUTE,
      now - MINUTE
    );
    let resolvedMs =
      state === "resolved"
        ? Math.min(
            now - 10 * MINUTE,
            startMs + ctx.rng.int(30, 240) * MINUTE
          )
        : 0;

    if (resolvedMs && resolvedMs <= startMs) {
      resolvedMs = Math.min(now - 2 * MINUTE, startMs + 15 * MINUTE);
    }
    if (startMs >= resolvedMs && resolvedMs) {
      startMs = resolvedMs - 15 * MINUTE;
    }

    const plan = {
      index: 100000 + index,
      story,
      storyKey: story.key,
      type: story.type,
      state,
      unitCode,
      requesterKey: "",
      requesterId: "",
      assigneeKey: story.assignee || "support",
      creatorKey: "support",
      source: "web",
      onBehalf: false,
      reporterName: ctx.rng.pick([
        "Siti Rahmawati",
        "Ahmad Fauzi",
        "Nur Aisyah",
        "Budi Kurniawan",
      ]),
      reporterContact: `+62 813-${ctx.rng.int(1000, 9999)}-${ctx.rng.int(1000, 9999)}`,
      approvalMode: "none",
      attachment: false,
      csv: false,
      qr: true,
      point,
      staffPublicComment: true,
      createdMs,
      assignedMs,
      firstResponseMs,
      startMs,
      resolvedMs: resolvedMs ? Math.min(resolvedMs, now - 10 * MINUTE) : 0,
      closedMs: 0,
      reopenedMs: 0,
      waitingMs: 0,
      resumeMs: 0,
      pausedMinutes: 0,
      priority: PRIORITY_BY_IMPACT[story.impact] || "normal",
      breaches: {},
    };

    plan.assigneeId = ctx.users[plan.assigneeKey]
      ? ctx.users[plan.assigneeKey].id
      : "";
    plan.lastActivityMs = Math.max(
      plan.createdMs,
      plan.assignedMs || 0,
      plan.startMs || 0,
      plan.resolvedMs || 0
    );

    plans.push(plan);
  }

  return plans;
}

function pointUnitCode(ctx, point) {
  for (const [code, unit] of Object.entries(ctx.units)) {
    if (unit.id === point.unit) return code;
  }

  return "IGD";
}

// ---------------------------------------------------------------------------
// Eksekusi alur tiket
// ---------------------------------------------------------------------------

function sessionFor(ctx, key) {
  if (!key) throw new Error("Sesi pengguna tidak tersedia");

  const client = ctx.sessions[key];
  if (!client) throw new Error(`Sesi ${key} tidak ditemukan`);

  return client;
}

async function createTicket(ctx, plan) {
  const story = plan.story;
  const unit = ctx.units[plan.unitCode];
  const service = ctx.services[story.service];
  const item = story.item ? ctx.items[story.item] : null;
  const asset = story.asset ? ctx.assets[story.asset] : null;
  const category = story.category ? ctx.categories[story.category] : null;
  const session = sessionFor(ctx, plan.creatorKey);

  const body = {
    type: story.type,
    title: story.title,
    description: story.description,
    impact: story.impact,
    source: plan.source,
    patient_data_confirmed: true,
  };

  if (unit) body.location = story.location || "";
  if (category) body.category = category.id;
  if (service) body.service = service.id;
  if (item) body.service_item = item.id;
  if (asset) body.asset_id = asset.id;

  if (plan.onBehalf) {
    body.requested_for = plan.requesterId;
    body.reporter_name = plan.reporterName;
    body.reporter_contact = plan.reporterContact;
  }

  if (story.type === "change_request") {
    if (story.changeRisk) body.change_risk = story.changeRisk;
    if (story.changePlan) body.implementation_plan = story.changePlan;
    if (story.rollbackPlan) body.rollback_plan = story.rollbackPlan;
    body.planned_start = iso(Date.now() + 2 * DAY);
    body.planned_end = iso(Date.now() + 2 * DAY + 4 * HOUR);
  }

  const created = await session.json("POST", "/api/itsm/tickets", { body });
  return created;
}

async function createQrTicket(ctx, plan, point) {
  const story = plan.story;
  const service = ctx.services[story.service];

  const response = await fetch(
    `${ctx.baseUrl}/api/itsm/public/intake/${point.token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: story.type,
        title: story.title,
        description: `${story.description} Dilaporkan dari titik QR ${point.name}.`,
        impact: story.impact,
        patient_data_confirmed: true,
        reporter_name: plan.reporterName,
        reporter_contact: plan.reporterContact,
        service: service.id,
        location: story.location || point.location,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `QR intake gagal (${response.status}): ${JSON.stringify(data).slice(0, 300)}`
    );
  }

  const record = await ctx.admin.findOne(
    "tickets",
    `tenant="${ctx.tenant.id}" && ticket_no="${data.ticket_no}"`
  );

  if (!record) throw new Error("Tiket QR tidak ditemukan setelah dibuat");

  return record;
}

async function postComment(ctx, plan, actorKey, text, visibility = "public") {
  const client = sessionFor(ctx, actorKey);

  return client.json("POST", `/api/itsm/tickets/${plan.ticketId}/comments`, {
    body: { body: text, visibility },
  });
}

async function attachFile(ctx, plan, actorKey) {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), "screenshot-error.png");
  form.append("visibility", "public");

  await sessionFor(ctx, actorKey).request(
    "POST",
    `/api/itsm/tickets/${plan.ticketId}/attachments`,
    { form }
  );
}

function actorKeyForStep(ctx, step, fallback = "lead") {
  const kind = String(step.kind || "");
  const approverKey = ctx.userKeyById[step.approver] || "";

  if (kind === "cab") return "lead2";
  if (kind === "unit_manager") return approverKey || fallback;
  if (kind === "it_lead") return approverKey || fallback;

  return fallback;
}

async function approveSteps(ctx, plan, steps) {
  const decided = [];
  const hasCab = steps.some((step) => String(step.kind) === "cab");
  let delegated = false;

  for (const step of steps) {
    const kind = String(step.kind || "");

    if (
      plan.delegated &&
      !hasCab &&
      !delegated &&
      kind === "it_lead" &&
      ctx.users.lead2
    ) {
      try {
        await sessionFor(ctx, "lead").json(
          "POST",
          `/api/itsm/tickets/${plan.ticketId}/approval`,
          {
            body: {
              decision: "delegated",
              delegate: ctx.users.lead2.id,
              note: "Lead sedang dinas luar, approval didelegasikan sementara.",
            },
          }
        );
        step.approver = ctx.users.lead2.id;
        delegated = true;
      } catch (error) {
        ctx.log.warn(`Delegasi ${plan.storyKey} gagal: ${error.message}`);
      }
    }

    const actorKey = actorKeyForStep(ctx, step);

    await sessionFor(ctx, actorKey).json(
      "POST",
      `/api/itsm/tickets/${plan.ticketId}/approval`,
      {
        body: {
          decision: "approved",
          note: "Disetujui sesuai kebutuhan operasional.",
        },
      }
    );
    decided.push(Number(step.step) || 0);
  }

  return decided;
}

async function decidePartial(ctx, plan, steps) {
  const maxPartial = Math.max(0, steps.length - 1);
  const take = ctx.rng.int(0, maxPartial);
  const chosen = steps.slice(0, take);
  const decided = await approveSteps(ctx, plan, chosen);

  return { decided, pending: steps.length - decided.length };
}

async function rejectApproval(ctx, plan, steps) {
  const step = steps[0];
  const actorKey = actorKeyForStep(ctx, step, "lead");

  await sessionFor(ctx, actorKey).json(
    "POST",
    `/api/itsm/tickets/${plan.ticketId}/approval`,
    {
      body: {
        decision: "rejected",
        note: "Belum memenuhi kelengkapan dokumen; ajukan ulang setelah dilengkapi.",
      },
    }
  );
}

async function assignTicket(ctx, plan) {
  await sessionFor(ctx, "lead").json(
    "POST",
    `/api/itsm/tickets/${plan.ticketId}/assign`,
    { body: { assignee: plan.assigneeId } }
  );
}

async function transition(ctx, plan, actorKey, status, extra = {}) {
  return sessionFor(ctx, actorKey).json(
    "POST",
    `/api/itsm/tickets/${plan.ticketId}/transition`,
    { body: { status, ...extra } }
  );
}

function storyActorKey(ctx, plan, comment) {
  if (comment.by === "requester") return plan.requesterKey;
  if (comment.by === "assignee") return plan.assigneeKey;
  if (comment.by === "manager") return plan.managerKey;
  return comment.by;
}

function isStaffActor(ctx, key) {
  const user = ctx.users[key];
  if (!user) return false;

  return ["it_support", "it_lead", "resolver"].includes(user.role);
}

async function postStoryComments(ctx, plan, phase) {
  let staffPublic = false;

  for (const comment of plan.story.comments || []) {
    const visibility = comment.visibility || "public";
    const actorKey = storyActorKey(ctx, plan, comment);
    const requesterPhase = comment.by === "requester";

    if (phase === "before" ? !requesterPhase : requesterPhase) continue;
    if (phase === "after" && visibility === "internal" && !isStaffActor(ctx, actorKey)) {
      continue;
    }
    if (
      phase === "after" &&
      !WORK_STATES.includes(plan.state) &&
      actorKey === plan.assigneeKey
    ) {
      // Tiket belum di-assign: teknisi belum punya hak menulis komentar.
      continue;
    }

    try {
      await postComment(ctx, plan, actorKey, comment.text, visibility);
      if (visibility === "public" && isStaffActor(ctx, actorKey)) {
        staffPublic = true;
      }
    } catch (error) {
      ctx.log.warn(
        `Komentar ${plan.storyKey} (${actorKey}) gagal: ${error.message}`
      );
    }
  }

  if (
    phase === "after" &&
    !staffPublic &&
    ["in_progress", "waiting", "resolved", "closed", "reopened"].includes(
      plan.state
    )
  ) {
    try {
      await postComment(
        ctx,
        plan,
        "support",
        "Laporan sudah kami terima dan sedang ditindaklanjuti oleh tim IT.",
        "public"
      );
      staffPublic = true;
    } catch (error) {
      ctx.log.warn(`Komentar pembuka ${plan.storyKey} gagal: ${error.message}`);
    }
  }

  if (staffPublic) plan.staffPublicComment = true;

  return staffPublic;
}

async function runTicketFlow(ctx, plan, ticket) {
  plan.ticketId = ticket.id;
  plan.ticketNo = ticket.ticket_no;
  plan.priority = ticket.priority || plan.priority;

  await postStoryComments(ctx, plan, "before");

  if (plan.attachment) {
    try {
      await attachFile(ctx, plan, plan.creatorKey);
    } catch (error) {
      ctx.log.warn(`Lampiran ${plan.storyKey} gagal: ${error.message}`);
    }
  }

  // Triage sesekali untuk memperlihatkan koreksi prioritas/antrean.
  if (
    plan.type === "incident" &&
    ["open", "assigned", "in_progress"].includes(plan.state) &&
    ctx.rng.chance(0.22)
  ) {
    try {
      await sessionFor(ctx, "support").json(
        "POST",
        `/api/itsm/tickets/${plan.ticketId}/triage`,
        {
          body: {
            location: plan.story.location,
            reason: "Hasil verifikasi awal tim service desk.",
          },
        }
      );
    } catch (error) {
      ctx.log.warn(`Triage ${plan.storyKey} gagal: ${error.message}`);
    }
  }

  const approvals = (
    await ctx.admin.list("ticket_approvals", {
      filter: `ticket="${plan.ticketId}"`,
      sort: "step",
      perPage: 20,
    })
  ).items;

  if (approvals.length && plan.state === "approval_rejected") {
    await rejectApproval(ctx, plan, approvals);
    plan.approvalStatus = "rejected";
  } else if (approvals.length && plan.state === "approval_pending") {
    const result = await decidePartial(ctx, plan, approvals);
    plan.approvalStatus = result.pending > 0 ? "pending" : "approved";
  } else if (approvals.length) {
    await approveSteps(ctx, plan, approvals);
    plan.approvalStatus = "approved";
  } else {
    plan.approvalStatus = ticket.approval_status || "not_required";
  }

  if (WORK_STATES.includes(plan.state)) {
    await assignTicket(ctx, plan);

    if (STARTED_STATES.includes(plan.state)) {
      await transition(ctx, plan, plan.assigneeKey, "in_progress");
    }

    await postStoryComments(ctx, plan, "after");

    if (plan.state === "waiting") {
      await transition(ctx, plan, plan.assigneeKey, "waiting");
    }

    if (DONE_STATES.includes(plan.state)) {
      if (plan.waitingMs && plan.resumeMs) {
        await transition(ctx, plan, plan.assigneeKey, "waiting");
        await transition(ctx, plan, plan.assigneeKey, "in_progress");
      }

      const extra = {
        resolution_summary: plan.story.resolution.summary,
        resolution_code: plan.story.resolution.code,
      };

      if (plan.story.type === "change_request") {
        extra.change_outcome = plan.changeOutcome;
      }

      await transition(ctx, plan, plan.assigneeKey, "resolved", extra);

      if (plan.state === "closed") {
        await transition(ctx, plan, "support", "closed");
      }

      if (plan.state === "reopened") {
        await transition(ctx, plan, plan.requesterKey, "reopened");
      }
    }
  } else {
    await postStoryComments(ctx, plan, "after");
  }

  if (
    ["resolved", "closed"].includes(plan.state) &&
    plan.requesterId &&
    ctx.rng.chance(0.62)
  ) {
    const score = ctx.rng.pick([5, 5, 4, 4, 3, 2]);

    try {
      await sessionFor(ctx, plan.requesterKey).json(
        "POST",
        `/api/itsm/tickets/${plan.ticketId}/csat`,
        {
          body: {
            score,
            comment:
              score >= 4
                ? "Penanganan cepat dan jelas, terima kasih tim IT."
                : "Sudah ditangani, tetapi sempat menunggu cukup lama.",
          },
        }
      );
      plan.csat = score;
    } catch (error) {
      ctx.log.warn(`CSAT ${plan.storyKey} gagal: ${error.message}`);
    }
  }

  plan.ticket = await ctx.admin.json(
    "GET",
    `/api/collections/tickets/records/${plan.ticketId}`
  );
}

async function runQrTicket(ctx, plan, point) {
  const record = await createQrTicket(ctx, plan, point);
  plan.ticketId = record.id;
  plan.ticketNo = record.ticket_no;
  plan.priority = record.priority || plan.priority;
  plan.assigneeId = ctx.users[plan.assigneeKey].id;

  try {
    await postComment(
      ctx,
      plan,
      "support",
      "Terima kasih laporannya. Tim IT sudah menerima tiket ini dari titik QR.",
      "public"
    );
  } catch (error) {
    ctx.log.warn(`Komentar QR gagal: ${error.message}`);
  }

  if (["assigned", "in_progress", "resolved"].includes(plan.state)) {
    await assignTicket(ctx, plan);
  }

  if (["in_progress", "resolved"].includes(plan.state)) {
    await transition(ctx, plan, plan.assigneeKey, "in_progress");
  }

  if (plan.state === "resolved") {
    await transition(ctx, plan, plan.assigneeKey, "resolved", {
      resolution_summary: plan.story.resolution.summary,
      resolution_code: plan.story.resolution.code,
    });
  }

  plan.ticket = await ctx.admin.json(
    "GET",
    `/api/collections/tickets/records/${plan.ticketId}`
  );
}

export async function seedTickets(ctx, plans) {
  const generated = [];

  for (const plan of plans) {
    try {
      if (plan.qr) {
        await runQrTicket(ctx, plan, plan.point);
      } else {
        const created = await createTicket(ctx, plan);
        await runTicketFlow(ctx, plan, created);
      }

      generated.push(plan);
    } catch (error) {
      ctx.log.warn(
        `Tiket "${plan.story.title.slice(0, 48)}" (${plan.state}) dilewati: ${error.message}`
      );
    }
  }

  return generated;
}

// ---------------------------------------------------------------------------
// Rencana backdate untuk route dev seed
// ---------------------------------------------------------------------------

export function buildAgingPlan(plan) {
  const worked = WORK_STATES.includes(plan.state);
  const started = STARTED_STATES.includes(plan.state);
  const done = DONE_STATES.includes(plan.state);

  const fields = {
    assigned_at: worked ? iso(plan.assignedMs) : "",
    first_response_at: plan.staffPublicComment ? iso(plan.firstResponseMs) : "",
    resolved_at: done ? iso(plan.resolvedMs) : "",
    closed_at: plan.state === "closed" ? iso(plan.closedMs) : "",
    reopened_at: plan.state === "reopened" ? iso(plan.reopenedMs) : "",
    last_activity_at: iso(plan.lastActivityMs),
    sla_paused_at: plan.state === "waiting" ? iso(plan.waitingMs) : "",
    sla_paused_minutes: plan.pausedMinutes || 0,
  };

  if (plan.type === "change_request" && started) {
    fields.actual_start = iso(plan.startMs);
  }
  if (plan.type === "change_request" && done) {
    fields.actual_end = iso(plan.resolvedMs);
  }

  return {
    collection: "tickets",
    id: plan.ticketId,
    created: iso(plan.createdMs),
    fields,
    breaches: plan.breaches || {},
  };
}
