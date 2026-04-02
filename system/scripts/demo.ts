import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: demo.ts
 *
 * Walks through the major SDK features so developers can see what the
 * script engine can do.  Each named switch focuses on one area:
 *
 *   demo          — overview (all sections, brief)
 *   demo/basics   — me, here, state & flags
 *   demo/format   — u.util formatting helpers
 *   demo/db       — u.db search / create / destroy
 *   demo/sys      — u.sys uptime, gameTime, config
 *   demo/chan     — u.chan list, history
 *   demo/ui       — u.ui panel / layout components
 */

const HR = "=".repeat(78);
const hr = "-".repeat(78);

function section(title: string): string {
  return `\n%ch${title}%cn\n${hr}`;
}

export default async (u: IUrsamuSDK) => {
  const sw = (u.cmd.switches ?? [])[0] ?? "";

  // Route to a focused sub-demo when a switch is given.
  if (sw === "basics")  { await demoBasics(u);  return; }
  if (sw === "format")  { await demoFormat(u);  return; }
  if (sw === "db")      { await demoDB(u);      return; }
  if (sw === "sys")     { await demoSys(u);     return; }
  if (sw === "chan")    { await demoChan(u);    return; }
  if (sw === "ui")      { await demoUI(u);      return; }

  // Default: brief overview of every area.
  await demoOverview(u);
};

// ── Overview ─────────────────────────────────────────────────────────────────

async function demoOverview(u: IUrsamuSDK) {
  const me = u.me;
  const name = (me.state.moniker as string) || me.name || "Unknown";
  const uptime = await u.sys.uptime();

  let out = `${HR}\n`;
  out += u.util.center("%ch UrsaMU Script Engine Demo %cn", 78) + "\n";
  out += `${HR}\n`;
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

  u.ui.layout({
    components: [
      u.ui.panel({ type: "header", content: "Script Engine Demo" }),
      u.ui.panel({ type: "list", content: [
        { label: "Actor",  value: name },
        { label: "Room",   value: u.here.name ?? "Void" },
        { label: "Uptime", value: fmtSecs(uptime) },
      ]}),
      u.ui.panel({ content: "Use demo/<switch> for focused sub-demos." }),
    ],
    meta: { type: "demo" },
  });
}

// ── Basics: me / here / state / flags ────────────────────────────────────────

async function demoBasics(u: IUrsamuSDK) {
  const me   = u.me;
  const here = u.here;

  // ── Actor ──────────────────────────────────────────────────────────────
  let out = section("BASICS — Actor");
  out += `\n  id       : #${me.id}`;
  out += `\n  name     : ${me.name}`;
  out += `\n  moniker  : ${(me.state.moniker as string) || "(none)"}`;
  out += `\n  location : #${me.location ?? "?"}`;
  out += `\n  flags    : ${[...me.flags].join(" ") || "(none)"}`;
  out += `\n  is player: ${me.flags.has("player")}`;
  out += `\n  money    : ${(me.state.money as number) ?? 0}`;
  out += `\n  doing    : ${(me.state.doing as string) || "(none)"}`;

  // ── Room ───────────────────────────────────────────────────────────────
  out += section("BASICS — Here");
  out += `\n  id       : #${here.id}`;
  out += `\n  name     : ${here.name}`;
  out += `\n  flags    : ${[...here.flags].join(" ") || "(none)"}`;
  out += `\n  contents : ${here.contents.length} object(s)`;

  const players = here.contents.filter(o => o.flags.has("player") && o.flags.has("connected"));
  const objects = here.contents.filter(o => !o.flags.has("player") && !o.flags.has("exit"));
  const exits   = here.contents.filter(o => o.flags.has("exit"));

  out += `\n    players: ${players.map(p => p.name).join(", ") || "none"}`;
  out += `\n    objects: ${objects.map(o => o.name).join(", ") || "none"}`;
  out += `\n    exits  : ${exits.map(e => ((e.state.name as string) || e.name || "?").split(";")[0]).join(", ") || "none"}`;

  // ── canEdit ─────────────────────────────────────────────────────────────
  const canEdit = await u.canEdit(me, here);
  out += section("BASICS — Permissions");
  out += `\n  canEdit(me, here) : ${canEdit}`;

  // ── Attribute read ───────────────────────────────────────────────────────
  const desc = await u.attr.get(here.id, "DESCRIPTION");
  out += `\n  here.DESCRIPTION  : ${desc ?? "(not set)"}`;

  u.send(out);

  u.ui.layout({
    components: [
      u.ui.panel({ type: "header", content: "Basics Demo" }),
      u.ui.panel({ type: "list", title: "Actor", content: [
        { label: "Name",   value: me.name ?? "" },
        { label: "DBRef",  value: `#${me.id}` },
        { label: "Flags",  value: [...me.flags].join(" ") || "(none)" },
        { label: "Money",  value: String((me.state.money as number) ?? 0) },
      ]}),
      u.ui.panel({ type: "list", title: "Room", content: [
        { label: "Name",     value: here.name ?? "" },
        { label: "DBRef",    value: `#${here.id}` },
        { label: "Players",  value: String(players.length) },
        { label: "Exits",    value: String(exits.length) },
      ]}),
    ],
    meta: { type: "demo-basics" },
  });
}

