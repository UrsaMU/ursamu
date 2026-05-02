import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  mushToAnsi,
  interpolate,
  renderShowcase,
} from "../src/cli/showcase.ts";
import type { ShowcaseFile } from "../src/@types/Showcase.ts";

// showcase.ts has top-level imports from @std/fs (expandGlob) — prevent resource warnings
const OPTS = { sanitizeResources: false, sanitizeOps: false };

// ── mushToAnsi ────────────────────────────────────────────────────────────────

Deno.test("mushToAnsi — converts bold + reset", OPTS, () => {
  assertEquals(mushToAnsi("%chHello%cn"), "\x1b[1mHello\x1b[0m");
});

Deno.test("mushToAnsi — converts red", OPTS, () => {
  assertEquals(mushToAnsi("%crRed%cn"), "\x1b[31mRed\x1b[0m");
});

Deno.test("mushToAnsi — converts green", OPTS, () => {
  assertEquals(mushToAnsi("%cgGreen%cn"), "\x1b[32mGreen\x1b[0m");
});

Deno.test("mushToAnsi — converts %r to newline", OPTS, () => {
  assertEquals(mushToAnsi("line1%rline2"), "line1\nline2");
});

Deno.test("mushToAnsi — converts %t to tab", OPTS, () => {
  assertEquals(mushToAnsi("col1%tcol2"), "col1\tcol2");
});

Deno.test("mushToAnsi — unknown code passes through empty", OPTS, () => {
  // %cz is not in the map — produces empty string replacement
  assertEquals(mushToAnsi("hello%czworld"), "helloworld");
});

Deno.test("mushToAnsi — plain string unchanged", OPTS, () => {
  assertEquals(mushToAnsi("no codes here"), "no codes here");
});

// ── interpolate ───────────────────────────────────────────────────────────────

Deno.test("interpolate — substitutes a known var", OPTS, () => {
  assertEquals(interpolate("Hello {{player}}!", { player: "Alice" }), "Hello Alice!");
});

Deno.test("interpolate — leaves unknown vars as-is", OPTS, () => {
  assertEquals(interpolate("Hello {{unknown}}!", {}), "Hello {{unknown}}!");
});

Deno.test("interpolate — multiple replacements", OPTS, () => {
  assertEquals(
    interpolate("{{a}} meets {{b}}", { a: "Alice", b: "Bob" }),
    "Alice meets Bob",
  );
});

Deno.test("interpolate — no placeholders returns unchanged", OPTS, () => {
  assertEquals(interpolate("no placeholders", { player: "Alice" }), "no placeholders");
});

Deno.test("interpolate — same var used twice", OPTS, () => {
  assertEquals(interpolate("{{x}} and {{x}}", { x: "foo" }), "foo and foo");
});

// ── renderShowcase ────────────────────────────────────────────────────────────

function captureRender(showcase: ShowcaseFile): string {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...args: unknown[]) => lines.push(args.join(" "));
  try {
    renderShowcase(showcase);
  } finally {
    console.log = orig;
  }
  // Strip ANSI codes for readable assertions
  // deno-lint-ignore no-control-regex
  return lines.join("\n").replace(/\x1b\[[0-9;]*m/g, "");
}

Deno.test("renderShowcase — includes label in output", OPTS, () => {
  const out = captureRender({ key: "t", label: "My Showcase", steps: [] });
  assertStringIncludes(out, "My Showcase");
});

Deno.test("renderShowcase — renders sub heading", OPTS, () => {
  const out = captureRender({
    key: "t", label: "T",
    steps: [{ sub: "Basic Usage" }],
  });
  assertStringIncludes(out, "Basic Usage");
});

Deno.test("renderShowcase — renders note", OPTS, () => {
  const out = captureRender({ key: "t", label: "T", steps: [{ note: "Read this carefully." }] });
  assertStringIncludes(out, "Read this carefully.");
});

Deno.test("renderShowcase — renders cmd with label and interpolated output", OPTS, () => {
  const out = captureRender({
    key: "t", label: "T",
    vars: { player: "Alice" },
    steps: [{ cmd: "+greet {{player}}", label: "greet cmd", output: ["You wave to {{player}}."] }],
  });
  assertStringIncludes(out, "+greet Alice");
  assertStringIncludes(out, "greet cmd");
  assertStringIncludes(out, "You wave to Alice.");
});

Deno.test("renderShowcase — renders eval step", OPTS, () => {
  const out = captureRender({
    key: "t", label: "T",
    steps: [{ eval: "add(1,1)", label: "simple math", output: ["2"] }],
  });
  assertStringIncludes(out, "eval>");
  assertStringIncludes(out, "add(1,1)");
  assertStringIncludes(out, "simple math");
  assertStringIncludes(out, "2");
});

Deno.test("renderShowcase — renders emit step", OPTS, () => {
  const out = captureRender({ key: "t", label: "T", steps: [{ emit: "Boom!", label: "emit test" }] });
  assertStringIncludes(out, "emit");
  assertStringIncludes(out, "Boom!");
});

Deno.test("renderShowcase — renders expect step", OPTS, () => {
  const out = captureRender({ key: "t", label: "T", steps: [{ expect: "Hello World" }] });
  assertStringIncludes(out, "expect");
  assertStringIncludes(out, "Hello World");
});

Deno.test("renderShowcase — renders reset step", OPTS, () => {
  const out = captureRender({ key: "t", label: "T", steps: [{ reset: true }] });
  assertStringIncludes(out, "state reset");
});

Deno.test("renderShowcase — cmd with as role tag", OPTS, () => {
  const out = captureRender({
    key: "t", label: "T",
    steps: [{ cmd: "+foo", as: "wizard", output: [] }],
  });
  assertStringIncludes(out, "+foo");
  assertStringIncludes(out, "as: wizard");
});

Deno.test("renderShowcase — renders plugin name when set", OPTS, () => {
  const out = captureRender({ key: "t", label: "T", plugin: "my-plugin", steps: [] });
  assertStringIncludes(out, "my-plugin");
});

// ── ShowcaseFile schema ───────────────────────────────────────────────────────

Deno.test("ShowcaseFile — minimal valid object", OPTS, () => {
  const f: ShowcaseFile = { key: "foo", label: "Foo", steps: [] };
  assertEquals(f.key, "foo");
  assertEquals(f.steps.length, 0);
});

Deno.test("ShowcaseFile — optional fields absent", OPTS, () => {
  const f: ShowcaseFile = { key: "foo", label: "Foo", steps: [] };
  assertEquals(f.plugin, undefined);
  assertEquals(f.vars, undefined);
});
