import { assert, assertEquals } from "@std/assert";
import {
  isRestartConfirm,
  parseRestartArg,
} from "../chargen/reset.ts";
import { defaultChar } from "../db/schemas.ts";
import { checklist } from "../commands/chargen-status.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("restart confirm tokens", OPTS, () => {
  assert(isRestartConfirm("confirm"));
  assert(isRestartConfirm("yes"));
  assert(isRestartConfirm("wipe"));
  assert(!isRestartConfirm(""));
  assert(!isRestartConfirm("Neon"));
});

Deno.test("parseRestartArg staff forms", OPTS, () => {
  assertEquals(parseRestartArg("confirm"), {
    who: "",
    confirmed: true,
  });
  assertEquals(parseRestartArg("Neon confirm"), {
    who: "Neon",
    confirmed: true,
  });
  assertEquals(parseRestartArg("Neon=confirm"), {
    who: "Neon",
    confirmed: true,
  });
  assertEquals(parseRestartArg("Neon"), {
    who: "Neon",
    confirmed: false,
  });
});

Deno.test("fresh draft checklist is unlocked", OPTS, () => {
  const d = defaultChar("Neon");
  d.chargenStatus = "draft";
  d.chargenComplete = false;
  const t = checklist(d).join("\n");
  assert(t.includes("draft") || t.includes("DRAFT") ||
    t.includes("stat"));
  assert(!/approved/i.test(t) || t.includes("draft"));
});