// ── Format: util helpers ──────────────────────────────────────────────────────

async function demoFormat(u: IUrsamuSDK) {
  let out = section("FORMAT — util.ljust / rjust / center");

  const words = ["apples", "bananas", "cherries", "durian"];
  out += "\n";
  for (const w of words) {
    out += `\n  ${u.util.ljust(w, 12)}| ${u.util.rjust(w, 12)} | ${u.util.center(w, 12)}`;
  }

  out += section("FORMAT — util.sprintf");
  out += `\n  %s has %d items:         ${u.util.sprintf("%s has %d items", "Alice", 3)}`;
  out += `\n  Pi to 4 dp:              ${u.util.sprintf("%.4f", Math.PI)}`;
  out += `\n  Zero-padded 7:           ${u.util.sprintf("%05d", 7)}`;

  out += section("FORMAT — util.template");
  const tmpl = "Hello, {{name}}! You have {{count}} messages.";
  out += `\n  template: "${tmpl}"`;
  out += `\n  result  : ${u.util.template(tmpl, { name: u.me.name ?? "Player", count: "3" })}`;

  out += section("FORMAT — util.center with fill char");
  out += `\n  ${u.util.center(" Section Title ", 78, "=")}`;
  out += `\n  ${u.util.center(" Sub-title ", 78, "-")}`;

  out += section("FORMAT — util.stripSubs (strips MUSH codes)");
  const raw = "%chHello%cn %crWorld%cn";
  out += `\n  raw   : ${raw}`;
  out += `\n  stripped length: ${u.util.stripSubs(raw).length} chars (vs ${raw.length} raw)`;

  u.send(out);

  u.ui.layout({
    components: [
      u.ui.panel({ type: "header", content: "Format Demo" }),
      u.ui.panel({ type: "table", content: [
        ["Word", "ljust(12)", "rjust(12)", "center(12)"],
        ...words.map(w => [w, u.util.ljust(w, 12), u.util.rjust(w, 12), u.util.center(w, 12)]),
      ]}),
      u.ui.panel({ type: "list", title: "sprintf", content: [
        { label: "string + int", value: u.util.sprintf("%s has %d items", "Alice", 3) },
        { label: "float .4",    value: u.util.sprintf("%.4f", Math.PI) },
        { label: "zero-pad",    value: u.util.sprintf("%05d", 7) },
      ]}),
    ],
    meta: { type: "demo-format" },
  });
}

// ── DB: search / create / destroy ─────────────────────────────────────────────

async function demoDB(u: IUrsamuSDK) {
  let out = section("DB — db.search");

  // Search connected players
  const players = await u.db.search({ flags: /connected/i });
  out += `\n  Connected players (${players.length}):`;
  for (const p of players.slice(0, 5)) {
    out += `\n    #${p.id} ${p.name ?? "?"}`;
  }
  if (players.length > 5) out += `\n    ... and ${players.length - 5} more`;

  // Search by name prefix (string query — engine does full-text match)
  const rooms = await u.db.search({ flags: /\broom\b/i });
  out += `\n\n  Rooms in DB: ${rooms.length}`;

  out += section("DB — db.create / db.modify / db.destroy");

  // Create a temporary object
  const tmp = await u.db.create({
    name: "Demo Temp Object",
    flags: new Set(["thing"]),
    state: { demo: true, owner: u.me.id },
    contents: [],
  });
  out += `\n  Created: #${tmp.id} "${tmp.name}"`;

  // Modify it
  await u.db.modify(tmp.id, "$set", { state: { demo: true, label: "modified", owner: u.me.id } });
  out += `\n  Modified: set state.label = "modified"`;

  // Destroy it
  await u.db.destroy(tmp.id);
  out += `\n  Destroyed: #${tmp.id}`;

  u.send(out);

  u.ui.layout({
    components: [
      u.ui.panel({ type: "header", content: "DB Demo" }),
      u.ui.panel({ type: "list", title: "Connected Players", content:
        players.slice(0, 5).map(p => ({ label: `#${p.id}`, value: p.name ?? "?" }))
      }),
      u.ui.panel({ type: "list", title: "Stats", content: [
        { label: "Rooms",           value: String(rooms.length) },
        { label: "Players online",  value: String(players.length) },
      ]}),
    ],
    meta: { type: "demo-db" },
  });
}

// ── Sys: uptime / gameTime ────────────────────────────────────────────────────

