/**
 * JSON frames are the contract. Telnet still gets chrome text.
 */
import { assertEquals } from "@std/assert";
import {
  buildFightPayload,
  buildRollPayload,
  buildSheetPayload,
  emitSprawl,
  prefersSprawlJson,
  sheetGear,
  SPRAWL_UI,
} from "../commands/frame.ts";
import { resolveAction } from "../engine/action.ts";
import { defaultChar } from "../db/schemas.ts";
import { mockPlayer, mockU } from "./helpers/mockU.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function webU() {
  const layouts: unknown[] = [];
  const u = mockU();
  (u as { clientType?: string }).clientType = "web";
  (u as { ui?: { layout: (o: unknown) => void } }).ui = {
    layout: (o) => {
      layouts.push(o);
    },
  };
  return Object.assign(u, { _layouts: layouts });
}

Deno.test("prefers JSON only for web layout sessions", OPTS, () => {
  const telnet = mockU();
  assertEquals(prefersSprawlJson(telnet), false);
  const web = webU();
  assertEquals(prefersSprawlJson(web), true);
});

Deno.test("emitSprawl sends layout JSON to web, not tape text", OPTS, () => {
  const u = webU();
  emitSprawl(u, "sheet", { name: "NEON" }, "SHEET TEXT");
  assertEquals(u._sent.length, 0);
  assertEquals(u._layouts.length, 1);
  const layout = u._layouts[0] as {
    meta: { type: string; kind: string; data: { name: string } };
    components: Array<{ type: string }>;
  };
  assertEquals(layout.meta.type, SPRAWL_UI);
  assertEquals(layout.meta.kind, "sheet");
  assertEquals(layout.meta.data.name, "NEON");
  assertEquals(layout.components[0].type, "header");
});

Deno.test("emitSprawl sends chrome text to telnet", OPTS, () => {
  const u = mockU();
  emitSprawl(u, "sheet", { name: "NEON" }, "SHEET TEXT");
  assertEquals(u._sent, ["SHEET TEXT"]);
});

Deno.test("buildSheetPayload is the sheet UI contract", OPTS, () => {
  const c = defaultChar("Neon");
  c.chargenComplete = true;
  c.stats.morphology = 2;
  c.stats.cognition = 1;
  c.resilience = 9;
  c.resilienceMax = 12;
  c.bityuan = 400;
  c.ap = 20;
  c.apTotal = 120;
  c.level = 2;
  c.backgroundName = "Fixer";
  c.edgeName = "Street Sense";
  c.quirks = ["twitchy"];
  c.augs = [{ slug: "cybereye", name: "Cybereye" }];
  const payload = buildSheetPayload(c, {
    name: "Neon",
    load: 3,
    loadMax: 10,
    gear: [{ name: "holdout", load: 1, slot: "wielded" }],
  });
  assertEquals(payload.status, "LIVE");
  assertEquals(payload.role, "FIXER");
  assertEquals(payload.stats.morphology, 2);
  assertEquals(payload.resilience, 9);
  assertEquals(payload.cash, 400);
  assertEquals(payload.edge, "Street Sense");
  assertEquals(payload.augs[0].slug, "cybereye");
  assertEquals(payload.gear[0].slot, "wielded");
  assertEquals(payload.critical, null);
});

Deno.test("buildRollPayload is the dice UI contract", OPTS, () => {
  const result = resolveAction({
    stat: "reaction",
    statValue: 2,
    bonuses: 1,
    ds: 10,
    dangerous: true,
  }, () => 0.99);
  const payload = buildRollPayload(result, {
    verb: "attack",
    title: "ATTACK",
    parts: ["burst+2"],
    target: "thug",
  });
  expectFields(payload, result.success);
  assertEquals(payload.verb, "attack");
  assertEquals(payload.statShort, "REA");
  assertEquals(payload.ds, 10);
  assertEquals(payload.target, "thug");
  assertEquals(payload.parts, ["burst+2"]);
});

Deno.test("buildFightPayload is the injury UI contract", OPTS, () => {
  const payload = buildFightPayload({
    verb: "damage",
    who: "Neon",
    resilience: 4,
    resilienceMax: 12,
    amount: -3,
    note: "RES 0",
    critical: {
      severity: 2,
      severityName: "serious",
      location: "chest",
      effect: "bleed",
      at: 1,
    },
  });
  assertEquals(payload.verb, "damage");
  assertEquals(payload.ok, true);
  assertEquals(payload.resilience, 4);
  assertEquals(payload.critical?.location, "chest");
});

function expectFields(
  payload: { statValue: number; dice: number[] },
  _ok: boolean,
): void {
  assertEquals(payload.statValue, 2);
  assertEquals(payload.dice.length > 0, true);
}

Deno.test("sheetGear maps carried Things", OPTS, () => {
  const gun = mockPlayer({
    id: "thing1",
    name: "Holdout",
    state: { sprawl_item: { slug: "holdout", load: 1, slot: "wielded" } },
  });
  const rows = sheetGear([gun]);
  assertEquals(rows, [{ name: "Holdout", load: 1, slot: "wielded" }]);
});
