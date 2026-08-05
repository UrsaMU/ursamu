/**
 * +sheet web layout builder + sheetExec web path.
 */
import {
  assertEquals,
  assertStringIncludes,
} from "@std/assert";
import { defaultSheet } from "../src/stats/sheet.ts";
import { buildSheetWebLayout } from "../src/sheet/web-layout.ts";
import { sheetExec } from "../src/commands/sheet.ts";
import { mockPlayer, mockU } from "./helpers/mockU.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("buildSheetWebLayout: attrs skills health", OPTS, () => {
  const sheet = defaultSheet();
  sheet.concept = "Lost courier";
  sheet.template = "changeling";
  sheet.customFields = {
    seeming: "Beast",
    kith: "Hunterheart",
    court: "Autumn",
  };
  sheet.attributes.intelligence = 3;
  sheet.skills.athletics = 2;
  sheet.merits = { giant: 4 };
  sheet.health = { bashing: 1, lethal: 0, aggravated: 0 };
  sheet.advantages.willpowerMax = 4;
  sheet.advantages.willpowerCurrent = 3;

  const lay = buildSheetWebLayout("Alice", sheet, { mode: "live" });
  assertEquals(lay.meta.type, "sheet");
  const types = lay.components.map((c) => c.type);
  assertEquals(types.includes("header"), true);
  assertEquals(types.includes("stat-cols"), true);
  assertEquals(types.includes("track-row"), true);
  assertEquals(types.includes("list"), true);

  const attrs = lay.components.find(
    (c) => c.type === "stat-cols" && c.title === "Attributes",
  ) as {
    columns?: Array<{ rows?: Array<{ label: string; value: number }> }>;
  };
  const mental = attrs?.columns?.[0]?.rows ?? [];
  const intel = mental.find((r) => r.label === "Intelligence");
  assertEquals(intel?.value, 3);

  const health = lay.components.find(
    (c) => c.type === "track-row" && c.label === "Health",
  ) as { kinds?: string[] };
  assertEquals((health?.kinds?.length ?? 0) > 0, true);
  assertEquals(health?.kinds?.[0], "bash");

  const merits = lay.components.find(
    (c) => c.type === "list" && c.title === "Merits",
  ) as { content?: string[] };
  assertStringIncludes(
    (merits?.content ?? []).join(" "),
    "Giant",
  );
});

Deno.test("sheetExec web: layout not plain send", OPTS, async () => {
  const layouts: unknown[] = [];
  const me = mockPlayer({
    id: "p1",
    name: "Tester",
    state: {
      name: "Tester",
      cofd: defaultSheet(),
    },
  });
  const base = mockU({ me });
  const u = Object.assign(base, {
    clientType: "web",
    ui: {
      layout: (opt: unknown) => {
        layouts.push(opt);
      },
    },
    cmd: {
      name: "+sheet",
      original: "+sheet",
      args: [""],
      switches: [],
    },
  });
  await sheetExec(u as never);
  assertEquals(layouts.length, 1);
  const lay = layouts[0] as {
    meta?: { type?: string };
    components?: unknown[];
  };
  assertEquals(lay.meta?.type, "sheet");
  assertEquals((lay.components?.length ?? 0) > 2, true);
  // web path should not dump full ASCII sheet
  assertEquals(
    (u as { _sent: string[] })._sent.length,
    0,
  );
});
