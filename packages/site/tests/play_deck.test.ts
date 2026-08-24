/**
 * Pin-state for the Utopia /play deck.
 * Seams: layoutType, pinSlot, rememberPin, pinsVisible,
 * mastheadFromFeed, crewFromWeek, rulingFace, dockChips.
 */
import {
  assertEquals,
  assertExists,
} from "@std/assert";
import {
  crewFromWeek,
  dockChips,
  emptyDeck,
  layoutType,
  mastheadFromFeed,
  pinSlot,
  pinsVisible,
  rememberPin,
  rulingFace,
} from "../src/play-deck.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const feedUi = {
  meta: {
    type: "utopia-feed",
    city: "New Cascadia",
    week: 12,
    stories: [
      { title: "weeds", severity: 3 },
      { title: "corp war", severity: 5 },
    ],
  },
  components: [{ type: "header", title: "Week 12" }],
};

const weekUi = {
  meta: {
    type: "utopia-week",
    plan: "Get the sample.",
  },
  components: [{
    type: "entity-list",
    title: "Crew",
    items: [
      { label: "Mira", meta: "ready", action: { cmd: "+week/ready" } },
      { label: "Jane", meta: "wait" },
    ],
  }],
};

Deno.test("layoutType reads meta.type", OPTS, () => {
  assertEquals(layoutType(feedUi), "utopia-feed");
  assertEquals(layoutType({}), "");
  assertEquals(layoutType(null), "");
});

Deno.test("pinSlot only feed and week", OPTS, () => {
  assertEquals(pinSlot("utopia-feed"), "feed");
  assertEquals(pinSlot("utopia-week"), "week");
  assertEquals(pinSlot("utopia-ruling"), null);
  assertEquals(pinSlot("utopia-sphere"), null);
  assertEquals(pinSlot("look"), null);
});

Deno.test("rememberPin stores last feed and week", OPTS, () => {
  let s = emptyDeck();
  assertEquals(pinsVisible(s), false);
  s = rememberPin(s, feedUi);
  s = rememberPin(s, weekUi);
  assertEquals(pinsVisible(s), true);
  assertExists(s.feed);
  assertExists(s.week);
  s = rememberPin(s, { meta: { type: "look" } });
  assertEquals(s.feed, feedUi);
});

Deno.test("rememberPin ignores non-objects", OPTS, () => {
  const s = rememberPin(emptyDeck(), "nope");
  assertEquals(pinsVisible(s), false);
});

Deno.test("mastheadFromFeed uses meta city week stories", OPTS, () => {
  const m = mastheadFromFeed(feedUi);
  assertEquals(m.city, "New Cascadia");
  assertEquals(m.week, "12");
  assertEquals(m.stories.length, 2);
  assertEquals(m.stories[0].severity, 3);
});

Deno.test("mastheadFromFeed empty on junk", OPTS, () => {
  const m = mastheadFromFeed({ meta: { type: "look" } });
  assertEquals(m.city, "");
  assertEquals(m.stories.length, 0);
});

Deno.test("crewFromWeek reads ready pips", OPTS, () => {
  const crew = crewFromWeek(weekUi);
  assertEquals(crew.length, 2);
  assertEquals(crew[0].name, "Mira");
  assertEquals(crew[0].ready, true);
  assertEquals(crew[1].ready, false);
  assertEquals(crew[0].cmd, "+week/ready");
});

Deno.test("rulingFace maps result", OPTS, () => {
  assertEquals(
    rulingFace({ meta: { type: "utopia-ruling", result: "hitch" } }),
    "HITCH",
  );
  assertEquals(
    rulingFace({ meta: { type: "utopia-ruling", result: "holds" } }),
    "HOLDS",
  );
  assertEquals(
    rulingFace({ meta: { type: "utopia-ruling", result: "fails" } }),
    "FAILS",
  );
  assertEquals(
    rulingFace({ meta: { type: "utopia-ruling", result: "revised" } }),
    "REVISED",
  );
  assertEquals(rulingFace({ meta: { type: "look" } }), "");
});

Deno.test("dockChips send existing verbs", OPTS, () => {
  const ids = dockChips.map((c) => c.id);
  assertEquals(ids, [
    "plan",
    "job",
    "info",
    "hack",
    "low",
    "more",
  ]);
  assertEquals(dockChips[0].cmd, "+week");
  assertEquals(dockChips[1].cmd, "+act take-job");
  assertEquals(dockChips[2].cmd, "+act gather-information");
});
