import { assert, assertEquals } from "@std/assert";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("wield pattern matches bare and args", OPTS, async () => {
  // Import through plugin command tree
  await import("../commands/gear-slots.ts");
  const { cmds } = await import("@ursamu/ursamu");
  const wield = cmds.filter((c) => c.name === "wield" || c.name === "+wield");
  console.log("wield cmds", wield.map((c) => c.name + " " + c.pattern));
  assert(wield.length >= 1, "wield registered");
  const pat = wield.find((c) => c.name === "wield")!.pattern;
  assert(pat.test("wield"));
  assert(pat.test("wield #1"));
  assert(pat.test("wield pkd-45"));
  assert(!pat.test("wielding a sword")); // must not steal speech
  const m = "wield pkd-45".match(pat)!;
  assertEquals((m[1] ?? "").trim(), "pkd-45");
  // should NOT match as say-default only when unmatched
  const { shouldDefaultToSay } = await import(
    "../../mush/src/commands/addCmd.ts"
  ).catch(async () => {
    return await import("@ursamu/mush");
  });
  // If import fails skip
  if (typeof shouldDefaultToSay === "function") {
    assert(shouldDefaultToSay("wield foo")); // would say IF unmatched
  }
});

Deno.test("first matching cmd for wield input", OPTS, async () => {
  await import("../commands.ts");
  const { cmds } = await import("@ursamu/ursamu");
  const input = "wield pkd-45";
  const hits = cmds.filter((c) => c.pattern.test(input));
  console.log(
    "hits for wield pkd-45:",
    hits.map((c) => c.name).slice(0, 20),
  );
  assert(hits.some((c) => c.name === "wield" || c.name === "+wield"));
  // First hit in registry order
  const first = cmds.find((c) => c.pattern.test(input));
  console.log("FIRST match:", first?.name, String(first?.pattern));
});
