import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { eventRsvps, formatDateTime } from "./db.ts";
import {
  formatCapacity,
  groupByEventId,
  isStaffFlags,
  parseCreateArg,
  rsvpColor,
  statusColor,
  summarizeRsvps,
} from "./helpers.ts";
import {
  cancelEvent,
  cancelRsvp,
  createEvent,
  deleteEvent,
  editEventField,
  getEventByNumber,
  listEvents,
  setEventStatus,
  upsertRsvp,
} from "./service.ts";

// ─── local wrappers ───────────────────────────────────────────────────────────

function isStaff(u: IUrsamuSDK): boolean {
  return isStaffFlags(u.me.flags);
}

async function sendEventList(u: IUrsamuSDK): Promise<void> {
  const visible = await listEvents({ staff: isStaff(u) });

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
      "%cn",
  );
  u.send("%ch" + "-".repeat(68) + "%cn");

  const visibleIds = visible.map((e) => e.id);
  const allRsvps = await eventRsvps.find({
    eventId: { $in: visibleIds },
    status: "attending",
  });
  const rsvpsByEventId = groupByEventId(allRsvps);

  for (const e of visible) {
    const rsvps = rsvpsByEventId.get(e.id) || [];
    const cap = formatCapacity(rsvps.length, e.maxAttendees);
    const sc = statusColor(e.status);
    u.send(
      u.util.rjust(String(e.number), 4) + "  " +
        u.util.ljust(e.title.slice(0, 27), 28) +
        u.util.ljust(formatDateTime(e.startTime), 20) +
        u.util.rjust(cap, 6) + "  " +
        sc + e.status + "%cn",
    );
  }
  u.send('Use "+event/view <#>" to see details and RSVP.');
}

// ─── +event ──────────────────────────────────────────────────────────────────

