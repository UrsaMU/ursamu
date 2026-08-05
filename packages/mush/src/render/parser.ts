// deno-lint-ignore-file no-explicit-any
/**
 * MUSH markup parser — wraps @ursamu/parser with ANSI color, HTML, and MXP
 * substitution rules. Also adds a sandboxed [js()] evaluator via QuickJS.
 *
 * Formats:
 *   telnet — ANSI SGR for classic clients
 *   web    — structural only (%r/%t/%b); leave %c for FE converters
 *   html   — closed color spans (softcode translate / legacy)
 */
import { Parser } from "@ursamu/parser";
import { getQuickJS } from "quickjs-emscripten";
import type { QuickJSWASMModule } from "quickjs-emscripten";
import { mushCodesToHtml } from "./moniker-html.ts";

const parser: Parser = new Parser();
const quickJs: QuickJSWASMModule = await getQuickJS();

let _jsCallCount = 0;
const JS_CALL_LIMIT = 20;

export function resetJsCallCount() { _jsCallCount = 0; }

const evalSafe = (code: string) => {
  if (++_jsCallCount > JS_CALL_LIMIT) return "[JS Error: too many js() calls]";
  try {
    const vm = quickJs.newContext();
    const start = Date.now();
    vm.runtime.setInterruptHandler(() => Date.now() - start > 50);
    vm.runtime.setMemoryLimit(1024 * 1024);
    const result = vm.evalCode(code);
    if ("value" in result) {
      const value = vm.dump(result.value);
      result.value.dispose();
      vm.dispose();
      return String(value);
    } else {
      const err = vm.dump(result.error);
      result.error.dispose();
      vm.dispose();
      return `[JS Error: ${(err as any).message || String(err)}]`;
    }
  } catch (e) {
    return `[JS Error: ${e}]`;
  }
};

/** Shared: [js()], brackets, whitespace codes → plain. */
const structuralPlain = [
  {
    before: /\[js\(([\s\S]*?)\)\]/g,
    after: ((_m: string, c: string) => evalSafe(c)) as any,
  },
  { before: /%r/g, after: "\r\n" },
  { before: /%R/g, after: "\r\n" },
  { before: /%b/g, after: " ", strip: " " },
  { before: /%B/g, after: " ", strip: " " },
  { before: /%t/g, after: "\t" },
  { before: /%T/g, after: "\t" },
  { before: /%\[/g, after: "[" },
  { before: /%\]/g, after: "]" },
  { before: /%\(/g, after: "(" },
  { before: /%\)/g, after: ")" },
];

parser.addSubs(
  "telnet",
  ...structuralPlain,
  {
    before: /%mxp\[([^\|]+)\|([^\]]+)\]/g,
    after: ((_m: string, cmd: string, text: string) =>
      `\x03MXP[${cmd}|${text}]\x03`) as any,
    strip: "$2",
  },
  { before: /%[cx]n/g, after: "\x1b[0m", strip: "" },
  { before: /%[cx]x/g, after: "\x1b[30m", strip: "" },
  { before: /%[cx]r/g, after: "\x1b[31m", strip: "" },
  { before: /%[cx]g/g, after: "\x1b[32m", strip: "" },
  { before: /%[cx]y/g, after: "\x1b[33m", strip: "" },
  { before: /%[cx]b/g, after: "\x1b[34m", strip: "" },
  { before: /%[cx]m/g, after: "\x1b[35m", strip: "" },
  { before: /%[cx]c/g, after: "\x1b[36m", strip: "" },
  { before: /%[cx]w/g, after: "\x1b[37m", strip: "" },
  { before: /%[cx]X/g, after: "\x1b[40m", strip: "" },
  { before: /%[cx]R/g, after: "\x1b[41m", strip: "" },
  { before: /%[cx]G/g, after: "\x1b[42m", strip: "" },
  { before: /%[cx]Y/g, after: "\x1b[43m", strip: "" },
  { before: /%[cx]B/g, after: "\x1b[44m", strip: "" },
  { before: /%[cx]M/g, after: "\x1b[45m", strip: "" },
  { before: /%[cx]C/g, after: "\x1b[46m", strip: "" },
  { before: /%[cx]W/g, after: "\x1b[47m", strip: "" },
  { before: /%[cx]h/g, after: "\x1b[1m", strip: "" },
  { before: /%[cx]u/g, after: "\x1b[4m", strip: "" },
  {
    before: /%[X|C]<#([0-9a-fA-F]{6})>/g,
    after: ((_m: string, hex: string) => {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return `\x1b[48;2;${r};${g};${b}m`;
    }) as any,
    strip: "",
  },
  {
    before: /<#([0-9a-fA-F]{6})>|%[xc]<#([0-9a-fA-F]{6})>/g,
    after: ((_m: string, hex: string, hex2?: string) => {
      const h = hex || hex2 || "000000";
      const r = parseInt(h.substring(0, 2), 16);
      const g = parseInt(h.substring(2, 4), 16);
      const b = parseInt(h.substring(4, 6), 16);
      return `\x1b[38;2;${r};${g};${b}m`;
    }) as any,
    strip: "",
  },
);

/**
 * Web FE path: expand layout only. Site /play and staff PlayView convert
 * %c / <#rrggbb> client-side (closed spans). Pre-baking HTML here used to
 * open unclosed <span>s and then get escaped or mangled in the browser.
 */
parser.addSubs(
  "web",
  {
    before: /\[js\(([\s\S]*?)\)\]/g,
    after: ((_m: string, c: string) => evalSafe(c)) as any,
  },
  { before: /%r/g, after: "\n" },
  { before: /%R/g, after: "\n" },
  { before: /%b/g, after: " ", strip: " " },
  { before: /%B/g, after: " ", strip: " " },
  { before: /%t/g, after: "\t" },
  { before: /%T/g, after: "\t" },
  { before: /%\[/g, after: "[" },
  { before: /%\]/g, after: "]" },
  { before: /%\(/g, after: "(" },
  { before: /%\)/g, after: ")" },
);

/**
 * Full message → safe HTML with properly closed color spans.
 * Used by format "html" (softcode translate) and tests.
 */
export function mushMessageToHtml(raw: string): string {
  let s = String(raw ?? "");
  s = s.replace(
    /\[js\(([\s\S]*?)\)\]/g,
    (_m, c: string) => evalSafe(c),
  );
  s = s
    .replace(/%r/gi, "\n")
    .replace(/%t/gi, "\t")
    .replace(/%b/gi, " ");
  // Closed spans per run; keeps leading indent / newlines.
  return mushCodesToHtml(s).replace(/\n/g, "<br />");
}

// Single whole-string pass so colors nest/close correctly.
parser.addSubs("html", {
  before: /^[\s\S]*$/,
  after: ((m: string) => mushMessageToHtml(m)) as any,
});

export const updateParserSubs = (
  subs: Record<string, string>,
): void => {
  Object.entries(subs).forEach(([key, value]) => {
    const pattern = new RegExp(
      key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "g",
    );
    parser.addSubs("telnet", { before: pattern, after: value });
    parser.addSubs("web", { before: pattern, after: value });
    parser.addSubs("html", { before: pattern, after: value });
  });
};

export default parser;
