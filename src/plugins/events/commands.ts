import { addCmd } from "../../services/commands/cmdParser.ts";
import type { IUrsamuSDK } from "../../@types/UrsamuSDK.ts";
import { gameEvents, eventRsvps, getNextEventNumber, parseDateTime, formatDateTime } from "./db.ts";
import type { IGameEvent, IEventRSVP } from "../../@types/IGameEvent.ts";
import { dbojs } from "../../services/Database/index.ts";

// ─── helpers ─────────────────────────────────────────────────────────────────

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
}

function statusColor(s: IGameEvent["status"]): string {
  switch (s) {
    case "upcoming":  return "%ch%cg";
    case "active":    return "%ch%cy";
    case "completed": return "%cn";
    case "cancelled": return "%ch%cr";
  }
}

function rsvpColor(s: IEventRSVP["status"]): string {
  switch (s) {
    case "attending": return "%ch%cg";
    case "maybe":     return "%cy";
    case "declined":  return "%cr";
  }
}

async function getEventByNumber(n: number): Promise<IGameEvent | null> {
  return await gameEvents.queryOne({ number: n }) || null;
}

async function getPlayerName(id: string): Promise<string> {
  const p = await dbojs.queryOne({ id });
  return (p && p.data?.name) || id;
}

// ─── +event ──────────────────────────────────────────────────────────────────
//
// Player commands:
//   +event [/list]                          — list upcoming events
//   +event/view <#>                         — view event details + RSVP list
//   +event/rsvp <#>[=maybe|decline]         — RSVP (default: attending)
//   +event/unrsvp <#>                       — cancel RSVP
//
// Staff commands:
//   +event/create <title>=<date>/<desc>     — create an event
//   +event/edit <#>/<field>=<value>         — edit a field
//   +event/cancel <#>                       — mark event cancelled
//   +event/delete <#>                       — permanently delete
//   +event/status <#>=<status>              — set status explicitly

