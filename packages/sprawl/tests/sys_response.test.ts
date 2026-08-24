import { assertEquals, assert } from "@std/assert";
import { defaultChar } from "../db/schemas.ts";
import { equipConsole, consoleSpec } from "../engine/net.ts";
import {
  applySystemResponse,
  bankNetExploit,
  hackBlockedReason,
  tickNetState,
  tryCleanMalware,
} from "../engine/sys-response.ts";
import type { SysResponse } from "../engine/net.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function sys(
  slug: string,
  extra: Partial<SysResponse> = {},
): SysResponse {
  return {
    slug,
    name: slug,
    blurb: slug,
    extraNeural: 0,
    forceGlitch: false,
    tags: [],
    ...extra,
  };
}

function seqRng(vals: number[]): () => number {
  let i = 0;
  return () => vals[i++ % vals.length]!;
}

Deno.test("lockout blocks hack", OPTS, () => {
  let c = defaultChar("N");
  c = equipConsole(c, "hyperion") as typeof c;
  const r = applySystemResponse(
    c,
    sys("locked-out", {
      duration: "1d6h",
      tags: ["lockout"],
    }),
    () => 0.99,
  );
  assert(r.next.net?.lockoutUntil);
  assert(hackBlockedReason(r.next));
});

Deno.test("malware-i reduces effective RAM", OPTS, () => {
  let c = defaultChar("N");
  c = equipConsole(c, "hyperion") as typeof c;
  assertEquals(consoleSpec(c)!.ram, 3);
  const r = applySystemResponse(
    c,
    sys("malware-i", {
      duration: "2d6m",
      tags: ["malware", "ram-loss"],
    }),
    () => 0.5,
  );
  assertEquals(r.next.net?.ramPenalty, 1);
  assertEquals(consoleSpec(r.next)!.ram, 2);
});

Deno.test("malware-ii wipes software", OPTS, () => {
  let c = defaultChar("N");
  c = equipConsole(c, "hyperion") as typeof c;
  c = {
    ...c,
    software: ["tunnel-rat", "hunter", "cloak"],
  };
  const r = applySystemResponse(
    c,
    sys("malware-ii", { tags: ["malware", "wipe-soft"] }),
    seqRng([0.99]), // d6=6 wipe all if possible
  );
  assert(r.next.software.length < 3);
  assert(r.notes.some((n) => n.includes("wiped")));
});

Deno.test("ice-i raises iceDsBonus", OPTS, () => {
  let c = defaultChar("N");
  c = equipConsole(c, "nimbus") as typeof c;
  const r = applySystemResponse(
    c,
    sys("ice-i", {
      forceGlitch: true,
      tags: ["ice", "ds-up"],
      dsUp: "1d6",
    }),
    () => 0.99,
  );
  assert((r.next.net?.iceDsBonus ?? 0) >= 1);
  assert((r.next.pendingGlitch ?? 0) >= 1);
});

Deno.test("system-update closes banked exploit", OPTS, () => {
  let c = defaultChar("N");
  c = equipConsole(c, "hyperion") as typeof c;
  c = bankNetExploit(c, "vulnerability");
  assertEquals(c.net?.exploits?.length, 1);
  const r = applySystemResponse(
    c,
    sys("system-update", { tags: ["counter-exploit"] }),
  );
  assertEquals((r.next.net?.exploits ?? []).length, 0);
  assert(r.notes.some((n) => n.includes("vulnerability")));
});

Deno.test("gestalt immune to malware", OPTS, () => {
  let c = defaultChar("N");
  c = {
    ...c,
    stats: { ...c.stats, cognition: 3 },
    augs: [{ slug: "savvy-jack", name: "Savvy Jack" }],
  };
  c = equipConsole(c, "gestalt") as typeof c;
  const r = applySystemResponse(
    c,
    sys("malware-i", {
      duration: "2d6m",
      tags: ["malware", "ram-loss"],
    }),
  );
  assert(r.notes.some((n) => n.includes("immune")));
  assert(!r.next.net?.ramPenalty);
});

Deno.test("npod immune neurostim", OPTS, () => {
  let c = defaultChar("N");
  c = equipConsole(c, "npod") as typeof c;
  const r = applySystemResponse(
    c,
    sys("neurostim-i", {
      duration: "2d6h",
      tags: ["neurostim"],
    }),
  );
  assert(r.notes.some((n) => n.includes("filters")));
});

Deno.test("malware-iv clean path", OPTS, () => {
  let c = defaultChar("N");
  c = equipConsole(c, "hyperion") as typeof c;
  c = {
    ...c,
    stats: { ...c.stats, cognition: 5 },
    net: { malwareCleanDs: 2 },
  };
  assert(hackBlockedReason(c));
  const r = tryCleanMalware(c, () => 0.99);
  assert(r.notes[0]?.includes("purged"));
  assertEquals(r.next.net?.malwareCleanDs, undefined);
  assertEquals(hackBlockedReason(tickNetState(r.next)), null);
});

Deno.test("overload burns drive RAM to 0", OPTS, () => {
  let c = defaultChar("N");
  c = equipConsole(c, "hyperion") as typeof c;
  const r = applySystemResponse(
    c,
    sys("overload", {
      tags: ["console-damage", "fire"],
      extraNeural: 1,
    }),
  );
  assert(r.next.net?.driveBurned);
  assertEquals(consoleSpec(r.next)!.ram, 0);
});

Deno.test("surge-ii applies cog penalty", OPTS, () => {
  let c = defaultChar("N");
  c = equipConsole(c, "hyperion") as typeof c;
  const r = applySystemResponse(
    c,
    sys("surge-ii", {
      tags: ["surge", "stat-loss"],
      forceGlitch: true,
    }),
    () => 0.99,
  );
  assert((r.next.net?.cogPenalty ?? 0) >= 1);
});
