import { register } from "./registry.ts";
import type { EvalContext } from "../context.ts";
import { snapshotRegisters, restoreRegisters, isTooDeep } from "../context.ts";
import { evaluate } from "../evaluator.ts";
import { parse } from "../parser.ts";
import type { IDBObj } from "../../../@types/UrsamuSDK.ts";

// ── helpers ───────────────────────────────────────────────────────────────

function int(s: string): number { return parseInt(s, 10) || 0; }

/** Resolve an object reference: "me", "here", "#N", "#tagname", name. */
async function resolveObj(ref: string, ctx: EvalContext): Promise<IDBObj | null> {
  const r = ref.trim();
  if (!r) return null;
  if (r.toLowerCase() === "me")   return ctx.executor;
  if (r.toLowerCase() === "here") return await ctx.db.queryById(ctx.executor.location ?? "") ?? null;
  if (r.toLowerCase() === "enactor" || r === "%#") return ctx.actor;
  if (/^#(-?\d+)$/.test(r)) return await ctx.db.queryById(r.slice(1));
  if (/^#[a-zA-Z]/.test(r)) {
    // #tagname — check actor's personal tags first, then global tags
    const tagName = r.slice(1);
    const personalId = await ctx.db.getPlayerTagById(ctx.actor.id, tagName);
    if (personalId) return await ctx.db.queryById(personalId);
    const globalId = await ctx.db.getTagById(tagName);
    return globalId ? await ctx.db.queryById(globalId) : null;
  }
  // Fall back to name lookup
  return await ctx.db.queryByName(r);
}

function safeParse(code: string): ReturnType<typeof parse> | null {
  try { return parse(code) as ReturnType<typeof parse>; }
  catch { return null; }
}

// ── identity functions ────────────────────────────────────────────────────

register("name",     async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  return obj?.name ?? "#-1 NOT FOUND";
});
register("fullname", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  return obj?.name ?? "#-1 NOT FOUND";
});
register("dbref", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  return obj ? `#${obj.id}` : "#-1";
});
register("num",   async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  return obj ? `#${obj.id}` : "#-1";
});
register("type",  async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "#-1 NOT FOUND";
  if (obj.flags.has("room"))   return "ROOM";
  if (obj.flags.has("exit"))   return "EXIT";
  if (obj.flags.has("player")) return "PLAYER";
  return "THING";
});
register("hastype", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "0";
  const t = (a[1] ?? "").toUpperCase();
  if (t === "ROOM"   && obj.flags.has("room"))   return "1";
  if (t === "EXIT"   && obj.flags.has("exit"))   return "1";
  if (t === "PLAYER" && obj.flags.has("player")) return "1";
  if (t === "THING"  && !obj.flags.has("room") && !obj.flags.has("exit") && !obj.flags.has("player")) return "1";
  return "0";
});

// ── flags ─────────────────────────────────────────────────────────────────

register("flags",   async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  return obj ? [...obj.flags].join(" ") : "#-1 NOT FOUND";
});
register("lflags",  async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  return obj ? [...obj.flags].join(" ") : "#-1 NOT FOUND";
});
register("hasflag", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "0";
  return obj.flags.has((a[1] ?? "").toLowerCase()) ? "1" : "0";
});
register("isdbref", async (a) => {
  return /^#-?\d+$/.test(a[0] ?? "") ? "1" : "0";
});

// ── attributes ────────────────────────────────────────────────────────────

register("hasattr",  async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "0";
  return (await ctx.db.getAttribute(obj, a[1] ?? "")) !== null ? "1" : "0";
});
register("hasattrp", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "0";
  return (await ctx.db.getAttribute(obj, a[1] ?? "")) !== null ? "1" : "0";
});
register("lattr",    async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "#-1 NOT FOUND";
  const attrs = await ctx.db.lattr(obj.id);
  const pat   = a[1] ?? "*";
  if (pat === "*") return attrs.join(" ");
  const re = globRe(pat);
  return attrs.filter(x => re.test(x)).join(" ");
});
register("lattrcmds", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "";
  const attrs = await ctx.db.lattr(obj.id);
  return attrs.filter(x => /^CMD_/i.test(x)).join(" ");
});
register("lattrp", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "";
  return (await ctx.db.lattr(obj.id)).join(" ");
});
register("attrcnt", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "0";
  return String((await ctx.db.lattr(obj.id)).length);
});

