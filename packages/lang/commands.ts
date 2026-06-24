import { addCmd } from "@ursamu/ursamu";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import { getLang, listLangs, loadLanguages } from "./src/langStore.ts";
import {
  clampSkill,
  getPlayerLangs,
  setActive,
  setSkill,
} from "./src/playerLangs.ts";
import { installScripts } from "./src/install.ts";

const HEADER = "%ch%cw=== Languages ===%cn";

addCmd({
  name: "+language",
  pattern: /^\+lang(?:uage)?(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Language",
  help: `+language[/switch] [args]  — Manage known languages and active speech.

Switches:
  /speak <name>            Set <name> as your active speaking language.
  /clear                   Stop speaking a specific language.
  /list                    List all configured languages on the game.
  /learn <player>=<l>/<n>  (Staff) Set <player>'s skill in <l> to <n> (0-100).
  /reload                  (Wizard) Re-scan the languages directory.

Examples:
  +language                List languages you know and your active one.
  +language/speak shyriiwook
  +language/learn Alice=huttese/75
  +language/list`,
  exec: (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (sw === "list")   return cmdList(u);
    if (sw === "reload") return cmdReload(u);
    if (sw === "learn")  return cmdLearn(u, arg);
    if (sw === "speak")  return cmdSpeak(u, arg);
    if (sw === "clear")  return cmdSpeak(u, "");
    return cmdShow(u);
  },
});

export function cmdShow(u: IUrsamuSDK): void {
  const langs = getPlayerLangs(u.me);
  const entries = Object.entries(langs.known);
  if (entries.length === 0) {
    u.send(`${HEADER}\nYou do not know any languages.`);
    return;
  }
  const lines = entries
    .sort((a, b) => b[1] - a[1])
    .map(([name, skill]) => `  ${u.util.ljust(name, 20)} ${u.util.rjust(String(skill), 3)}%`);
  const active = langs.active ? `\nActive: %ch${langs.active}%cn` : "\nActive: (none)";
  u.send(`${HEADER}${active}\n${lines.join("\n")}`);
}

export function cmdList(u: IUrsamuSDK): void {
  const all = listLangs();
  if (all.length === 0) { u.send("No languages configured."); return; }
  const lines = all.map((l) => `  ${u.util.ljust(l.name, 20)} ${l.description ?? ""}`);
  u.send(`${HEADER} (configured)\n${lines.join("\n")}`);
}

export async function cmdReload(u: IUrsamuSDK): Promise<void> {
  if (!u.me.flags.has("wizard")) { u.send("Permission denied."); return; }
  const report = await loadLanguages();
  await installScripts();
  const msg = `Loaded ${report.loaded.length} language(s); re-baked say/pose scripts.` +
    (report.errors.length ? `\nErrors:\n  ${report.errors.join("\n  ")}` : "");
  u.send(msg);
}

export async function cmdSpeak(u: IUrsamuSDK, name: string): Promise<void> {
  if (!name) {
    await setActive(u, u.me, null);
    u.send("You are no longer speaking any language.");
    return;
  }
  const langs = getPlayerLangs(u.me);
  if (!(name.toLowerCase() in langs.known)) {
    u.send(`You do not know ${name}.`);
    return;
  }
  if (!getLang(name)) { u.send(`Language "${name}" is not configured.`); return; }
  await setActive(u, u.me, name);
  u.send(`You are now speaking ${name.toLowerCase()}.`);
}

export async function cmdLearn(u: IUrsamuSDK, arg: string): Promise<void> {
  if (!(u.me.flags.has("admin") || u.me.flags.has("wizard"))) {
    u.send("Permission denied."); return;
  }
  const m = arg.match(/^(.+?)=(.+?)\/(-?\d+)$/);
  if (!m) { u.send("Usage: +language/learn <player>=<language>/<0-100>"); return; }
  const [, playerName, langName, nStr] = m;
  const target = await u.util.target(u.me, playerName.trim(), true);
  if (!target || !target.flags.has("player")) {
    u.send(`No such player: ${playerName}`); return;
  }
  if (!getLang(langName.trim())) { u.send(`Unknown language: ${langName}`); return; }
  const skill = clampSkill(Number(nStr));
  await setSkill(u, target as IDBObj, langName.trim(), skill);
  u.send(`Set ${target.name}'s ${langName.trim().toLowerCase()} skill to ${skill}.`);
}

