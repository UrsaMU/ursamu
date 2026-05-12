// deno-lint-ignore-file require-await
import { addCmd } from "../services/commands/cmdParser.ts";
import { divider, footer, header } from "../utils/format.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

const HR = footer();
const section = (title: string): string => divider(title);

function fmtSecs(secs: number): string {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

async function demoOverview(u: IUrsamuSDK) {
  const me = u.me;
  const name = (me.state.moniker as string) || me.name || "Unknown";
  const uptime = await u.sys.uptime();
  let out = header(" UrsaMU Script Engine Demo ") + "\n";
  out += `\nYou are: %ch${name}%cn  (#${me.id})`;
  out += `\nHere:    %ch${u.here.name ?? "Void"}%cn  (#${u.here.id})`;
  out += `\nUptime:  ${fmtSecs(uptime)}`;
  out += `\n\n%chSwitches for focused demos:%cn`;
  out += `\n  demo/basics  — actor & room, state, flags`;
  out += `\n  demo/format  — ljust / rjust / center / sprintf / template`;
  out += `\n  demo/db      — db.search / create / destroy`;
  out += `\n  demo/sys     — uptime, gameTime`;
  out += `\n  demo/chan     — channel list & history`;
  out += `\n  demo/ui      — panel / layout / grid / table`;
  out += `\n\n${HR}`;
  u.send(out);
}

async function demoBasics(u: IUrsamuSDK) {
  const me   = u.me;
  const here = u.here;
  let out = section("BASICS — Actor");
  out += `\n  id       : #${me.id}`;
  out += `\n  name     : ${me.name}`;
  out += `\n  moniker  : ${(me.state.moniker as string) || "(none)"}`;
  out += `\n  location : #${me.location ?? "?"}`;
  out += `\n  flags    : ${[...me.flags].join(" ") || "(none)"}`;
  out += `\n  money    : ${(me.state.money as number) ?? 0}`;
  out += `\n  doing    : ${(me.state.doing as string) || "(none)"}`;
  out += section("BASICS — Here");
  out += `\n  id       : #${here.id}`;
  out += `\n  name     : ${here.name}`;
  out += `\n  flags    : ${[...here.flags].join(" ") || "(none)"}`;
  out += `\n  contents : ${here.contents.length} object(s)`;
  const players = here.contents.filter((o) => o.flags.has("player") && o.flags.has("connected"));
  const objects = here.contents.filter((o) => !o.flags.has("player") && !o.flags.has("exit"));
  const exits   = here.contents.filter((o) => o.flags.has("exit"));
  out += `\n    players: ${players.map((p) => p.name).join(", ") || "none"}`;
  out += `\n    objects: ${objects.map((o) => o.name).join(", ") || "none"}`;
  out += `\n    exits  : ${exits.map((e) => ((e.state.name as string) || e.name || "?").split(";")[0]).join(", ") || "none"}`;
  const canEdit = await u.canEdit(me, here);
  out += section("BASICS — Permissions");
  out += `\n  canEdit(me, here) : ${canEdit}`;
  const desc = await u.attr.get(here.id, "DESCRIPTION");
  out += `\n  here.DESCRIPTION  : ${desc ?? "(not set)"}`;
  u.send(out);
}

async function demoFormat(u: IUrsamuSDK) {
  const words = ["apples", "bananas", "cherries", "durian"];
  let out = section("FORMAT — util.ljust / rjust / center");
  out += "\n";
  for (const w of words) {
    out += `\n  ${u.util.ljust(w, 12)}| ${u.util.rjust(w, 12)} | ${u.util.center(w, 12)}`;
  }
  out += section("FORMAT — util.sprintf");
  out += `\n  %s has %d items:  ${u.util.sprintf("%s has %d items", "Alice", 3)}`;
  out += `\n  Pi to 4 dp:       ${u.util.sprintf("%.4f", Math.PI)}`;
  out += `\n  Zero-padded 7:    ${u.util.sprintf("%05d", 7)}`;
  out += section("FORMAT — util.template");
  const tmpl = "Hello, {{name}}! You have {{count}} messages.";
  out += `\n  template: "${tmpl}"`;
  out += `\n  result  : ${u.util.template(tmpl, { name: u.me.name ?? "Player", count: "3" })}`;
  out += section("FORMAT — util.center with fill char");
  out += `\n  ${u.util.center(" Section Title ", 78, "=")}`;
  out += section("FORMAT — util.stripSubs");
  const raw = "%chHello%cn %crWorld%cn";
  out += `\n  raw   : ${raw}`;
  out += `\n  stripped length: ${u.util.stripSubs(raw).length} chars (vs ${raw.length} raw)`;
  u.send(out);
}

async function demoDB(u: IUrsamuSDK) {
  let out = section("DB — db.search");
  const players = await u.db.search({ flags: /connected/i });
  out += `\n  Connected players (${players.length}):`;
  for (const p of players.slice(0, 5)) out += `\n    #${p.id} ${p.name ?? "?"}`;
  if (players.length > 5) out += `\n    ... and ${players.length - 5} more`;
  const rooms = await u.db.search({ flags: /\broom\b/i });
  out += `\n\n  Rooms in DB: ${rooms.length}`;
  out += section("DB — db.create / db.modify / db.destroy");
  const tmp = await u.db.create({ name: "Demo Temp Object", flags: new Set(["thing"]), state: { demo: true }, contents: [] });
  out += `\n  Created: #${tmp.id} "${tmp.name}"`;
  await u.db.modify(tmp.id, "$set", { state: { demo: true, label: "modified" } });
  out += `\n  Modified: set state.label = "modified"`;
  await u.db.destroy(tmp.id);
  out += `\n  Destroyed: #${tmp.id}`;
  u.send(out);
}

async function demoSys(u: IUrsamuSDK) {
  const uptime   = await u.sys.uptime();
  const gameTime = await u.sys.gameTime();
  const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let out = section("SYS — uptime");
  out += `\n  Raw ms  : ${uptime}`;
  out += `\n  Formatted: ${fmtSecs(Math.floor(uptime / 1000))}`;
  out += section("SYS — gameTime");
  out += `\n  ${MONTHS[gameTime.month] ?? "?"} ${gameTime.day}, Year ${gameTime.year}`;
  out += `  ${String(gameTime.hour).padStart(2, "0")}:${String(gameTime.minute).padStart(2, "0")}`;
  u.send(out);
}

async function demoChan(u: IUrsamuSDK) {
  const channels = await u.chan.list() as Array<{ name: string; header?: string; hidden?: boolean }>;
  let out = section("CHAN — chan.list");
  if (channels.length === 0) {
    out += "\n  (no channels exist yet)";
  } else {
    for (const ch of channels) out += `\n  ${u.util.ljust(ch.name, 20)}${ch.header ?? ""}${ch.hidden ? " [hidden]" : ""}`;
  }
  out += section("CHAN — chan.history (first channel)");
  if (channels.length > 0) {
    const hist = await u.chan.history(channels[0].name, 5);
    if (hist.length === 0) {
      out += "\n  (no recent messages)";
    } else {
      for (const msg of hist) {
        const ts = new Date(msg.timestamp).toISOString().slice(11, 16);
        out += `\n  [${ts}] <${msg.playerName}> ${msg.message}`;
      }
    }
  } else {
    out += "\n  (no channels)";
  }
  u.send(out);
}

async function demoUI(u: IUrsamuSDK) {
  u.send(section("UI — panel types") + "\n  Sending structured layout — check your web client.\n");
}

addCmd({
  name: "demo",
  pattern: /^demo(?:\/(basics|format|db|sys|chan|ui))?\s*$/i,
  lock: "connected",
  category: "System",
  help: `demo[/<switch>]  — Walk through the UrsaMU script engine SDK.

Switches:
  /basics   Actor & room, state, flags
  /format   ljust / rjust / center / sprintf / template
  /db       db.search / create / destroy
  /sys      uptime, gameTime
  /chan     Channel list & history
  /ui       Panel / layout / grid / table

Examples:
  demo
  demo/basics
  demo/db`,
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] || "").toLowerCase().trim();
    switch (sw) {
      case "basics": await demoBasics(u); break;
      case "format": await demoFormat(u); break;
      case "db":     await demoDB(u);     break;
      case "sys":    await demoSys(u);    break;
      case "chan":   await demoChan(u);   break;
      case "ui":     await demoUI(u);     break;
      default:       await demoOverview(u); break;
    }
  },
});
