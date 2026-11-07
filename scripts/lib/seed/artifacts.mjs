// Artefak manajemen layanan: problem, artikel pengetahuan, dan insiden mayor.
// Ditautkan ke tiket hasil seed agar riwayat tiket, laporan operasional, dan
// pencarian pengetahuan punya isi.
import { DAY, HOUR, MINUTE, iso } from "./util.mjs";
import { ARTICLES, INCIDENTS, PROBLEMS } from "./content.mjs";

function sessionFor(ctx, key) {
  const client = ctx.sessions[key];
  if (!client) throw new Error(`Sesi ${key} tidak ditemukan`);
  return client;
}

function ticketsForStories(tickets, storyKeys, limit = 3) {
  return tickets
    .filter((ticket) => storyKeys.includes(ticket.storyKey))
    .slice(0, limit);
}

async function linkProblemTickets(ctx, problemId, tickets) {
  for (const ticket of tickets) {
    try {
      await sessionFor(ctx, "lead").json(
        "POST",
        `/api/itsm/problems/${problemId}/tickets`,
        { body: { ticket_id: ticket.ticketId, relation: "caused_by" } }
      );
    } catch (error) {
      ctx.log.warn(`Tautan problem ${problemId} gagal: ${error.message}`);
    }
  }
}

export async function seedProblems(ctx, tickets) {
  const { admin, profile, log } = ctx;
  const created = [];
  const problems = PROBLEMS.slice(0, profile.problems);

  for (const definition of problems) {
    const tenantFilter = `tenant="${ctx.tenant.id}" && title="${definition.title}"`;
    const existing = await admin.findOne("problems", tenantFilter);

    if (existing) {
      ctx.problems[definition.key] = existing;
      continue;
    }

    try {
      const service = ctx.services[definition.service];
      const record = await sessionFor(ctx, "lead").json(
        "POST",
        "/api/itsm/problems",
        {
          body: {
            title: definition.title,
            description: definition.description,
            service: service ? service.id : "",
            owner: ctx.users.lead.id,
          },
        }
      );

      const patch = {};

      if (definition.rootCause) patch.root_cause = definition.rootCause;
      if (definition.workaround) patch.workaround = definition.workaround;
      if (definition.permanentFix) patch.permanent_fix = definition.permanentFix;

      if (definition.status === "known_error") {
        await sessionFor(ctx, "lead").json(
          "PATCH",
          `/api/itsm/problems/${record.id}`,
          { body: { ...patch, status: "known_error" } }
        );
      } else if (definition.status === "resolved") {
        await sessionFor(ctx, "lead").json(
          "PATCH",
          `/api/itsm/problems/${record.id}`,
          { body: { ...patch, status: "resolved" } }
        );
      } else if (definition.status === "closed") {
        await sessionFor(ctx, "lead").json(
          "PATCH",
          `/api/itsm/problems/${record.id}`,
          { body: { ...patch, status: "resolved" } }
        );
        await sessionFor(ctx, "lead").json(
          "PATCH",
          `/api/itsm/problems/${record.id}`,
          { body: { status: "closed" } }
        );
      } else {
        await sessionFor(ctx, "lead").json(
          "PATCH",
          `/api/itsm/problems/${record.id}`,
          { body: { ...patch, status: definition.status } }
        );
      }

      const linked = ticketsForStories(
        tickets,
        definition.linkStories || [],
        3
      );
      await linkProblemTickets(ctx, record.id, linked);

      const refreshed = await admin.json(
        "GET",
        `/api/collections/problems/records/${record.id}`
      );

      ctx.problems[definition.key] = refreshed;
      created.push({ definition, record: refreshed, linked });

      const ageDays = definition.ageDays || 20;
      const createdMs = Date.now() - ageDays * DAY - ctx.rng.int(0, 6) * HOUR;
      const resolvedMs = createdMs + ctx.rng.int(2, 6) * DAY;

      created[created.length - 1].aging = {
        collection: "problems",
        id: record.id,
        created: iso(createdMs),
        fields:
          definition.status === "resolved" || definition.status === "closed"
            ? { resolved_at: iso(resolvedMs) }
            : {},
        updated: iso(
          definition.status === "resolved" || definition.status === "closed"
            ? resolvedMs
            : createdMs + ctx.rng.int(2, 30) * HOUR
        ),
      };

      log.detail(
        `Problem ${definition.title.slice(0, 52)} (${definition.status})`
      );
    } catch (error) {
      log.warn(`Problem "${definition.title}" gagal: ${error.message}`);
    }
  }

  return created;
}

