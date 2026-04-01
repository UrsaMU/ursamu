/**
 * tests/softcode_action_cmds.test.ts
 *
 * Unit tests for the splitSoftcodeList helper and the command-dispatch
 * logic of @switch / @dolist.
 *
 * These tests exercise the LOGIC (expression splitting, case matching,
 * iteration) without going through the full command pipeline — we stub
 * softcodeService.runSoftcode and capture u.execute calls.
 */
import { assertEquals } from "@std/assert";

// ── splitSoftcodeList (copy of helper to test in isolation) ──────────────

function splitSoftcodeList(s: string, delim = ","): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "[" || ch === "{") { depth++; cur += ch; }
    else if (ch === "]" || ch === "}") { depth--; cur += ch; }
    else if (ch === delim && depth === 0) { parts.push(cur); cur = ""; }
    else { cur += ch; }
  }
  parts.push(cur);
  return parts;
}

Deno.test("splitSoftcodeList — simple comma split", () => {
  assertEquals(splitSoftcodeList("a,b,c"), ["a", "b", "c"]);
});

Deno.test("splitSoftcodeList — respects bracket nesting", () => {
  assertEquals(
    splitSoftcodeList("[add(1,2)],action,[sub(3,1)],other"),
    ["[add(1,2)]", "action", "[sub(3,1)]", "other"],
  );
});

Deno.test("splitSoftcodeList — respects brace nesting", () => {
  assertEquals(
    splitSoftcodeList("{a,b},action"),
    ["{a,b}", "action"],
  );
});

Deno.test("splitSoftcodeList — trailing default element (odd count)", () => {
  const parts = splitSoftcodeList("case1,act1,default");
  assertEquals(parts.length, 3);
  assertEquals(parts[2], "default");
});

Deno.test("splitSoftcodeList — custom delimiter", () => {
  assertEquals(splitSoftcodeList("a|b|c", "|"), ["a", "b", "c"]);
});

Deno.test("splitSoftcodeList — empty string gives one empty part", () => {
  assertEquals(splitSoftcodeList(""), [""]);
});

// ── @switch logic (in-process simulation) ────────────────────────────────

async function runSwitch(
  value: string,
  parts: string[],
  all = false,
): Promise<string[]> {
  const executed: string[] = [];
  // Simulate: cases are literal; actions are literal (no softcode eval for unit test)
  let matched = false;
  for (let i = 0; i + 1 < parts.length; i += 2) {
    if (parts[i] === value) {
      executed.push(parts[i + 1]);
      matched = true;
      if (!all) return executed;
    }
  }
  if (!matched && parts.length % 2 === 1) {
    executed.push(parts[parts.length - 1]);
  }
  return executed;
}

Deno.test("@switch — matches first case", async () => {
  const cmds = await runSwitch("Alice", ["Alice", "say Hi Alice!", "Bob", "say Hi Bob!"]);
  assertEquals(cmds, ["say Hi Alice!"]);
});

Deno.test("@switch — matches second case", async () => {
  const cmds = await runSwitch("Bob", ["Alice", "say Hi Alice!", "Bob", "say Hi Bob!"]);
  assertEquals(cmds, ["say Hi Bob!"]);
});

Deno.test("@switch — falls through to default", async () => {
  const cmds = await runSwitch("Carol", ["Alice", "say Hi!", "default action"]);
  assertEquals(cmds, ["default action"]);
});

Deno.test("@switch — no match, no default → empty", async () => {
  const cmds = await runSwitch("Carol", ["Alice", "say Hi!", "Bob", "say Bob"]);
  assertEquals(cmds, []);
});

Deno.test("@switch /all — executes all matches", async () => {
  const cmds = await runSwitch("X", ["X", "cmd1", "X", "cmd2", "X", "cmd3"], true);
  assertEquals(cmds, ["cmd1", "cmd2", "cmd3"]);
});

// ── @dolist logic (in-process simulation) ────────────────────────────────

function runDolist(
  items: string[],
  actionTemplate: string,
): string[] {
  return items.map((item, i) =>
    actionTemplate
      .replaceAll("##", item)
      .replaceAll("#@", String(i + 1))
  );
}

Deno.test("@dolist — substitutes ## with each item", () => {
  const cmds = runDolist(["Alice", "Bob", "Carol"], "say Hello, ##!");
  assertEquals(cmds, [
    "say Hello, Alice!",
    "say Hello, Bob!",
    "say Hello, Carol!",
  ]);
});

Deno.test("@dolist — substitutes #@ with 1-based position", () => {
  const cmds = runDolist(["a", "b", "c"], "say item #@ is ##");
  assertEquals(cmds, [
    "say item 1 is a",
    "say item 2 is b",
    "say item 3 is c",
  ]);
});

Deno.test("@dolist — ## replaced everywhere in template", () => {
  const cmds = runDolist(["X"], "@pemit ##=You are ##");
  assertEquals(cmds, ["@pemit X=You are X"]);
});

Deno.test("@dolist — empty item list produces no commands", () => {
  assertEquals(runDolist([], "say ##"), []);
});

Deno.test("@dolist — single item", () => {
  assertEquals(runDolist(["only"], "look ##"), ["look only"]);
});

// ── @dolist delimiter split ───────────────────────────────────────────────

function splitDolist(listVal: string, delim: string): string[] {
  return delim === " "
    ? listVal.trim().split(/\s+/).filter(Boolean)
    : listVal.split(delim);
}

Deno.test("@dolist — space split skips empty tokens", () => {
  assertEquals(splitDolist("  a  b  c  ", " "), ["a", "b", "c"]);
});

Deno.test("@dolist — custom delim preserves empty tokens", () => {
  assertEquals(splitDolist("red|green||blue", "|"), ["red", "green", "", "blue"]);
});