addCmd({
  name: "+event",
  pattern: /^\+event(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Social",
  help:
    `+event[/<switch>] [<args>]  — In-game event calendar with RSVP tracking.

Switches (players):
  /list              List all upcoming events (default).
  /view <#>          View event details and RSVP list.
  /rsvp <#>[=<s>]   RSVP to an event. Status: attending (default), maybe, decline.
  /unrsvp <#>        Cancel your RSVP.

Switches (staff only):
  /create <title>=<date>/<desc>   Create a new event.
  /edit <#>/<field>=<value>       Edit a field.
  /status <#>=<status>            Set status.
  /cancel <#>                     Mark event as cancelled.
  /delete <#>                     Permanently delete an event.

Examples:
  +event                           List upcoming events.
  +event/view 3                    View event #3.
  +event/rsvp 3                    RSVP attending to event #3.
  +event/create Summer Gala=2027-08-01/Annual summer gathering.`,
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] || "").toLowerCase().trim();
    const arg = (u.cmd.args[1] || "").trim();

    if (!sw || sw === "list") {
      await sendEventList(u);
      return;
    }

    if (sw === "view") {
      const num = parseInt(arg, 10);
      if (isNaN(num)) {
        u.send("Usage: +event/view <#>");
        return;
      }
      const ev = await getEventByNumber(num);
      if (!ev) {
        u.send(`%ch+event:%cn No event #${num} found.`);
        return;
      }
      if (!isStaff(u) && ev.status === "cancelled") {
        u.send(`%ch+event:%cn No event #${num} found.`);
        return;
      }

      const sc = statusColor(ev.status);
      u.send(`%ch%cy+event #${ev.number}:%cn ${ev.title}`);
      u.send(`  Status  : ${sc}${ev.status}%cn`);
      u.send(
        `  Date    : ${formatDateTime(ev.startTime)}${
          ev.endTime ? " → " + formatDateTime(ev.endTime) : ""
        }`,
      );
      if (ev.location) u.send(`  Where   : ${ev.location}`);
      if (ev.tags.length) u.send(`  Tags    : ${ev.tags.join(", ")}`);
      u.send(`  Host    : ${ev.createdByName}`);
      u.send(`  Desc    : ${ev.description}`);

      const allRsvps = await eventRsvps.find({ eventId: ev.id });
      const summary = summarizeRsvps(allRsvps);
      const cap = ev.maxAttendees > 0 ? `/${ev.maxAttendees}` : "";

      u.send(
        `%ch  RSVPs:%cn ${summary.attendingCount}${cap} attending, ${summary.maybeCount} maybe`,
      );
      if (summary.attending.length) {
        u.send(
          `    Attending: ${
            summary.attending.map((r) => r.playerName).join(", ")
          }`,
        );
      }
      if (summary.maybe.length) {
        u.send(
          `    Maybe    : ${summary.maybe.map((r) => r.playerName).join(", ")}`,
        );
      }

      const myRsvp = allRsvps.find((r) => r.playerId === u.me.id);
      if (myRsvp) {
        u.send(`  Your RSVP: ${rsvpColor(myRsvp.status)}${myRsvp.status}%cn`);
      } else {
        u.send(
          '  Use "+event/rsvp <#>" to RSVP, "+event/rsvp <#>=maybe" for maybe.',
        );
      }
      return;
    }

    if (sw === "rsvp") {
      const eqIdx = arg.indexOf("=");
      const numStr = eqIdx !== -1 ? arg.slice(0, eqIdx).trim() : arg;
      const choice = eqIdx !== -1 ? arg.slice(eqIdx + 1).trim() : "attending";
      const num = parseInt(numStr, 10);

      if (isNaN(num)) {
        u.send("Usage: +event/rsvp <#>[=attending|maybe|decline]");
        return;
      }

      const ev = await getEventByNumber(num);
      if (!ev) {
        u.send(`%ch+event:%cn No event #${num} found.`);
        return;
      }

      const result = await upsertRsvp({
        event: ev,
        playerId: u.me.id,
        playerName: u.me.name || u.me.id,
        statusRaw: choice,
      });
      if (!result.ok) {
        if (result.error === "Event is cancelled") {
          u.send("%ch+event:%cn That event has been cancelled.");
        } else if (result.error === "Event has already occurred") {
          u.send("%ch+event:%cn That event has already occurred.");
        } else if (result.error === "Event is at capacity") {
          u.send(
            `%ch+event:%cn Sorry, event #${num} is full (${ev.maxAttendees}/${ev.maxAttendees}).`,
          );
        } else {
          u.send(`%ch+event:%cn ${result.error}`);
        }
        return;
      }

      const status = result.value.rsvp.status;
      if (result.value.created) {
        u.send(
          `%ch+event:%cn RSVP'd ${
            rsvpColor(status)
          }${status}%cn for "${ev.title}".`,
        );
      } else {
        u.send(
          `%ch+event:%cn RSVP updated to ${
            rsvpColor(status)
          }${status}%cn for "${ev.title}".`,
        );
      }
      return;
    }

    if (sw === "unrsvp") {
      const num = parseInt(arg, 10);
      if (isNaN(num)) {
        u.send("Usage: +event/unrsvp <#>");
        return;
      }

      const ev = await getEventByNumber(num);
      if (!ev) {
        u.send(`%ch+event:%cn No event #${num} found.`);
        return;
      }

      const result = await cancelRsvp({ event: ev, playerId: u.me.id });
      if (!result.ok) {
        u.send("%ch+event:%cn You have no RSVP to cancel.");
        return;
      }
      u.send(`%ch+event:%cn RSVP cancelled for "${ev.title}".`);
      return;
    }

    if (sw === "create") {
      if (!isStaff(u)) {
        u.send("%ch+event:%cn Permission denied.");
        return;
      }

      const parsed = parseCreateArg(arg);
      if (!parsed.ok) {
        u.send(
          parsed.error.startsWith("Invalid")
            ? `%ch+event:%cn ${parsed.error}`
            : parsed.error,
        );
        return;
      }

      const created = await createEvent({
        title: parsed.title,
        description: parsed.description,
        startTime: parsed.startTime,
        createdBy: u.me.id,
        createdByName: u.me.name || u.me.id,
      });
      if (!created.ok) {
        u.send(`%ch+event:%cn ${created.error}`);
        return;
      }
      u.send(
        `%ch+event:%cn Event #${created.value.number} "${parsed.title}" created for ${
          formatDateTime(parsed.startTime)
        }.`,
      );
      return;
    }

    if (sw === "edit") {
      if (!isStaff(u)) {
        u.send("%ch+event:%cn Permission denied.");
        return;
      }

      const slash = arg.indexOf("/");
      const eq = arg.indexOf("=");
      if (slash === -1 || eq === -1 || eq < slash) {
        u.send("Usage: +event/edit <#>/<field>=<value>");
        return;
      }

      const num = parseInt(arg.slice(0, slash).trim(), 10);
      const field = arg.slice(slash + 1, eq).trim().toLowerCase();
      const value = arg.slice(eq + 1).trim();
      if (isNaN(num)) {
        u.send("Usage: +event/edit <#>/<field>=<value>");
        return;
      }

      const ev = await getEventByNumber(num);
      if (!ev) {
        u.send(`%ch+event:%cn No event #${num} found.`);
        return;
      }

      const result = await editEventField(ev, field, value);
      if (!result.ok) {
        u.send(`%ch+event:%cn ${result.error}`);
        return;
      }
      u.send(`%ch+event:%cn Event #${num} updated (${field}).`);
      return;
    }

    if (sw === "status") {
      if (!isStaff(u)) {
        u.send("%ch+event:%cn Permission denied.");
        return;
      }

      const eqIdx = arg.indexOf("=");
      if (eqIdx === -1) {
        u.send(
          "Usage: +event/status <#>=<upcoming|active|completed|cancelled>",
        );
        return;
      }
      const num = parseInt(arg.slice(0, eqIdx).trim(), 10);
      const statusRaw = arg.slice(eqIdx + 1).trim();

      if (isNaN(num)) {
        u.send("Usage: +event/status <#>=<status>");
        return;
      }

      const ev = await getEventByNumber(num);
      if (!ev) {
        u.send(`%ch+event:%cn No event #${num} found.`);
        return;
      }

      const result = await setEventStatus(ev, statusRaw);
      if (!result.ok) {
        u.send(`%ch+event:%cn ${result.error}`);
        return;
      }
      const status = result.value.status;
      u.send(
        `%ch+event:%cn Event #${num} status set to ${
          statusColor(status)
        }${status}%cn.`,
      );
      return;
    }

    if (sw === "cancel") {
      if (!isStaff(u)) {
        u.send("%ch+event:%cn Permission denied.");
        return;
      }
      const num = parseInt(arg, 10);
      if (isNaN(num)) {
        u.send("Usage: +event/cancel <#>");
        return;
      }

      const ev = await getEventByNumber(num);
      if (!ev) {
        u.send(`%ch+event:%cn No event #${num} found.`);
        return;
      }

      await cancelEvent(ev);
      u.send(
        `%ch+event:%cn Event #${num} "${ev.title}" has been %ch%crcancelled%cn.`,
      );
      return;
    }

    if (sw === "delete") {
      if (!isStaff(u)) {
        u.send("%ch+event:%cn Permission denied.");
        return;
      }
      const num = parseInt(arg, 10);
      if (isNaN(num)) {
        u.send("Usage: +event/delete <#>");
        return;
      }

      const ev = await getEventByNumber(num);
      if (!ev) {
        u.send(`%ch+event:%cn No event #${num} found.`);
        return;
      }

      await deleteEvent(ev);
      u.send(`%ch+event:%cn Event #${num} deleted.`);
      return;
    }

    u.send("%ch+event usage:%cn");
    u.send("  +event [/list]                           — list upcoming events");
    u.send(
      "  +event/view <#>                          — event details + RSVPs",
    );
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
  category: "Social",
  help: `+events  — List all upcoming events. Alias for "+event/list".

Examples:
  +events    Show the event calendar.`,
  exec: async (u: IUrsamuSDK) => {
    await sendEventList(u);
  },
});