export async function seedArticles(ctx, problems) {
  const { admin, profile, log } = ctx;
  const created = [];
  const definitions = ARTICLES.slice(0, profile.articles);

  for (const definition of definitions) {
    const tenantFilter = `tenant="${ctx.tenant.id}" && title="${definition.title}"`;
    const existing = await admin.findOne("knowledge_articles", tenantFilter);

    if (existing) {
      ctx.articles[definition.key] = existing;
      continue;
    }

    try {
      const service = ctx.services[definition.service];
      const problem = definition.problem ? ctx.problems[definition.problem] : null;

      const record = await sessionFor(ctx, "support").json(
        "POST",
        "/api/itsm/knowledge",
        {
          body: {
            title: definition.title,
            body: definition.body,
            visibility: definition.visibility,
            tags: definition.tags,
            service: service ? service.id : "",
            problem: problem ? problem.id : "",
          },
        }
      );

      if (definition.status === "review") {
        await sessionFor(ctx, "support").json(
          "PATCH",
          `/api/itsm/knowledge/${record.id}`,
          { body: { status: "review" } }
        );
      } else if (definition.status === "published") {
        await sessionFor(ctx, "support").json(
          "PATCH",
          `/api/itsm/knowledge/${record.id}`,
          { body: { status: "review" } }
        );
        await sessionFor(ctx, "lead").json(
          "POST",
          `/api/itsm/knowledge/${record.id}/publish`,
          { body: { status: "published" } }
        );
      } else if (definition.status === "retired") {
        await sessionFor(ctx, "support").json(
          "PATCH",
          `/api/itsm/knowledge/${record.id}`,
          { body: { status: "review" } }
        );
        await sessionFor(ctx, "lead").json(
          "POST",
          `/api/itsm/knowledge/${record.id}/publish`,
          { body: { status: "published" } }
        );
        await sessionFor(ctx, "lead").json(
          "POST",
          `/api/itsm/knowledge/${record.id}/publish`,
          { body: { status: "retired" } }
        );
      }

      const refreshed = await admin.json(
        "GET",
        `/api/collections/knowledge_articles/records/${record.id}`
      );
      ctx.articles[definition.key] = refreshed;

      const ageDays = definition.ageDays || 20;
      const createdMs = Date.now() - ageDays * DAY - ctx.rng.int(0, 6) * HOUR;
      const publishedMs = createdMs + ctx.rng.int(1, 24) * HOUR;

      created.push({
        definition,
        record: refreshed,
        aging: {
          collection: "knowledge_articles",
          id: record.id,
          created: iso(createdMs),
          fields: ["published", "retired"].includes(definition.status)
            ? { published_at: iso(publishedMs) }
            : {},
          updated: iso(
            ["published", "retired"].includes(definition.status)
              ? publishedMs
              : createdMs + ctx.rng.int(1, 12) * HOUR
          ),
        },
      });

      log.detail(
        `Artikel ${definition.title.slice(0, 52)} (${definition.status})`
      );
    } catch (error) {
      log.warn(`Artikel "${definition.title}" gagal: ${error.message}`);
    }
  }

  return created;
}