addCmd({
  name: "+event",
  pattern: /^\+event(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] || "").toLowerCase().trim();
    const arg = (u.cmd.args[1] || "").trim();

    // ── list (default) ─────────────────────────────────────────────────────
    if (!sw || sw === "list") {
      const all = await gameEvents.find({});
      const visible = all
        .filter(e => e.status !== "cancelled" || isStaff(u))
        .sort((a, b) => a.startTime - b.startTime);

      if (!visible.length) {
        u.send("%ch+events:%cn No upcoming events.");
        return;
      }

      u.send("%ch%cy+events%cn");
      u.send(
        "%ch" +
        u.util.rjust("#", 4) + "  " +
        u.util.ljust("Title", 28) +
        u.util.ljust("Date", 20) +
        u.util.rjust("RSVPs", 6) + "  " +
        "Status" +
        "%cn"
      );
      u.send("%ch" + "-".repeat(68) + "%cn");

      for (const e of visible) {
        const rsvps   = await eventRsvps.find({ eventId: e.id, status: "attending" });
        const cap     = e.maxAttendees > 0 ? `${rsvps.length}/${e.maxAttendees}` : String(rsvps.length);
        const sc      = statusColor(e.status);
        u.send(
          u.util.rjust(String(e.number), 4) + "  " +
          u.util.ljust(e.title.slice(0, 27), 28) +
          u.util.ljust(formatDateTime(e.startTime), 20) +
          u.util.rjust(cap, 6) + "  " +
          sc + e.status + "%cn"
        );
      }
      u.send('Use "+event/view <#>" to see details and RSVP.');
      return;
    }

    // ── view <#> ───────────────────────────────────────────────────────────
    if (sw === "view") {
      const num = parseInt(arg, 10);
      if (isNaN(num)) { u.send("Usage: +event/view <#>"); return; }
      const ev = await getEventByNumber(num);
      if (!ev) { u.send(`%ch+event:%cn No event #${num} found.`); return; }

      const sc = statusColor(ev.status);
      u.send(`%ch%cy+event #${ev.number}:%cn ${ev.title}`);
      u.send(`  Status  : ${sc}${ev.status}%cn`);
      u.send(`  Date    : ${formatDateTime(ev.startTime)}${ev.endTime ? " → " + formatDateTime(ev.endTime) : ""}`);
      if (ev.location) u.send(`  Where   : ${ev.location}`);
      if (ev.tags.length) u.send(`  Tags    : ${ev.tags.join(", ")}`);
      u.send(`  Host    : ${ev.createdByName}`);
      u.send(`  Desc    : ${ev.description}`);

      const attending = await eventRsvps.find({ eventId: ev.id, status: "attending" });
      const maybe     = await eventRsvps.find({ eventId: ev.id, status: "maybe" });
      const cap       = ev.maxAttendees > 0 ? `/${ev.maxAttendees}` : "";

      u.send(`%ch  RSVPs:%cn ${attending.length}${cap} attending, ${maybe.length} maybe`);
      if (attending.length) u.send(`    Attending: ${attending.map(r => r.playerName).join(", ")}`);
      if (maybe.length)     u.send(`    Maybe    : ${maybe.map(r => r.playerName).join(", ")}`);

      // Show own RSVP status
      const myRsvp = await eventRsvps.queryOne({ eventId: ev.id, playerId: u.me.id });
      if (myRsvp) {
        u.send(`  Your RSVP: ${rsvpColor(myRsvp.status)}${myRsvp.status}%cn`);
      } else {
        u.send('  Use "+event/rsvp <#>" to RSVP, "+event/rsvp <#>=maybe" for maybe.');
      }
      return;
    }

    // ── rsvp <#>[=maybe|decline] ───────────────────────────────────────────
    if (sw === "rsvp") {
      const eqIdx  = arg.indexOf("=");
      const numStr = eqIdx !== -1 ? arg.slice(0, eqIdx).trim() : arg;
      const choice = (eqIdx !== -1 ? arg.slice(eqIdx + 1).trim() : "attending").toLowerCase();
      const num    = parseInt(numStr, 10);

      if (isNaN(num)) { u.send("Usage: +event/rsvp <#>[=attending|maybe|decline]"); return; }
      if (!["attending", "maybe", "declined", "decline"].includes(choice)) {
        u.send("RSVP status must be: attending, maybe, or decline");
        return;
      }
      const status = (choice === "decline" ? "declined" : choice) as IEventRSVP["status"];

      const ev = await getEventByNumber(num);
      if (!ev) { u.send(`%ch+event:%cn No event #${num} found.`); return; }
      if (ev.status === "cancelled") { u.send("%ch+event:%cn That event has been cancelled."); return; }
      if (ev.status === "completed") { u.send("%ch+event:%cn That event has already occurred."); return; }

      // Check capacity for attending RSVPs
      if (status === "attending" && ev.maxAttendees > 0) {
        const attending = await eventRsvps.find({ eventId: ev.id, status: "attending" });
        const myRsvp    = await eventRsvps.queryOne({ eventId: ev.id, playerId: u.me.id });
        const alreadyAttending = myRsvp?.status === "attending";
        if (!alreadyAttending && attending.length >= ev.maxAttendees) {
          u.send(`%ch+event:%cn Sorry, event #${num} is full (${ev.maxAttendees}/${ev.maxAttendees}).`);
          return;
        }
      }

      const existing = await eventRsvps.queryOne({ eventId: ev.id, playerId: u.me.id });
      if (existing) {
        await eventRsvps.update({}, { ...existing, status });
        u.send(`%ch+event:%cn RSVP updated to ${rsvpColor(status)}${status}%cn for "${ev.title}".`);
      } else {
        await eventRsvps.create({
          id:         crypto.randomUUID(),
          eventId:    ev.id,
          playerId:   u.me.id,
          playerName: await getPlayerName(u.me.id),
          status,
          createdAt:  Date.now(),
        });
        u.send(`%ch+event:%cn RSVP'd ${rsvpColor(status)}${status}%cn for "${ev.title}".`);
      }
      return;
    }

    // ── unrsvp <#> ─────────────────────────────────────────────────────────
    if (sw === "unrsvp") {
      const num = parseInt(arg, 10);
      if (isNaN(num)) { u.send("Usage: +event/unrsvp <#>"); return; }

      const ev = await getEventByNumber(num);
      if (!ev) { u.send(`%ch+event:%cn No event #${num} found.`); return; }

      const existing = await eventRsvps.queryOne({ eventId: ev.id, playerId: u.me.id });
      if (!existing) { u.send("%ch+event:%cn You have no RSVP to cancel."); return; }

      await eventRsvps.delete({ id: existing.id });
      u.send(`%ch+event:%cn RSVP cancelled for "${ev.title}".`);
      return;
    }

    // ── create <title>=<date>/<desc>  (staff) ─────────────────────────────
    if (sw === "create") {
      if (!isStaff(u)) { u.send("%ch+event:%cn Permission denied."); return; }

      const eqIdx = arg.indexOf("=");
      if (eqIdx === -1) {
        u.send("Usage: +event/create <title>=<YYYY-MM-DD HH:MM>/<description>");
        return;
      }
      const title = arg.slice(0, eqIdx).trim();
      const rest  = arg.slice(eqIdx + 1);
      const slash = rest.indexOf("/");
      if (slash === -1) {
        u.send("Usage: +event/create <title>=<YYYY-MM-DD HH:MM>/<description>");
        return;
      }
      const dateStr = rest.slice(0, slash).trim();
      const desc    = rest.slice(slash + 1).trim();

      if (!title || !desc) {
        u.send("Usage: +event/create <title>=<YYYY-MM-DD HH:MM>/<description>");
        return;
      }

      const startTime = parseDateTime(dateStr);
      if (!startTime) {
        u.send(`%ch+event:%cn Invalid date "${dateStr}". Use format: YYYY-MM-DD or YYYY-MM-DD HH:MM`);
        return;
      }

      const num = await getNextEventNumber();
      const now = Date.now();
      const ev: IGameEvent = {
        id:            `ev-${num}`,
        number:        num,
        title,
        description:   desc,
        startTime,
        createdBy:     u.me.id,
        createdByName: u.me.name || u.me.id,
        status:        "upcoming",
        tags:          [],
        maxAttendees:  0,
        createdAt:     now,
        updatedAt:     now,
      };

      await gameEvents.create(ev);
      u.send(`%ch+event:%cn Event #${num} "${title}" created for ${formatDateTime(startTime)}.`);
      return;
    }

    // ── edit <#>/<field>=<value>  (staff) ─────────────────────────────────
    if (sw === "edit") {
      if (!isStaff(u)) { u.send("%ch+event:%cn Permission denied."); return; }

      // Format: <#>/<field>=<value>
      const slash = arg.indexOf("/");
      const eq    = arg.indexOf("=");
      if (slash === -1 || eq === -1 || eq < slash) {
        u.send("Usage: +event/edit <#>/<field>=<value>");
        return;
      }

      const num   = parseInt(arg.slice(0, slash).trim(), 10);
      const field = arg.slice(slash + 1, eq).trim().toLowerCase();
      const value = arg.slice(eq + 1).trim();
      if (isNaN(num)) { u.send("Usage: +event/edit <#>/<field>=<value>"); return; }

      const ev = await getEventByNumber(num);
      if (!ev) { u.send(`%ch+event:%cn No event #${num} found.`); return; }

      const update: Partial<IGameEvent> = { updatedAt: Date.now() };

      switch (field) {
        case "title":        update.title       = value; break;
        case "description":  update.description = value; break;
        case "location":     update.location    = value; break;
        case "starttime": {
          const t = parseDateTime(value);
          if (!t) { u.send(`%ch+event:%cn Invalid date "${value}".`); return; }
          update.startTime = t;
          break;
        }
        case "endtime": {
          const t = parseDateTime(value);
          if (!t) { u.send(`%ch+event:%cn Invalid date "${value}".`); return; }
          update.endTime = t;
          break;
        }
        case "maxattendees": {
          const n = parseInt(value, 10);
          if (isNaN(n) || n < 0) { u.send("%ch+event:%cn maxattendees must be a non-negative integer."); return; }
          update.maxAttendees = n;
          break;
        }
        case "tags":
          update.tags = value.split(",").map(t => t.trim()).filter(Boolean);
          break;
        default:
          u.send(`%ch+event:%cn Unknown field "${field}". Valid: title, description, location, starttime, endtime, maxattendees, tags`);
          return;
      }

      await gameEvents.update({}, { ...ev, ...update });
      u.send(`%ch+event:%cn Event #${num} updated (${field}).`);
      return;
    }

    // ── status <#>=<status>  (staff) ──────────────────────────────────────
    if (sw === "status") {
      if (!isStaff(u)) { u.send("%ch+event:%cn Permission denied."); return; }

      const eqIdx  = arg.indexOf("=");
      if (eqIdx === -1) { u.send("Usage: +event/status <#>=<upcoming|active|completed|cancelled>"); return; }
      const num    = parseInt(arg.slice(0, eqIdx).trim(), 10);
      const status = arg.slice(eqIdx + 1).trim().toLowerCase() as IGameEvent["status"];

      if (isNaN(num)) { u.send("Usage: +event/status <#>=<status>"); return; }
      if (!["upcoming", "active", "completed", "cancelled"].includes(status)) {
        u.send("Status must be: upcoming, active, completed, cancelled");
        return;
      }

      const ev = await getEventByNumber(num);
      if (!ev) { u.send(`%ch+event:%cn No event #${num} found.`); return; }

      await gameEvents.update({}, { ...ev, status, updatedAt: Date.now() });
      u.send(`%ch+event:%cn Event #${num} status set to ${statusColor(status)}${status}%cn.`);
      return;
    }

    // ── cancel <#>  (staff) ───────────────────────────────────────────────
    if (sw === "cancel") {
      if (!isStaff(u)) { u.send("%ch+event:%cn Permission denied."); return; }
      const num = parseInt(arg, 10);
      if (isNaN(num)) { u.send("Usage: +event/cancel <#>"); return; }

      const ev = await getEventByNumber(num);
      if (!ev) { u.send(`%ch+event:%cn No event #${num} found.`); return; }

      await gameEvents.update({}, { ...ev, status: "cancelled", updatedAt: Date.now() });
      u.send(`%ch+event:%cn Event #${num} "${ev.title}" has been %ch%crcancelled%cn.`);
      return;
    }

    // ── delete <#>  (staff) ───────────────────────────────────────────────
    if (sw === "delete") {
      if (!isStaff(u)) { u.send("%ch+event:%cn Permission denied."); return; }
      const num = parseInt(arg, 10);
      if (isNaN(num)) { u.send("Usage: +event/delete <#>"); return; }

      const ev = await getEventByNumber(num);
      if (!ev) { u.send(`%ch+event:%cn No event #${num} found.`); return; }

      await gameEvents.delete({ id: ev.id });
      await eventRsvps.delete({ eventId: ev.id });
      u.send(`%ch+event:%cn Event #${num} deleted.`);
      return;
    }

    // ── help ──────────────────────────────────────────────────────────────
    u.send("%ch+event usage:%cn");
    u.send("  +event [/list]                           — list upcoming events");
    u.send("  +event/view <#>                          — event details + RSVPs");
    u.send("  +event/rsvp <#>[=attending|maybe|decline] — RSVP");
    u.send("  +event/unrsvp <#>                        — cancel RSVP");
    if (isStaff(u)) {
      u.send("  +event/create <title>=<date>/<desc>      — create event");
      u.send("  +event/edit <#>/<field>=<value>          — edit a field");
      u.send("  +event/status <#>=<status>               — set status");
      u.send("  +event/cancel <#>                        — cancel event");
      u.send("  +event/delete <#>                        — delete event");
    }
  },
});