async function demoSys(u: IUrsamuSDK) {
  const uptime   = await u.sys.uptime();
  const gameTime = await u.sys.gameTime();

  const MONTH_NAMES = [
    "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  let out = section("SYS — uptime");
  out += `\n  Raw seconds: ${uptime}`;
  out += `\n  Formatted  : ${fmtSecs(uptime)}`;

  out += section("SYS — gameTime");
  out += `\n  Year  : ${gameTime.year}`;
  out += `\n  Month : ${gameTime.month} (${MONTH_NAMES[gameTime.month] ?? "?"})`;
  out += `\n  Day   : ${gameTime.day}`;
  out += `\n  Hour  : ${gameTime.hour}`;
  out += `\n  Minute: ${gameTime.minute}`;
  out += `\n\n  In-game date: ${MONTH_NAMES[gameTime.month] ?? "?"} ${gameTime.day}, Year ${gameTime.year}`;
  out += `\n  In-game time: ${String(gameTime.hour).padStart(2, "0")}:${String(gameTime.minute).padStart(2, "0")}`;

  u.send(out);

  u.ui.layout({
    components: [
      u.ui.panel({ type: "header", content: "Sys Demo" }),
      u.ui.panel({ type: "list", title: "Server", content: [
        { label: "Uptime",     value: fmtSecs(uptime) },
        { label: "Real time",  value: new Date().toUTCString() },
      ]}),
      u.ui.panel({ type: "list", title: "Game Time", content: [
        { label: "Date", value: `${MONTH_NAMES[gameTime.month] ?? "?"} ${gameTime.day}, Year ${gameTime.year}` },
        { label: "Time", value: `${String(gameTime.hour).padStart(2, "0")}:${String(gameTime.minute).padStart(2, "0")}` },
      ]}),
    ],
    meta: { type: "demo-sys" },
  });
}

// ── Chan: channel list / history ──────────────────────────────────────────────

async function demoChan(u: IUrsamuSDK) {
  const channels = await u.chan.list() as Array<{ name: string; header?: string; hidden?: boolean }>;

  let out = section("CHAN — chan.list");
  if (channels.length === 0) {
    out += "\n  (no channels exist yet)";
  } else {
    for (const ch of channels) {
      const hidden = ch.hidden ? " [hidden]" : "";
      out += `\n  ${u.util.ljust(ch.name, 20)}${ch.header ?? ""}${hidden}`;
    }
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
    out += "\n  (no channels to inspect)";
  }

  u.send(out);

  u.ui.layout({
    components: [
      u.ui.panel({ type: "header", content: "Chan Demo" }),
      u.ui.panel({ type: "table", content: [
        ["Channel", "Header", "Hidden"],
        ...channels.map(ch => [ch.name, ch.header ?? "", ch.hidden ? "yes" : "no"]),
      ]}),
    ],
    meta: { type: "demo-chan" },
  });
}

// ── UI: all panel types ───────────────────────────────────────────────────────

async function demoUI(u: IUrsamuSDK) {
  // Telnet preview of what each panel type carries
  let out = section("UI — panel types");
  out += "\n  header, panel, list, grid, table\n";
  out += "  (web clients render each type differently)\n";
  out += "  Sending structured layout now — check your web client.\n";
  u.send(out);

  // Gather some live data to make the panels interesting.
  const players = (await u.db.search({ flags: /connected/i }))
    .filter(p => p.flags.has("player") && !p.flags.has("dark"))
    .slice(0, 6);

  const items = u.me.contents.filter(o => !o.flags.has("exit") && !o.flags.has("room"));

  const exits = u.here.contents.filter(o => o.flags.has("exit"));

  u.ui.layout({
    components: [
      // header
      u.ui.panel({
        type: "header",
        content: "UI Components Demo",
        style: "bold centered",
      }),

      // plain panel — free-form text / description
      u.ui.panel({
        type: "panel",
        content: "This is a %chpanel%cn component — free-form text, "
          + "rich descriptions, or any HTML-safe string.",
      }),

      // list — labelled key/value rows
      u.ui.panel({
        type: "list",
        title: "Actor Info",
        content: [
          { label: "Name",   value: u.me.name ?? "?" },
          { label: "DBRef",  value: `#${u.me.id}` },
          { label: "Flags",  value: [...u.me.flags].join(" ") || "(none)" },
          { label: "Money",  value: String((u.me.state.money as number) ?? 0) },
          { label: "Doing",  value: (u.me.state.doing as string) || "(none)" },
        ],
      }),

      // table — header row + data rows
      u.ui.panel({
        type: "table",
        title: "Who's Here",
        content: [
          ["Player", "Flags", "Doing"],
          ...players.map(p => [
            p.name ?? "?",
            [...p.flags].join(" ") || "-",
            (p.state.doing as string) || "-",
          ]),
          ...(players.length === 0 ? [["(nobody online)", "", ""]] : []),
        ],
      }),

      // grid — icon-card layout for objects / exits
      u.ui.panel({
        type: "grid",
        title: "Your Inventory",
        content: items.length > 0
          ? items.map(i => ({ name: i.name ?? "?", id: i.id }))
          : [{ name: "(nothing)", id: "" }],
      }),

      u.ui.panel({
        type: "grid",
        title: "Exits",
        content: exits.length > 0
          ? exits.map(e => {
              const parts = ((e.state.name as string) || e.name || "?").split(";");
              return { name: parts[0], alias: parts[1] ?? parts[0] };
            })
          : [{ name: "(none)", alias: "" }],
      }),
    ],
    meta: {
      type: "demo-ui",
      roomId: u.here.id,
    },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
