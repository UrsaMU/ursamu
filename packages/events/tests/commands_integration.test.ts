/**
 * Command-path integration via the shared service (same mutations +event uses).
 * Avoids loading addCmd / full SDK.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { formatDateTime } from "../src/db.ts";
import {
  filterVisibleEvents,
  formatCapacity,
  parseCreateArg,
  rsvpColor,
  sortEventsByStart,
  statusColor,
} from "../src/helpers.ts";
import {
  createEvent,
  getEventByNumber,
  listEvents,
  upsertRsvp,
} from "../src/service.ts";
import type { IGameEvent } from "../src/types.ts";
import {
  installMemoryDb,
  OPTS,
  resetCollections,
  seedPlayer,
} from "./harness.ts";

/** Minimal mock of the list-rendering path used by +event/+events. */
function renderList(
  events: IGameEvent[],
  attendingCounts: Map<string, number>,
): string[] {
  const lines: string[] = [];
  const visible = sortEventsByStart(filterVisibleEvents(events, false));
  if (!visible.length) {
    lines.push("No upcoming events.");
    return lines;
  }
  for (const e of visible) {
    const n = attendingCounts.get(e.id) || 0;
    lines.push(
      `#${e.number} ${e.title} ${formatDateTime(e.startTime)} ` +
        `${formatCapacity(n, e.maxAttendees)} ${statusColor(e.status)}${e.status}`,
    );
  }
  return lines;
}

Deno.test(
  "command path: create parse + list render + rsvp message colors",
  OPTS,
  async () => {
    const restore = installMemoryDb();
    try {
      await resetCollections();
      seedPlayer("staff-1", { name: "Ada", staff: true });
      seedPlayer("p-1", { name: "Bob" });

      const parsed = parseCreateArg(
        "Summer Gala=2030-08-01 19:00/Annual gathering",
      );
      assertEquals(parsed.ok, true);
      if (!parsed.ok) return;

      const created = await createEvent({
        title: parsed.title,
        description: parsed.description,
        startTime: parsed.startTime,
        createdBy: "staff-1",
        createdByName: "Ada",
      });
      assertEquals(created.ok, true);
      if (!created.ok) return;

      const rsvp = await upsertRsvp({
        event: created.value,
        playerId: "p-1",
        playerName: "Bob",
        statusRaw: "attending",
      });
      assertEquals(rsvp.ok, true);
      if (!rsvp.ok) return;

      const msg =
        `RSVP'd ${rsvpColor(rsvp.value.rsvp.status)}${rsvp.value.rsvp.status}%cn for "${created.value.title}".`;
      assertStringIncludes(msg, "attending");
      assertStringIncludes(msg, "Summer Gala");

      const all = await listEvents({ staff: true });
      const lines = renderList(
        all,
        new Map([[created.value.id, 1]]),
      );
      assertEquals(lines.length, 1);
      assertStringIncludes(lines[0]!, "Summer Gala");
      assertStringIncludes(lines[0]!, "1");

      const loaded = await getEventByNumber(created.value.number);
      assertEquals(loaded?.title, "Summer Gala");
    } finally {
      restore();
    }
  },
);
