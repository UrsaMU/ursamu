#!/usr/bin/env -S deno run -A
// Showcase — render real per-listener output for every bundled language at
// every skill tier. Run: `deno task showcase` from the plugin root.

import { garble } from "../src/garble.ts";
import { loadLanguages, listLangs } from "../src/langStore.ts";

const RESET = "\x1b[0m", BOLD = "\x1b[1m", DIM = "\x1b[2m";
const ANSI: Record<string, string> = {
  "%cn": RESET, "%ch": BOLD,
  "%cr": "\x1b[31m", "%cg": "\x1b[32m", "%cy": "\x1b[33m",
  "%cb": "\x1b[34m", "%cm": "\x1b[35m", "%cc": "\x1b[36m",
  "%cw": "\x1b[37m", "%cx": "\x1b[90m",
};
const mush = (s: string) => s.replace(/%c[a-z]/gi, (m) => ANSI[m.toLowerCase()] ?? "");

const PAD = "  ";
const RULE = "─".repeat(78);
function header(t: string) { console.log(`\n${BOLD}\x1b[36m${RULE}\n  ${t}\n${RULE}${RESET}`); }
function sub(t: string)    { console.log(`\n${BOLD}${t}${RESET}`); }
function tier(skill: number): string {
  if (skill >= 91) return "fluent";
  if (skill >= 61) return "proficient";
  if (skill >= 26) return "passing";
  if (skill >= 1)  return "smattering";
  return "none";
}

const SAMPLE_SAY = "Hello, friend. The forest is dangerous tonight.";
const SAMPLE_POSE = `grumbles and says "Get out of my forest." then turns away.`;
const SKILLS = [0, 15, 45, 75, 100];

async function main() {
  await loadLanguages(new URL("../languages", import.meta.url).pathname);
  const langs = listLangs();

  header("sgp-language-plugin — showcase");
  console.log(`Loaded ${langs.length} language(s): ${langs.map((l) => l.name).join(", ")}`);

  // ─── +language display ────────────────────────────────────────────────────
  header("+language  (a player's language sheet)");
  const knownDemo = { shyriiwook: 80, huttese: 30, sylvan: 5 };
  console.log(mush("%ch%cw=== Languages ===%cn"));
  console.log(mush("Active: %chshyriiwook%cn"));
  for (const [name, n] of Object.entries(knownDemo).sort((a, b) => b[1] - a[1])) {
    const t = tier(n);
    console.log(`${PAD}${name.padEnd(20)} ${String(n).padStart(3)}%  ${DIM}(${t})${RESET}`);
  }

  // ─── per-language garble matrix ───────────────────────────────────────────
  for (const def of langs) {
    header(`${def.name}  —  ${def.description ?? ""}`);

    sub(`say ${SAMPLE_SAY}    ${DIM}(intercepted by scripts/say.ts)${RESET}`);
    for (const skill of SKILLS) {
      const rendered = `Wookiee says in ${def.name}, "${garble(SAMPLE_SAY, def, skill)}"`;
      console.log(`  ${DIM}listener skill ${String(skill).padStart(3)} (${tier(skill).padEnd(10)})${RESET}  ${rendered}`);
    }

    sub(`pose ${SAMPLE_POSE}    ${DIM}(intercepted by scripts/pose.ts)${RESET}`);
    for (const skill of SKILLS) {
      const garbled = SAMPLE_POSE.replace(/"([^"]*)"/g, (_, inner) => `"${garble(inner, def, skill)}"`);
      console.log(`  ${DIM}listener skill ${String(skill).padStart(3)} (${tier(skill).padEnd(10)})${RESET}  Wookiee ${garbled}`);
    }
  }

  // ─── determinism demo ─────────────────────────────────────────────────────
  header("determinism — same word at same tier always garbles identically");
  const lang = langs[0];
  for (const msg of ["the forest is quiet", "the forest is loud"]) {
    console.log(`  ${DIM}skill 30:${RESET}  "${garble(msg, lang, 30)}"`);
  }
  console.log(`  ${DIM}(Note 'the' and 'forest' produce identical fake words across both lines.)${RESET}`);

  // ─── two listeners side by side ───────────────────────────────────────────
  header("listener-relative — same say, two listeners with different skill");
  const msg = "The smuggler hid the cargo in the cantina.";
  console.log(`${PAD}${BOLD}Speaker (shyriiwook active):${RESET} ${msg}`);
  console.log(`${PAD}${BOLD}Listener A (skill 85):${RESET}  ${garble(msg, lang, 85)}`);
  console.log(`${PAD}${BOLD}Listener B (skill 10):${RESET}  ${garble(msg, lang, 10)}`);

  console.log();
}

if (import.meta.main) await main();
