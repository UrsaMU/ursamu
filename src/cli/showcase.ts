#!/usr/bin/env -S deno run -A

import { parse }       from "@std/flags";
import { expandGlob }  from "@std/fs";
import { join, dirname, fromFileUrl } from "@std/path";
import type {
  ShowcaseFile,
  ShowcaseStep,
  ShowcaseStepCmd,
  ShowcaseStepEval,
} from "../@types/Showcase.ts";

// ── ANSI / MUSH rendering ────────────────────────────────────────────────────

const RESET = "\x1b[0m";
const BOLD  = "\x1b[1m";
const DIM   = "\x1b[2m";

const MUSH_MAP: Record<string, string> = {
  "%ch": BOLD,        "%cn": RESET,
  "%cr": "\x1b[31m",  "%cg": "\x1b[32m",  "%cb": "\x1b[34m",
  "%cy": "\x1b[33m",  "%cw": "\x1b[37m",  "%cc": "\x1b[36m",
  "%cm": "\x1b[35m",  "%r":  "\n",         "%t":  "\t",
};

export function mushToAnsi(s: string): string {
  return s.replace(/%c[a-z]|%[rtnb]/g, (m) => MUSH_MAP[m] ?? "");
}

export function interpolate(s: string, vars: Record<string, string>): string {
  return s.replace(/{{(\w+)}}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

// ── Discovery ────────────────────────────────────────────────────────────────

export async function discoverShowcases(root: string): Promise<ShowcaseFile[]> {
  const files: ShowcaseFile[] = [];
  const globs = [
    join(root, "src", "plugins", "*", "showcases", "*.json"),
    join(root, "showcases", "*.json"),
  ];
  for (const g of globs) {
    for await (const entry of expandGlob(g)) {
      try {
        files.push(JSON.parse(await Deno.readTextFile(entry.path)) as ShowcaseFile);
      } catch { /* skip malformed */ }
    }
  }
  return files;
}

// ── Rendering ────────────────────────────────────────────────────────────────

const W = 70;
const ruler = (c = "─") => c.repeat(W);

function renderCmdOrEval(
  prompt: string,
  text:   string,
  label:  string | undefined,
  role:   string | undefined,
  output: string[],
  vars:   Record<string, string>,
): void {
  const roleTag = role  ? `  ${DIM}[as: ${role}]${RESET}` : "";
  const lbl     = label ? `  ${DIM}# ${label}${RESET}` : "";
  console.log(`  ${BOLD}${prompt}${mushToAnsi(interpolate(text, vars))}${RESET}${roleTag}${lbl}`);
  for (const out of output) console.log(`     ${mushToAnsi(interpolate(out, vars))}`);
}

function renderStep(step: ShowcaseStep, vars: Record<string, string>): void {
  if ("sub"    in step) { console.log(`\n${DIM}── ${step.sub} ${"─".repeat(Math.max(0, W - step.sub.length - 4))}${RESET}`); return; }
  if ("note"   in step) { console.log(`  ${DIM}${step.note}${RESET}`); return; }
  if ("reset"  in step) { console.log(`  ${DIM}[state reset]${RESET}`); return; }
  if ("emit"   in step) { console.log(`  ${BOLD}emit${RESET} ${mushToAnsi(interpolate(step.emit, vars))}${step.label ? `  ${DIM}# ${step.label}${RESET}` : ""}`); return; }
  if ("expect" in step) { console.log(`  ${DIM}expect → ${step.expect}${step.label ? `  # ${step.label}` : ""}${RESET}`); return; }
  if ("cmd"    in step) { renderCmdOrEval("> ",     (step as ShowcaseStepCmd).cmd,  step.label, (step as ShowcaseStepCmd).as,  (step as ShowcaseStepCmd).output  ?? [], vars); return; }
  if ("eval"   in step) { renderCmdOrEval("eval> ", (step as ShowcaseStepEval).eval, step.label, undefined,                    (step as ShowcaseStepEval).output ?? [], vars); }
}

export function renderShowcase(showcase: ShowcaseFile): void {
  const vars = showcase.vars ?? {};
  console.log(`\n${BOLD}${ruler("═")}${RESET}`);
  console.log(`${BOLD}  ${showcase.label}${RESET}`);
  if (showcase.plugin) console.log(`  ${DIM}plugin: ${showcase.plugin}${RESET}`);
  console.log(`${BOLD}${ruler("═")}${RESET}`);
  for (const step of showcase.steps) renderStep(step, vars);
  console.log(`\n${DIM}${ruler()}${RESET}\n`);
}

// ── CLI entry — only runs when invoked directly ───────────────────────────────

if (import.meta.main) {
  const args = parse(Deno.args, {
    boolean: ["list", "help", "live"],
    string:  ["host"],
    alias:   { h: "help", l: "list" },
  });

  if (args.help) {
    console.log(`
UrsaMU Showcase Runner

Usage:
  deno task showcase [<key>] [options]

Options:
  --list, -l   List all available showcase sections
  --live       Connect to a live server (not yet implemented)
  --help, -h   Show this help

Examples:
  deno task showcase --list
  deno task showcase my-feature-basic
    `);
    Deno.exit(0);
  }

  if (args.live) {
    console.error("--live mode is not yet implemented. Use render mode (default) to preview showcases.");
    Deno.exit(1);
  }

  const scriptDir = import.meta.url.startsWith("file://")
    ? dirname(fromFileUrl(import.meta.url))
    : Deno.cwd();
  const root = dirname(dirname(scriptDir)); // src/cli → src → engine root

  const all = await discoverShowcases(root);

  if (all.length === 0) {
    console.log("No showcase files found. Add JSON files to src/plugins/<name>/showcases/");
    Deno.exit(0);
  }

  if (args.list) {
    console.log("\nAvailable showcases:\n");
    for (const s of all) console.log(`  ${BOLD}${s.key}${RESET}  ${DIM}${s.label}${RESET}`);
    console.log();
    Deno.exit(0);
  }

  const key = args._[0]?.toString();
  if (key) {
    const showcase = all.find((s) => s.key === key);
    if (!showcase) { console.error(`Showcase '${key}' not found. Run --list to see keys.`); Deno.exit(1); }
    renderShowcase(showcase);
    Deno.exit(0);
  }

  // Interactive menu
  console.log("\nSelect a showcase:\n");
  all.forEach((s, i) => console.log(`  ${i + 1}) ${BOLD}${s.key}${RESET}  ${DIM}${s.label}${RESET}`));
  console.log();
  const choice = prompt("Enter number or key: ")?.trim() ?? "";
  const chosen = all[parseInt(choice, 10) - 1] ?? all.find((s) => s.key === choice);
  if (!chosen) { console.error(`Invalid selection: '${choice}'`); Deno.exit(1); }
  renderShowcase(chosen);
}