// ── get / set ─────────────────────────────────────────────────────────────

register("get", async (a, ctx) => {
  // get(obj/attr) or get(obj, attr)
  const spec   = a[0] ?? "";
  const slashI = spec.indexOf("/");
  const objRef = slashI >= 0 ? spec.slice(0, slashI) : "me";
  const attr   = slashI >= 0 ? spec.slice(slashI + 1) : (a[1] ?? "");
  const obj    = await resolveObj(objRef, ctx);
  if (!obj) return "#-1 NOT FOUND";
  return (await ctx.db.getAttribute(obj, attr)) ?? "";
});
register("xget", async (a, ctx) => {
  const obj  = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "#-1 NOT FOUND";
  return (await ctx.db.getAttribute(obj, a[1] ?? "")) ?? "";
});
register("get_eval", async (a, ctx) => {
  const spec   = a[0] ?? "";
  const slashI = spec.indexOf("/");
  const objRef = slashI >= 0 ? spec.slice(0, slashI) : "me";
  const attr   = slashI >= 0 ? spec.slice(slashI + 1) : (a[1] ?? "");
  const obj    = await resolveObj(objRef, ctx);
  if (!obj) return "#-1 NOT FOUND";
  const code = (await ctx.db.getAttribute(obj, attr)) ?? "";
  const ast  = safeParse(code);
  return ast ? await evaluate(ast as Parameters<typeof evaluate>[0], ctx) : code;
});

// ── v() — variable attribute on executor ─────────────────────────────────

register("v", async (a, ctx) => {
  return (await ctx.db.getAttribute(ctx.executor, a[0] ?? "")) ?? "";
});
register("default",  async (a, ctx) => {
  const spec   = a[0] ?? "";
  const slashI = spec.indexOf("/");
  const objRef = slashI >= 0 ? spec.slice(0, slashI) : "me";
  const attr   = slashI >= 0 ? spec.slice(slashI + 1) : spec;
  const obj    = await resolveObj(objRef, ctx);
  const val    = obj ? (await ctx.db.getAttribute(obj, attr)) : null;
  return val ?? (a[1] ?? "");
});
register("edefault", async (a, ctx) => {
  const spec   = a[0] ?? "";
  const slashI = spec.indexOf("/");
  const objRef = slashI >= 0 ? spec.slice(0, slashI) : "me";
  const attr   = slashI >= 0 ? spec.slice(slashI + 1) : spec;
  const obj    = await resolveObj(objRef, ctx);
  if (!obj) return a[1] ?? "";
  const code = await ctx.db.getAttribute(obj, attr);
  if (code === null) return a[1] ?? "";
  const ast = safeParse(code);
  return ast ? await evaluate(ast as Parameters<typeof evaluate>[0], ctx) : code;
});
register("udefault", async (a, ctx) => {
  const spec   = a[0] ?? "";
  const rest   = a.slice(1, -1);
  const def    = a[a.length - 1] ?? "";
  const result = await callAttr(spec, rest, ctx);
  return result === "" ? def : result;
});

// ── u() / ulocal() — call user function ──────────────────────────────────

register("u",      async (a, ctx) => callAttr(a[0] ?? "", a.slice(1), ctx, false));
register("ulocal", async (a, ctx) => callAttr(a[0] ?? "", a.slice(1), ctx, true));
register("eval",   async (a, ctx) => {
  const code = a[0] ?? "";
  const ast  = safeParse(code);
  return ast ? await evaluate(ast as Parameters<typeof evaluate>[0], ctx) : code;
});
register("subeval", async (a, ctx) => {
  const code = a[0] ?? "";
  const ast  = safeParse(code);
  return ast ? await evaluate(ast as Parameters<typeof evaluate>[0], ctx) : code;
});
register("objeval", async (a, ctx) => {
  const obj  = await resolveObj(a[0] ?? "me", ctx);
  const code = a[1] ?? "";
  if (!obj) return "#-1 NOT FOUND";
  const ast = safeParse(code);
  const subCtx = { ...ctx, executor: obj, depth: ctx.depth + 1 };
  return ast ? await evaluate(ast as Parameters<typeof evaluate>[0], subCtx) : code;
});
register("zfun", async (a, ctx) => {
  // zfun(attr, args...) — call attr on zone master object
  const zoneId = (ctx.executor as unknown as { zone?: string }).zone;
  if (!zoneId) return "#-1 NO ZONE";
  const zmo = await ctx.db.queryById(zoneId);
  if (!zmo) return "#-1 ZONE NOT FOUND";
  return callAttrOnObj(zmo, a[0] ?? "", a.slice(1), ctx, false);
});