export async function seedIncidents(ctx, tickets) {
  const { admin, profile, log } = ctx;
  const created = [];
  const definitions = INCIDENTS.slice(0, profile.incidents);

  for (const definition of definitions) {
    const tenantFilter = `tenant="${ctx.tenant.id}" && title="${definition.title}"`;
    const existing = await admin.findOne("major_incidents", tenantFilter);

    if (existing) {
      ctx.incidents[definition.key] = existing;
      continue;
    }

    try {
      const commander = ctx.users[definition.commander] || ctx.users.lead;
      const services = definition.services
        .map((code) => ctx.services[code])
        .filter(Boolean)
        .map((service) => service.id);

      let linked = ticketsForStories(
        tickets,
        definition.linkStories || [],
        4
      );

      // Insiden harus beralasan: tiket terdampak dibuat di dalam rentang
      // insiden. Bila tidak ada tiket yang cocok, pakai beberapa tiket terbaru
      // sebagai konteks agar timeline tidak mustahil (tiket lahir setelah
      // insiden ditutup).
      if (!linked.length) {
        linked = tickets.slice(0, Math.min(3, tickets.length));
      }

      const now = Date.now();
      const done = ["resolved", "closed"].includes(definition.status);
      const linkedTimes = linked
        .map((ticket) => ticket.createdMs)
        .filter((value) => Number.isFinite(value));

      // Insiden yang sudah selesai disebar ke riwayat, sedangkan insiden aktif
      // harus berakhir di sekitar sekarang agar terasa sedang berlangsung.
      let anchorMs;

      if (done) {
        anchorMs = linkedTimes.length
          ? ctx.rng.pick(linkedTimes)
          : now - 2 * HOUR;
      } else {
        anchorMs = linkedTimes.length ? Math.max(...linkedTimes) : now - 2 * HOUR;
        if (anchorMs > now - 3 * HOUR) anchorMs = now - 3 * HOUR;
      }

      let startedMs = anchorMs - ctx.rng.int(1, 6) * HOUR;
      let resolvedMs = 0;
      let closedMs = 0;

      if (done) {
        resolvedMs = Math.min(
          now - 5 * MINUTE,
          anchorMs + ctx.rng.int(30, 180) * MINUTE
        );
        if (resolvedMs <= startedMs) resolvedMs = startedMs + 45 * MINUTE;

        if (definition.status === "closed") {
          closedMs = Math.min(
            now - MINUTE,
            resolvedMs + ctx.rng.int(20, 90) * MINUTE
          );
        }
      }

      // Hanya tautkan tiket yang memang jatuh di dalam rentang insiden supaya
      // durasi insiden tidak melebar berhari-hari karena satu tiket lama.
      const windowEnd = resolvedMs || now;
      const inWindow = linked.filter(
        (ticket) =>
          Number.isFinite(ticket.createdMs) &&
          ticket.createdMs >= startedMs - HOUR &&
          ticket.createdMs <= windowEnd
      );

      if (inWindow.length) {
        linked = inWindow;
      } else if (linked.length) {
        linked = linked.slice(-1);

        const only = linked[0];
        if (Number.isFinite(only.createdMs) && only.createdMs < startedMs) {
          startedMs = only.createdMs - HOUR;
        }
        if (resolvedMs && only.createdMs >= resolvedMs) {
          resolvedMs = Math.min(now - MINUTE, only.createdMs + HOUR);
        }
      }

      const record = await sessionFor(ctx, "lead").json(
        "POST",
        "/api/itsm/incidents",
        {
          body: {
            title: definition.title,
            description: definition.description,
            severity: definition.severity,
            impact_summary: definition.impactSummary,
            affected_services: services,
            commander: commander.id,
            source_ticket: linked[0] ? linked[0].ticketId : "",
          },
        }
      );

      for (const ticket of linked) {
        try {
          await sessionFor(ctx, "lead").json(
            "POST",
            `/api/itsm/incidents/${record.id}/tickets`,
            { body: { ticket_id: ticket.ticketId, relation: "impacted" } }
          );
        } catch (error) {
          log.warn(`Tautan insiden ${record.id} gagal: ${error.message}`);
        }
      }

      for (const update of definition.updates || []) {
        try {
          await sessionFor(ctx, "lead").json(
            "POST",
            `/api/itsm/incidents/${record.id}/updates`,
            {
              body: {
                kind: update.kind,
                visibility: update.visibility,
                body: update.body,
              },
            }
          );
        } catch (error) {
          log.warn(`Update insiden gagal: ${error.message}`);
        }
      }

      if (definition.status === "investigating") {
        await sessionFor(ctx, "lead").json(
          "PATCH",
          `/api/itsm/incidents/${record.id}`,
          { body: { status: "investigating" } }
        );
      } else if (definition.status === "mitigating") {
        await sessionFor(ctx, "lead").json(
          "PATCH",
          `/api/itsm/incidents/${record.id}`,
          { body: { status: "mitigating" } }
        );
      } else if (definition.status === "resolved") {
        await sessionFor(ctx, "lead").json(
          "PATCH",
          `/api/itsm/incidents/${record.id}`,
          {
            body: {
              status: "resolved",
              resolution_summary: definition.resolutionSummary,
              root_cause: definition.rootCause,
            },
          }
        );
      } else if (definition.status === "closed") {
        await sessionFor(ctx, "lead").json(
          "PATCH",
          `/api/itsm/incidents/${record.id}`,
          {
            body: {
              status: "resolved",
              resolution_summary: definition.resolutionSummary,
              root_cause: definition.rootCause,
              pir_actions: definition.pirActions,
              pir_completed: true,
            },
          }
        );
        await sessionFor(ctx, "lead").json(
          "PATCH",
          `/api/itsm/incidents/${record.id}`,
          { body: { status: "closed" } }
        );
      }

      const refreshed = await admin.json(
        "GET",
        `/api/collections/major_incidents/records/${record.id}`
      );
      ctx.incidents[definition.key] = refreshed;

      const fields = { started_at: iso(startedMs) };
      if (resolvedMs) fields.resolved_at = iso(resolvedMs);
      if (closedMs) fields.closed_at = iso(closedMs);
      if (definition.status === "closed" && resolvedMs) {
        fields.pir_completed_at = iso(
          closedMs ? closedMs - ctx.rng.int(15, 60) * MINUTE : resolvedMs
        );
      }

      const updatedMs = closedMs || resolvedMs || Math.min(
        now - 5 * MINUTE,
        Math.max(startedMs + 30 * MINUTE, now - ctx.rng.int(1, 12) * HOUR)
      );

      created.push({
        definition,
        record: refreshed,
        linked,
        aging: {
          collection: "major_incidents",
          id: record.id,
          created: iso(startedMs),
          fields,
          updated: iso(updatedMs),
        },
      });

      log.detail(
        `Insiden ${definition.title.slice(0, 52)} (${definition.status})`
      );
    } catch (error) {
      log.warn(`Insiden "${definition.title}" gagal: ${error.message}`);
    }
  }

  return created;
}

export function artifactAgingPlans(problems, articles, incidents) {
  return [
    ...problems.filter((item) => item.aging).map((item) => item.aging),
    ...articles.filter((item) => item.aging).map((item) => item.aging),
    ...incidents.filter((item) => item.aging).map((item) => item.aging),
  ];
}
