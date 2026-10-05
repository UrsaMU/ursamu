import { assertEquals, assert } from "@std/assert";
import { defaultChar } from "../db/schemas.ts";
import { equipConsole, installSoftware } from "../engine/net.ts";
import {
  planSpawnFromResponse,
  queueHeatSpawn,
  pendingSpawnLines,
} from "../engine/heat-spawn.ts";
import { defendConsole } from "../engine/net-hardware.ts";
import { immuneAntiPersonnel } from "../engine/hull-specials.ts";
import { consoleSpec } from "../engine/net.ts";
import { applySystemResponses } from "../engine/sys-response.ts";
import type { SysResponse } from "../engine/net.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function sys(slug: string): SysResponse {
  return {
    slug,
    name: slug,
    blurb: slug,
    extraNeural: 0,
    forceGlitch: false,
    tags: ["realspace"],
  };
}

Deno.test("seekers plan spawn", OPTS, () => {
  const p = planSpawnFromResponse("seekers", () => 0.5);
  assert(p);
  assertEquals(p!.slug, "corporate-security");
  assert(p!.count >= 1);
});

Deno.test("queue heat spawn on sheet", OPTS, () => {
  let c = defaultChar("N");
  c = equipConsole(c, "hyperion") as typeof c;
  const r = queueHeatSpawn(c, "tac-team", () => 0.5);
  assert((r.next.net?.pendingSpawns?.length ?? 0) >= 1);
  assert(r.note?.includes("inbound"));
  assert(pendingSpawnLines(r.next).length >= 1);
});

Deno.test("apply seekers queues spawn", OPTS, () => {
  let c = defaultChar("N");
  c = equipConsole(c, "hyperion") as typeof c;
  const a = applySystemResponses(c, [sys("seekers")], () => 0.5);
  assert(
    (a.next.net?.pendingSpawns?.length ?? 0) >= 1 ||
      a.notes.some((n) => /inbound|seeker/i.test(n)),
  );
});

Deno.test("Nimbus is AP immune", OPTS, () => {
  let c = defaultChar("N");
  c = equipConsole(c, "nimbus") as typeof c;
  assert(immuneAntiPersonnel(consoleSpec(c)!));
});

Deno.test("firewall defend breach adds heat", OPTS, () => {
  let c = defaultChar("N");
  c = equipConsole(c, "eye-phones") as typeof c; // FW 10
  const r = defendConsole(c, 20);
  assert(!r.held);
  assert((r.next.net?.heat ?? 0) >= 1);
});

Deno.test("demon pack UI data present after pack", OPTS, () => {
  let c = defaultChar("N");
  c = {
    ...c,
    stats: { ...c.stats, cognition: 3 },
  };
  c = equipConsole(c, "hyperion") as typeof c;
  for (const s of ["demon-i", "hunter", "cloak"]) {
    c = installSoftware(c, s) as typeof c;
  }
  assert(c.software.includes("demon-i"));
});