// ── location functions ────────────────────────────────────────────────────

register("loc",     async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  return obj?.location ? `#${obj.location}` : "#-1";
});
register("home",    async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  // Home is stored in state.home or defaults to #-1
  const home = (obj?.state as Record<string,unknown>)?.home as string | undefined;
  return home ? `#${home}` : "#-1";
});
register("owner",   async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  const ownerId = (obj?.state as Record<string,unknown>)?.owner as string | undefined;
  return ownerId ? `#${ownerId}` : (obj ? `#${obj.id}` : "#-1");
});
register("parent",  async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  const parentId = (obj?.state as Record<string,unknown>)?.parent as string | undefined;
  return parentId ? `#${parentId}` : "#-1";
});
register("lparent", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "#-1 NOT FOUND";
  const chain: string[] = [`#${obj.id}`];
  let cur = obj;
  const visited = new Set<string>([obj.id]);
  while (true) {
    const pid = (cur.state as Record<string,unknown>)?.parent as string | undefined;
    if (!pid || visited.has(pid)) break;
    visited.add(pid);
    chain.push(`#${pid}`);
    const parent = await ctx.db.queryById(pid);
    if (!parent) break;
    cur = parent;
  }
  return chain.join(" ");
});
register("children", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "";
  const kids = await ctx.db.children(obj.id);
  return kids.map(k => `#${k.id}`).join(" ");
});
register("zone",    async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  const zoneId = (obj?.state as Record<string,unknown>)?.zone as string | undefined;
  return zoneId ? `#${zoneId}` : "#-1";
});
register("inzone",  async (a, ctx) => {
  const obj    = await resolveObj(a[0] ?? "me", ctx);
  const zmo    = await resolveObj(a[1] ?? "", ctx);
  const zoneId = (obj?.state as Record<string,unknown>)?.zone as string | undefined;
  return zoneId && zmo && zoneId === zmo.id ? "1" : "0";
});

// ── contents / list functions ─────────────────────────────────────────────

register("lcon", async (a, ctx) => {
  const obj  = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "#-1 NOT FOUND";
  const list = await ctx.db.lcon(obj.id);
  const type = (a[1] ?? "").toUpperCase();
  const filtered = type
    ? list.filter(o => {
        if (type === "PLAYER") return o.flags.has("player");
        if (type === "OBJECT") return !o.flags.has("player") && !o.flags.has("exit");
        if (type === "PUPPET") return o.flags.has("puppet");
        return true;
      })
    : list;
  return filtered.map(o => `#${o.id}`).join(" ");
});
register("con", async (a, ctx) => {
  const obj  = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "#-1";
  const list = await ctx.db.lcon(obj.id);
  return list[0] ? `#${list[0].id}` : "#-1";
});
register("lexits", async (a, ctx) => {
  const obj  = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "#-1 NOT FOUND";
  const list = await ctx.db.lcon(obj.id);
  return list.filter(o => o.flags.has("exit")).map(o => `#${o.id}`).join(" ");
});
register("exit", async (a, ctx) => {
  const obj  = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "#-1";
  const list = await ctx.db.lcon(obj.id);
  const exits = list.filter(o => o.flags.has("exit"));
  return exits[0] ? `#${exits[0].id}` : "#-1";
});
register("next", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj || !obj.location) return "#-1";
  const siblings = await ctx.db.lcon(obj.location);
  const i = siblings.findIndex(o => o.id === obj.id);
  return i >= 0 && i + 1 < siblings.length ? `#${siblings[i+1].id}` : "#-1";
});
register("lwho",  async (_a, ctx) => {
  const list = await ctx.db.lwho();
  return list.map(o => `#${o.id}`).join(" ");
});

