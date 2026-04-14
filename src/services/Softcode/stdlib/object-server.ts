// deno-lint-ignore-file require-await
/**
 * @module stdlib/object-server
 *
 * Server, time, connection, channel, mail, and count softcode functions.
 * Covers: money, memory stubs, connection tracking, time/strftime, server info,
 * TinyMUX compatibility stubs, channels, mail, object counts, powers, moniker,
 * lsearch/search, and misc numeric helpers.
 */

import { register } from "./registry.ts";
import { resolveObj } from "./object-shared.ts";
import { int } from "./helpers.ts";

// Server start time — captured when this module first loads.
const _SERVER_START_SECS = Math.floor(Date.now() / 1000);

/** Max objects returned by lsearch/search to prevent OOM on large DBs. */
const MAX_LSEARCH_RESULTS = 1_000;

// ── money / memory ────────────────────────────────────────────────────────────

register("money", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "0";
  return String((obj.state as Record<string, unknown>)?.money ?? 0);
});
register("objmem",  async () => "0");
register("playmem", async () => "0");

// ── connection ────────────────────────────────────────────────────────────────

register("conn", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj || !obj.flags.has("connected")) return "-1";
  if (ctx.db.getConnSecs) return String(await ctx.db.getConnSecs(obj.id));
  return "0";
});
register("connlast",   async () => "0");
register("connmax",    async () => "0");
register("connnum",    async () => "0");
register("connrecord", async () => "0");
register("conntotal",  async () => "0");
register("connleft",   async () => "0");
register("idle", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "0";
  return String(await ctx.db.getIdleSecs(obj.id));
});
register("doing", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "";
  return (await ctx.db.getAttribute(obj, "DOING")) ?? "";
});
register("host",  async () => "");
register("ports", async () => "0");
register("lports", async () => "");
register("cwho", async (_a, ctx) => {
  const list = await ctx.db.lwho();
  return list.map(o => `#${o.id}`).join(" ");
});

// ── server info ───────────────────────────────────────────────────────────────

register("mudname", async () => "UrsaMU");
register("version", async () => "UrsaMU/2.x (TinyMUX compat)");
register("poll",    async () => "");
register("motd",    async () => "");
register("config",  async () => "");
register("stats",   async () => "0 0 0 0 0 0");
register("dumping", async () => "0");
register("valid",   async (a) => a[0] ? "1" : "0");

// ── strftime ──────────────────────────────────────────────────────────────────

const _DAYS   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const _MONTHS = ["January","February","March","April","May","June",
                 "July","August","September","October","November","December"];

function strftime(fmt: string, d: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return fmt.replace(/%([a-zA-Z%ntz])/g, (_, c) => {
    switch (c) {
      case "a": return _DAYS[d.getDay()].slice(0, 3);
      case "A": return _DAYS[d.getDay()];
      case "b": case "h": return _MONTHS[d.getMonth()].slice(0, 3);
      case "B": return _MONTHS[d.getMonth()];
      case "c": return d.toLocaleString();
      case "d": return pad(d.getDate());
      case "e": return String(d.getDate()).padStart(2, " ");
      case "H": return pad(d.getHours());
      case "I": return pad((d.getHours() % 12) || 12);
      case "j": {
        const start = new Date(d.getFullYear(), 0, 0);
        return pad(Math.floor((d.getTime() - start.getTime()) / 86400000), 3);
      }
      case "m": return pad(d.getMonth() + 1);
      case "M": return pad(d.getMinutes());
      case "n": return "\n";
      case "p": return d.getHours() < 12 ? "AM" : "PM";
      case "P": return d.getHours() < 12 ? "am" : "pm";
      case "S": return pad(d.getSeconds());
      case "t": return "\t";
      case "T": return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      case "u": return String(d.getDay() || 7);
      case "w": return String(d.getDay());
      case "x": return d.toLocaleDateString();
      case "X": return d.toLocaleTimeString();
      case "y": return pad(d.getFullYear() % 100);
      case "Y": return String(d.getFullYear());
      case "z": return d.toTimeString().match(/GMT[+-]\d{4}/)?.[0] ?? "+0000";
      case "Z": return Intl.DateTimeFormat().resolvedOptions().timeZone;
      case "%": return "%";
      default:  return `%${c}`;
    }
  });
}

// ── time functions ────────────────────────────────────────────────────────────

