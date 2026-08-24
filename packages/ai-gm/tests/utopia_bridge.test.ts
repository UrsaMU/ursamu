import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  cityHumanPrompt,
  poseSuffixFor,
} from "../prompts/templates.ts";
import { weekRoundSummary } from "../hooks-utopia.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("poseSuffixFor utopia skips CPR mission", OPTS, () => {
  const s = poseSuffixFor("utopia", true);
  assertStringIncludes(s, "city of Utopia");
  assertEquals(s.includes("Night City"), false);
});

Deno.test("poseSuffixFor cpr keeps mission", OPTS, () => {
  const s = poseSuffixFor("cyberpunk-red", true);
  assertStringIncludes(s, "MISSION");
});

Deno.test("weekRoundSummary is plain text", OPTS, () => {
  const n = weekRoundSummary({
    roomId: "10",
    week: 12,
    city: "New Cascadia",
    summary: "Mira: Get the sample.",
  });
  assertStringIncludes(n, "Room: 10");
  assertStringIncludes(n, "Get the sample.");
  assertEquals(n.includes("%c"), false);
});

Deno.test("cityHumanPrompt roll forbids new math", OPTS, () => {
  const h = cityHumanPrompt(
    "roll",
    "Mira hack: 14 vs DV 18 — HITCH",
  );
  assertStringIncludes(h, "HITCH");
  assertStringIncludes(h, "law");
  assertStringIncludes(h, "Do not restate the math");
});

Deno.test("cityHumanPrompt feed keeps bulletin", OPTS, () => {
  const h = cityHumanPrompt(
    "feed",
    "Week 13 New Cascadia: weeds sev 3",
  );
  assertStringIncludes(h, "newsfeed");
  assertStringIncludes(h, "weeds sev 3");
});