// ── match / pmatch ────────────────────────────────────────────────────────

register("pmatch", async (a, ctx) => {
  const name = (a[0] ?? "").toLowerCase();
  const list = await ctx.db.lwho();
  const exact = list.find(o => (o.name ?? "").toLowerCase() === name);
  if (exact) return `#${exact.id}`;
  const partial = list.find(o => (o.name ?? "").toLowerCase().startsWith(name));
  return partial ? `#${partial.id}` : "#-1 NO MATCH";
});
register("pfind", async (a, ctx) => {
  const name = (a[0] ?? "").toLowerCase();
  const list = await ctx.db.lwho();
  const found = list.filter(o => (o.name ?? "").toLowerCase().startsWith(name));
  if (found.length === 1) return `#${found[0].id}`;
  if (found.length === 0) return "#-1 NO MATCH";
  return "#-2 AMBIGUOUS";
});
register("locate", async (a, ctx) => {
  // locate(looker, thing, type_string) — simplified: find by name
  const name = a[1] ?? "";
  const obj  = await ctx.db.queryByName(name);
  return obj ? `#${obj.id}` : "#-1 NOT FOUND";
});
register("match", async (a, ctx) => {
  // match(obj, name) — is name a partial match for obj?
  const obj  = await resolveObj(a[0] ?? "me", ctx);
  const name = (a[1] ?? "").toLowerCase();
  if (!obj) return "0";
  return (obj.name ?? "").toLowerCase().startsWith(name) ? "1" : "0";
});

// ── controls / visible / nearby ───────────────────────────────────────────

register("controls", async (a, ctx) => {
  const actor  = await resolveObj(a[0] ?? "me", ctx);
  const target = await resolveObj(a[1] ?? "", ctx);
  if (!actor || !target) return "0";
  if (actor.flags.has("wizard") || actor.flags.has("admin")) return "1";
  const ownerId = (target.state as Record<string,unknown>)?.owner as string | undefined;
  return (!ownerId || ownerId === actor.id) ? "1" : "0";
});
register("visible",  async () => "1");  // simplified
register("findable", async () => "1");  // simplified
register("nearby",   async (a, ctx) => {
  const o1 = await resolveObj(a[0] ?? "me", ctx);
  const o2 = await resolveObj(a[1] ?? "", ctx);
  if (!o1 || !o2) return "0";
  return o1.location === o2.location ? "1" : "0";
});

// ── money ─────────────────────────────────────────────────────────────────

register("money", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "0";
  return String((obj.state as Record<string,unknown>)?.money ?? 0);
});

// ── memory ────────────────────────────────────────────────────────────────

register("objmem",  async () => "0");
register("playmem", async () => "0");

// ── connection ────────────────────────────────────────────────────────────

register("conn",       async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  return obj?.flags.has("connected") ? "1" : "0";
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
register("host",       async () => "");
register("ports",      async () => "0");
register("lports",     async () => "");
register("cwho",       async (_a, ctx) => {
  const list = await ctx.db.lwho();
  return list.map(o => `#${o.id}`).join(" ");
});
register("lwho",       async (_a, ctx) => {
  const list = await ctx.db.lwho();
  return list.map(o => `#${o.id}`).join(" ");
});

// ── misc object ───────────────────────────────────────────────────────────

register("where",  async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  return obj?.location ? `#${obj.location}` : "#-1";
});
register("rloc", async (a, ctx) => {
  // rloc(obj, levels) — go up levels in location chain
  let obj = await resolveObj(a[0] ?? "me", ctx);
  let levels = int(a[1] ?? "0");
  while (obj && levels-- > 0 && obj.location) {
    obj = await ctx.db.queryById(obj.location);
  }
  return obj ? `#${obj.id}` : "#-1";
});
register("room",   async (a, ctx) => {
  let obj = await resolveObj(a[0] ?? "me", ctx);
  const visited = new Set<string>();
  while (obj && !obj.flags.has("room") && obj.location && !visited.has(obj.id)) {
    visited.add(obj.id);
    obj = await ctx.db.queryById(obj.location);
  }
  return obj?.flags.has("room") ? `#${obj.id}` : "#-1";
});
register("lrooms", async (_a, ctx) => {
  const rooms = await ctx.db.lsearch({ type: "ROOM" });
  return rooms.join(" ");
});
register("lastcreate", async () => "#-1");  // simplified