register("secs",         async () => String(Math.floor(Date.now() / 1000)));
register("time",         async () => new Date().toUTCString());
register("ctime",        async () => new Date().toUTCString());
register("mtime",        async () => new Date().toUTCString());
register("startsecs",    async () => String(_SERVER_START_SECS));
register("starttime",    async () => new Date(_SERVER_START_SECS * 1000).toUTCString());
register("restarts",     async () => "0");
register("restartsecs",  async () => String(_SERVER_START_SECS));
register("restarttime",  async () => new Date(_SERVER_START_SECS * 1000).toUTCString());
register("writetime",    async () => String(Math.floor(Date.now() / 1000)));
register("timefmt", async (a) => {
  const d   = a[1] ? new Date(int(a[1]) * 1000) : new Date();
  return strftime(a[0] ?? "%c", d);
});
register("convsecs",  async (a) => String(int(a[0])));
register("convtime",  async (a) => String(new Date(a[0] ?? "").getTime() / 1000 || 0));
register("etimefmt",  async (a) => {
  const secs = int(a[1] ?? "0");
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return (a[0] ?? "%H:%M:%S")
    .replace(/%H/g, String(h).padStart(2, "0"))
    .replace(/%M/g, String(m).padStart(2, "0"))
    .replace(/%S/g, String(s).padStart(2, "0"));
});
register("exptime",   async () => "0");
register("digittime", async (a) => {
  const total = Math.max(0, int(a[0] ?? "0"));
  const d  = Math.floor(total / 86400);
  const h  = Math.floor((total % 86400) / 3600);
  const m  = Math.floor((total % 3600) / 60);
  const s  = total % 60;
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return d > 0 ? `${d}:${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
});
register("singletime", async (a) => {
  const total = Math.max(0, int(a[0] ?? "0"));
  if (total < 60)    return `${total}s`;
  if (total < 3600)  return `${Math.floor(total / 60)}m`;
  if (total < 86400) return `${Math.floor(total / 3600)}h`;
  return `${Math.floor(total / 86400)}d`;
});

// ── TinyMUX stubs ─────────────────────────────────────────────────────────────

register("sql",          async () => "#-1 FUNCTION DISABLED");
register("rxlevel",      async () => "0");
register("txlevel",      async () => "0");
register("hasrxlevel",   async () => "0");
register("hastxlevel",   async () => "0");
register("listrlevels",  async () => "");
register("terminfo",     async () => "");
register("height",       async () => "24");
register("width",        async () => "80");
register("colordepth",   async () => "16");
register("isobjid",      async (a) => /^#\d+$/.test(a[0] ?? "") ? "1" : "0");
register("bittype",      async () => "0");

// ── channels ──────────────────────────────────────────────────────────────────

register("channels",  async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "";
  return await ctx.db.channelsFor(obj.id);
});
register("lchannels", async (_a, ctx) => await ctx.db.lchannels());
register("chanobj",   async () => "#-1");
register("zwho",      async () => "");
register("comalias",  async () => "");
register("comtitle",  async () => "");
register("lcmds",     async () => "");

// ── mail ─────────────────────────────────────────────────────────────────────

register("mail", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "0";
  return String(await ctx.db.mailCount(obj.id));
});
register("mailfrom",  async () => "");
register("mailsize",  async () => "0");
register("mailsubj",  async () => "");
register("mailj",     async () => "");

// ── object counts ─────────────────────────────────────────────────────────────

register("nattr", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "0";
  return String((await ctx.db.lattr(obj.id)).length);
});
register("ncon", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "0";
  return String((await ctx.db.lcon(obj.id)).filter(o => !o.flags.has("exit")).length);
});
register("nexits", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "0";
  return String((await ctx.db.lcon(obj.id)).filter(o => o.flags.has("exit")).length);
});
register("nplayers", async (_a, ctx) => String((await ctx.db.lwho()).length));
register("nrooms", async (_a, ctx) => String((await ctx.db.lsearch({ type: "ROOM" })).length));
register("nobjects", async (_a, ctx) => String((await ctx.db.lsearch({ type: "THING" })).length));
register("qlength", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "0";
  return String(await ctx.db.queueLength(obj.id));
});

// ── powers ────────────────────────────────────────────────────────────────────

// Powers map to flags in UrsaMU (no separate power system).
register("haspower", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "0";
  return obj.flags.has((a[1] ?? "").toLowerCase()) ? "1" : "0";
});
register("powers", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "";
  const POWER_FLAGS = ["wizard", "admin", "builder", "staff"];
  return [...obj.flags].filter(f => POWER_FLAGS.includes(f)).join(" ");
});

// ── moniker / accname ─────────────────────────────────────────────────────────

register("moniker", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "";
  const m = (obj.state as Record<string, unknown>)?.moniker as string | undefined;
  return m ?? obj.name ?? "";
});
register("accname", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "";
  const sex = ((obj.state as Record<string, unknown>)?.sex as string ?? "").toLowerCase();
  if (sex === "male"   || sex === "m") return "him";
  if (sex === "female" || sex === "f") return "her";
  return "it";
});

// ── lsearch / search ──────────────────────────────────────────────────────────

register("lsearch", async (a, ctx) => {
  const type  = (a[0] ?? "").toUpperCase() || undefined;
  const attr  = a[1] || undefined;
  const val   = a[2] || undefined;
  const owner = a[3] || undefined;
  const results = await ctx.db.lsearch({
    type: type as "PLAYER" | "ROOM" | "EXIT" | "THING" | undefined,
    attr, attrVal: val, owner,
  });
  if (results.length > MAX_LSEARCH_RESULTS) return "#-1 TOO MANY RESULTS";
  return results.join(" ");
});
register("search", async (a, ctx) => {
  const type  = (a[0] ?? "").toUpperCase() || undefined;
  const attr  = a[1] || undefined;
  const val   = a[2] || undefined;
  const results = await ctx.db.lsearch({
    type: type as "PLAYER" | "ROOM" | "EXIT" | "THING" | undefined,
    attr, attrVal: val,
  });
  if (results.length > MAX_LSEARCH_RESULTS) return "#-1 TOO MANY RESULTS";
  return results.join(" ");
});
register(["nsearch", "nlsearch"], async (a, ctx) => {
  const type  = (a[0] ?? "").toUpperCase() || undefined;
  const attr  = a[1] || undefined;
  const val   = a[2] || undefined;
  const results = await ctx.db.lsearch({
    type: type as "PLAYER" | "ROOM" | "EXIT" | "THING" | undefined,
    attr, attrVal: val,
  });
  return String(results.length);
});

// ── misc ─────────────────────────────────────────────────────────────────────

register("unparse", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "#-1 NOT FOUND";
  return `${obj.name ?? "Unknown"}(#${obj.id})`;
});
register("lplayers", async (a, ctx) => {
  const all = await ctx.db.lwho();
  if (!a[0]) return all.map(p => `#${p.id}`).join(" ");
  const room = await resolveObj(a[0], ctx);
  if (!room) return "";
  return all.filter(p => p.location === room.id).map(p => `#${p.id}`).join(" ");
});
register("msecs",      async () => String(Date.now()));
register("numversion", async () => "1009000");
