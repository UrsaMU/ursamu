import { assertEquals, assertExists } from "@std/assert";
import {
  feedLayout,
  rulingLayout,
  sphereLayout,
  weekLayout,
  youLayout,
} from "../src/layouts.ts";
import type { IChar, ICity, ISphereNpc } from "../src/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const city: ICity = {
  id: "city",
  name: "New Cascadia",
  week: 12,
  tension: {
    id: "weeds",
    title: "Stack-weeds in the grates",
    severity: 3,
    ongoing: true,
  },
  stories: [
    { id: "lockout", title: "Saito lockout", severity: 5 },
  ],
};

const mira: IChar = {
  id: "1",
  name: "Mira",
  danger: 2,
  resources: 8,
  bravado: 1,
  lifestyle: 2,
  plan: "Get the sample.",
  ready: true,
  lockedDv: 18,
  dangerAdded: false,
  goals: ["Find a vaccine lead"],
  location: "room1",
};

Deno.test("feedLayout pins city week stories", OPTS, () => {
  const ui = feedLayout(city);
  assertEquals(ui.meta.type, "utopia-feed");
  assertEquals(ui.meta.city, "New Cascadia");
  assertEquals(ui.meta.week, 12);
  assertEquals(ui.meta.stories[0].title, "Stack-weeds in the grates");
  assertEquals(ui.meta.stories[0].severity, 3);
  assertExists(ui.text);
  assertEquals(ui.text.includes("New Cascadia"), true);
});

Deno.test("weekLayout crew ready pips", OPTS, () => {
  const jane: IChar = {
    ...mira,
    id: "2",
    name: "Jane",
    ready: false,
    plan: "Watch the door.",
  };
  const ui = weekLayout(city, [mira, jane]);
  assertEquals(ui.meta.type, "utopia-week");
  const crew = ui.components.find((c) =>
    c.type === "entity-list"
  );
  assertExists(crew);
  const items = crew.items as Array<{
    label: string;
    meta: string;
    action?: { cmd: string };
  }>;
  assertEquals(items[0].meta, "ready");
  assertEquals(items[0].action?.cmd, "+week/ready");
  assertEquals(items[1].meta, "wait");
});

Deno.test("rulingLayout faces", OPTS, () => {
  const ui = rulingLayout({
    result: "hitch",
    prose: "The night watch logged your face.",
    danger: "2 → 3",
    dv: 18,
  });
  assertEquals(ui.meta.type, "utopia-ruling");
  assertEquals(ui.meta.result, "hitch");
  assertEquals(ui.text.includes("night watch"), true);
});

Deno.test("sphereLayout lists rep", OPTS, () => {
  const npcs: ISphereNpc[] = [{
    id: "n1",
    playerId: "1",
    name: "Ms Mao",
    rep: -1,
    job: "parts",
  }];
  const ui = sphereLayout(mira, npcs);
  assertEquals(ui.meta.type, "utopia-sphere");
  assertEquals(ui.text.includes("Ms Mao"), true);
});

Deno.test("youLayout shows numbers", OPTS, () => {
  const ui = youLayout(mira);
  assertEquals(ui.meta.type, "utopia-you");
  assertEquals(ui.text.includes("Danger"), true);
  assertEquals(ui.text.includes("2"), true);
});