// ── server / misc ─────────────────────────────────────────────────────────

register("mudname",    async () => "UrsaMU");
register("version",    async () => "UrsaMU/2.x (TinyMUX compat)");
register("poll",       async () => "");
register("motd",       async () => "");
register("config",     async () => "");
register("stats",      async () => "0 0 0 0 0 0");
register("dumping",    async () => "0");
register("valid",      async (a) => a[0] ? "1" : "0");

// ── time ──────────────────────────────────────────────────────────────────

register("secs",       async () => String(Math.floor(Date.now() / 1000)));
register("time",       async () => new Date().toUTCString());
register("ctime",      async () => new Date().toUTCString());
register("mtime",      async () => new Date().toUTCString());
register("startsecs",  async () => "0");
register("starttime",  async () => "");
register("restarts",   async () => "0");
register("restartsecs",async () => "0");
register("restarttime",async () => "");
register("writetime",  async () => "0");
register("timefmt",    async (a) => {
  // Simplified: return current time formatted
  const d = a[1] ? new Date(int(a[1]) * 1000) : new Date();
  return d.toUTCString();
});
register("convsecs",   async (a) => String(int(a[0])));
register("convtime",   async (a) => String(new Date(a[0] ?? "").getTime() / 1000 || 0));
register("etimefmt",   async (a) => {
  const secs = int(a[1] ?? "0");
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const fmt = a[0] ?? "%H:%M:%S";
  return fmt
    .replace(/%H/g, String(h).padStart(2,"0"))
    .replace(/%M/g, String(m).padStart(2,"0"))
    .replace(/%S/g, String(s).padStart(2,"0"));
});
register("exptime",    async () => "0");
register("digittime", async (a) => {
  // digittime(seconds) → D:HH:MM:SS
  const total = Math.max(0, int(a[0] ?? "0"));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return d > 0 ? `${d}:${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
});
register("singletime", async (a) => {
  // singletime(seconds) → compact human-readable: 30s, 5m, 2h, 3d
  const total = Math.max(0, int(a[0] ?? "0"));
  if (total < 60)    return `${total}s`;
  if (total < 3600)  return `${Math.floor(total / 60)}m`;
  if (total < 86400) return `${Math.floor(total / 3600)}h`;
  return `${Math.floor(total / 86400)}d`;
});

// ── TinyMUX stubs ─────────────────────────────────────────────────────────

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

// ── channels ──────────────────────────────────────────────────────────────

register("channels", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "";
  return await ctx.db.channelsFor(obj.id);
});
register("lchannels", async (_a, ctx) => {
  return await ctx.db.lchannels();
});
register("chanobj",   async () => "#-1");
register("zwho",      async () => "");
register("comalias",  async () => "");
register("comtitle",  async () => "");
register("lcmds",     async () => "");

// ── mail ─────────────────────────────────────────────────────────────────

register("mail", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "0";
  return String(await ctx.db.mailCount(obj.id));
});
register("mailfrom",  async () => "");
register("mailsize",  async () => "0");
register("mailsubj",  async () => "");
register("mailj",     async () => "");

// ── nattr / ncon / nexits / nplayers / nrooms / nobjects ─────────────────

register("nattr", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "0";
  return String((await ctx.db.lattr(obj.id)).length);
});
register("ncon", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "0";
  const list = await ctx.db.lcon(obj.id);
  return String(list.filter(o => !o.flags.has("exit")).length);
});
register("nexits", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "0";
  const list = await ctx.db.lcon(obj.id);
  return String(list.filter(o => o.flags.has("exit")).length);
});
register("nplayers", async (_a, ctx) => {
  return String((await ctx.db.lwho()).length);
});
register("nrooms", async (_a, ctx) => {
  const rooms = await ctx.db.lsearch({ type: "ROOM" });
  return String(rooms.length);
});
register("nobjects", async (_a, ctx) => {
  const objs = await ctx.db.lsearch({ type: "THING" });
  return String(objs.length);
});

// ── qlength ───────────────────────────────────────────────────────────────

register("qlength", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "0";
  return String(await ctx.db.queueLength(obj.id));
});

// ── powers ────────────────────────────────────────────────────────────────

// Powers map to flags in UrsaMU (no separate power system).
// Note: power(base, exp) is the math function in math.ts — do NOT override it.
register("haspower", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "0";
  const p = (a[1] ?? "").toLowerCase();
  return obj.flags.has(p) ? "1" : "0";
});
register("powers", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "";
  const POWER_FLAGS = ["wizard", "admin", "builder", "staff"];
  return [...obj.flags].filter(f => POWER_FLAGS.includes(f)).join(" ");
});

// ── moniker ───────────────────────────────────────────────────────────────

register("moniker", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "";
  const m = (obj.state as Record<string,unknown>)?.moniker as string | undefined;
  return m ?? obj.name ?? "";
});

// ── accname ───────────────────────────────────────────────────────────────

register("accname", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "";
  const sex = ((obj.state as Record<string,unknown>)?.sex as string ?? "").toLowerCase();
  if (sex === "male" || sex === "m") return "him";
  if (sex === "female" || sex === "f") return "her";
  return "it";
});

// ── lsearch / search ──────────────────────────────────────────────────────

register("lsearch", async (a, ctx) => {
  // lsearch(type [, attr, val [, owner]])
  const type  = (a[0] ?? "").toUpperCase() || undefined;
  const attr  = a[1] || undefined;
  const val   = a[2] || undefined;
  const owner = a[3] || undefined;
  const results = await ctx.db.lsearch({ type: type as "PLAYER" | "ROOM" | "EXIT" | "THING" | undefined, attr, attrVal: val, owner });
  return results.join(" ");
});
register("search", async (a, ctx) => {
  // search(type [, attr, val]) — alias for lsearch
  const type  = (a[0] ?? "").toUpperCase() || undefined;
  const attr  = a[1] || undefined;
  const val   = a[2] || undefined;
  const results = await ctx.db.lsearch({ type: type as "PLAYER" | "ROOM" | "EXIT" | "THING" | undefined, attr, attrVal: val });
  return results.join(" ");
});

// ── msecs / numversion ────────────────────────────────────────────────────

register("msecs", async () => String(Date.now()));
register("numversion", async () => {
  // Pack version as major*1000000 + minor*1000 + patch
  // UrsaMU version ~ 1.9.x → 1009000
  return "1009000";
});

// ── internal helpers ──────────────────────────────────────────────────────

function globRe(pattern: string): RegExp {
  const re = "^" + pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".") + "$";
  return new RegExp(re, "i");
}

async function callAttr(
  spec: string, args: string[], ctx: EvalContext, local = false
): Promise<string> {
  const slashI = spec.indexOf("/");
  const objRef  = slashI >= 0 ? spec.slice(0, slashI) : "me";
  const attrName = slashI >= 0 ? spec.slice(slashI + 1) : spec;
  const obj     = await resolveObj(objRef, ctx);
  if (!obj) return "#-1 NOT FOUND";
  return callAttrOnObj(obj, attrName, args, ctx, local);
}

async function callAttrOnObj(
  obj: IDBObj, attrName: string, args: string[], ctx: EvalContext, local: boolean
): Promise<string> {
  if (isTooDeep(ctx)) return "#-1 TOO DEEP";
  const code = await ctx.db.getAttribute(obj, attrName);
  if (code === null) return "";
  const ast = safeParse(code);
  if (!ast) return code;

  const snapshot = local ? snapshotRegisters(ctx) : null;
  const subCtx = {
    ...ctx,
    executor: obj,
    caller:   ctx.executor,
    args,
    depth:    ctx.depth + 1,
    registers: local ? new Map(ctx.registers) : ctx.registers,
  };

  const result = await evaluate(ast as Parameters<typeof evaluate>[0], subCtx);

  if (local && snapshot) restoreRegisters(ctx, snapshot);
  return result;
}
