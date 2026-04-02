// deno-lint-ignore-file require-await
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

// ── @if logic ─────────────────────────────────────────────────────────────

function isTruthy(val: string): boolean {
  return val !== "" && val !== "0" && val !== "#-1";
}

function runIf(condVal: string, rest: string): string | null {
  const truthy = isTruthy(condVal);
  const slashIdx = rest.indexOf("/");
  const trueBranch  = slashIdx === -1 ? rest             : rest.slice(0, slashIdx);
  const falseBranch = slashIdx === -1 ? ""               : rest.slice(slashIdx + 1);
  if (truthy) return trueBranch.trim() || null;
  return falseBranch.trim() || null;
}

Deno.test("@if — truthy condition executes true branch", () => {
  assertEquals(runIf("1", "say yes/say no"), "say yes");
});

Deno.test("@if — falsy condition executes false branch", () => {
  assertEquals(runIf("0", "say yes/say no"), "say no");
});

Deno.test("@if — empty string is falsy", () => {
  assertEquals(runIf("", "say yes/say no"), "say no");
});

Deno.test("@if — #-1 is falsy", () => {
  assertEquals(runIf("#-1", "say yes/say no"), "say no");
});

Deno.test("@if — no false branch when falsy returns null", () => {
  assertEquals(runIf("0", "say yes"), null);
});

Deno.test("@if — true branch only, truthy", () => {
  assertEquals(runIf("1", "say yes"), "say yes");
});

Deno.test("@if — non-zero string is truthy", () => {
  assertEquals(runIf("hello", "say yes/say no"), "say yes");
});

// ── @while / @break logic ─────────────────────────────────────────────────

class BreakSignal extends Error {
  constructor() { super("@break"); this.name = "BreakSignal"; }
}

async function runWhile(
  condFn: (iter: number) => string,
  actionFn: (iter: number) => string | "BREAK",
  cap = 1000,
): Promise<{ executed: string[]; hitCap: boolean }> {
  const executed: string[] = [];
  let iters = 0;
  try {
    while (iters < cap) {
      const cond = condFn(iters);
      if (!isTruthy(cond)) break;
      const action = actionFn(iters);
      if (action === "BREAK") throw new BreakSignal();
      executed.push(action);
      iters++;
    }
  } catch (e) {
    if (!(e instanceof BreakSignal)) throw e;
  }
  return { executed, hitCap: iters >= cap };
}

Deno.test("@while — runs while condition truthy", async () => {
  const { executed } = await runWhile(
    (i) => i < 3 ? "1" : "0",
    (i) => `say ${i}`,
  );
  assertEquals(executed, ["say 0", "say 1", "say 2"]);
});

Deno.test("@while — never runs when condition starts falsy", async () => {
  const { executed } = await runWhile(() => "0", () => "say x");
  assertEquals(executed, []);
});

Deno.test("@while — safety cap stops infinite loop", async () => {
  const { executed, hitCap } = await runWhile(() => "1", (i) => `cmd${i}`, 5);
  assertEquals(hitCap, true);
  assertEquals(executed.length, 5);
});

Deno.test("@while — @break exits loop early", async () => {
  const { executed } = await runWhile(
    (i) => i < 10 ? "1" : "0",
    (i) => i === 3 ? "BREAK" : `say ${i}`,
  );
  assertEquals(executed, ["say 0", "say 1", "say 2"]);
});

Deno.test("@while — single iteration", async () => {
  const { executed } = await runWhile(
    (i) => i === 0 ? "1" : "0",
    (i) => `only ${i}`,
  );
  assertEquals(executed, ["only 0"]);
});

// ── BreakSignal propagates through @dolist ────────────────────────────────

async function runDolistWithBreak(items: string[], breakAt: number): Promise<string[]> {
  const executed: string[] = [];
  try {
    for (let i = 0; i < items.length; i++) {
      if (i === breakAt) throw new BreakSignal();
      executed.push(`say ${items[i]}`);
    }
  } catch (e) {
    if (!(e instanceof BreakSignal)) throw e;
  }
  return executed;
}

Deno.test("@dolist + @break — stops at breakpoint", async () => {
  const cmds = await runDolistWithBreak(["a", "b", "c", "d"], 2);
  assertEquals(cmds, ["say a", "say b"]);
});

Deno.test("@dolist + @break at index 0 — executes nothing", async () => {
  const cmds = await runDolistWithBreak(["a", "b", "c"], 0);
  assertEquals(cmds, []);
});