// ─── +events alias ────────────────────────────────────────────────────────────

addCmd({
  name: "+events",
  pattern: /^\+events\s*(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    // Re-use the list logic by delegating to a direct DB read
    const all = await gameEvents.find({});
    const visible = all
      .filter(e => e.status !== "cancelled" || isStaff(u))
      .sort((a, b) => a.startTime - b.startTime);

    if (!visible.length) { u.send("%ch+events:%cn No upcoming events."); return; }

    u.send("%ch%cy+events%cn");
    u.send(
      "%ch" +
      u.util.rjust("#", 4) + "  " +
      u.util.ljust("Title", 28) +
      u.util.ljust("Date", 20) +
      u.util.rjust("RSVPs", 6) + "  " +
      "Status%cn"
    );
    u.send("%ch" + "-".repeat(68) + "%cn");

    for (const e of visible) {
      const rsvps = await eventRsvps.find({ eventId: e.id, status: "attending" });
      const cap   = e.maxAttendees > 0 ? `${rsvps.length}/${e.maxAttendees}` : String(rsvps.length);
      const sc    = statusColor(e.status);
      u.send(
        u.util.rjust(String(e.number), 4) + "  " +
        u.util.ljust(e.title.slice(0, 27), 28) +
        u.util.ljust(formatDateTime(e.startTime), 20) +
        u.util.rjust(cap, 6) + "  " +
        sc + e.status + "%cn"
      );
    }
    u.send('Use "+event/view <#>" for details.');
  },
});
