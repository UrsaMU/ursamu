// deno-lint-ignore-file require-await
/**
 * @module stdlib/object-location
 *
 * Location, contents, ownership, and visibility softcode functions:
 * loc, home, owner, parent, lparent, children, zone, inzone,
 * lcon, con, lexits, exit, next, lwho, pmatch, pfind, locate, match,
 * controls, visible, findable, nearby
 */

import { register } from "./registry.ts";
import { resolveObj } from "./object-shared.ts";
import { int } from "./helpers.ts";

// ── location / ownership ──────────────────────────────────────────────────────

register("loc", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  return obj?.location ? `#${obj.location}` : "#-1";
});
register("home", async (a, ctx) => {
  const obj  = await resolveObj(a[0] ?? "me", ctx);
  const home = (obj?.state as Record<string, unknown>)?.home as string | undefined;
  return home ? `#${home}` : "#-1";
});
register("owner", async (a, ctx) => {
  const obj     = await resolveObj(a[0] ?? "me", ctx);
  const ownerId = (obj?.state as Record<string, unknown>)?.owner as string | undefined;
  return ownerId ? `#${ownerId}` : (obj ? `#${obj.id}` : "#-1");
});
register("parent", async (a, ctx) => {
  const obj      = await resolveObj(a[0] ?? "me", ctx);
  const parentId = (obj?.state as Record<string, unknown>)?.parent as string | undefined;
  return parentId ? `#${parentId}` : "#-1";
});
register("lparent", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "#-1 NOT FOUND";
  const chain: string[] = [`#${obj.id}`];
  let cur = obj;
  const visited = new Set<string>([obj.id]);
  while (true) {
    const pid = (cur.state as Record<string, unknown>)?.parent as string | undefined;
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
register("zone", async (a, ctx) => {
  const obj    = await resolveObj(a[0] ?? "me", ctx);
  const zoneId = (obj?.state as Record<string, unknown>)?.zone as string | undefined;
  return zoneId ? `#${zoneId}` : "#-1";
});
register("inzone", async (a, ctx) => {
  const obj    = await resolveObj(a[0] ?? "me", ctx);
  const zmo    = await resolveObj(a[1] ?? "", ctx);
  const zoneId = (obj?.state as Record<string, unknown>)?.zone as string | undefined;
  return zoneId && zmo && zoneId === zmo.id ? "1" : "0";
});

// ── contents ──────────────────────────────────────────────────────────────────

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
  const obj   = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "#-1";
  const exits = (await ctx.db.lcon(obj.id)).filter(o => o.flags.has("exit"));
  return exits[0] ? `#${exits[0].id}` : "#-1";
});
register("next", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj || !obj.location) return "#-1";
  const siblings = await ctx.db.lcon(obj.location);
  const i = siblings.findIndex(o => o.id === obj.id);
  return i >= 0 && i + 1 < siblings.length ? `#${siblings[i + 1].id}` : "#-1";
});
register("lwho", async (_a, ctx) => {
  const list = await ctx.db.lwho();
  return list.map(o => `#${o.id}`).join(" ");
});

// ── object search ─────────────────────────────────────────────────────────────

register("pmatch", async (a, ctx) => {
  const name  = (a[0] ?? "").toLowerCase();
  const list  = await ctx.db.lwho();
  const exact = list.find(o => (o.name ?? "").toLowerCase() === name);
  if (exact) return `#${exact.id}`;
  const partial = list.find(o => (o.name ?? "").toLowerCase().startsWith(name));
  return partial ? `#${partial.id}` : "#-1 NO MATCH";
});
register("pfind", async (a, ctx) => {
  const name  = (a[0] ?? "").toLowerCase();
  const found = (await ctx.db.lwho()).filter(o => (o.name ?? "").toLowerCase().startsWith(name));
  if (found.length === 1) return `#${found[0].id}`;
  if (found.length === 0) return "#-1 NO MATCH";
  return "#-2 AMBIGUOUS";
});
register("locate", async (a, ctx) => {
  // locate(looker, thing, type_string) — simplified: find by name
  const obj = await ctx.db.queryByName(a[1] ?? "");
  return obj ? `#${obj.id}` : "#-1 NOT FOUND";
});
register("match", async (a, ctx) => {
  const obj  = await resolveObj(a[0] ?? "me", ctx);
  const name = (a[1] ?? "").toLowerCase();
  if (!obj) return "0";
  return (obj.name ?? "").toLowerCase().startsWith(name) ? "1" : "0";
});

// ── visibility and access ─────────────────────────────────────────────────────

register("controls", async (a, ctx) => {
  const actor  = await resolveObj(a[0] ?? "me", ctx);
  const target = await resolveObj(a[1] ?? "", ctx);
  if (!actor || !target) return "0";
  if (actor.flags.has("wizard") || actor.flags.has("admin")) return "1";
  const ownerId = (target.state as Record<string, unknown>)?.owner as string | undefined;
  return (!ownerId || ownerId === actor.id) ? "1" : "0";
});
register("visible", async (a, ctx) => {
  const looker = await resolveObj(a[0] ?? "me", ctx);
  const target = await resolveObj(a[1] ?? "", ctx);
  if (!looker || !target) return "0";
  if (looker.flags.has("wizard") || looker.flags.has("admin") || looker.flags.has("superuser")) return "1";
  if (target.flags.has("dark")) {
    const ownerId = (target.state as Record<string, unknown>)?.owner as string | undefined;
    return (!ownerId || ownerId === looker.id || target.id === looker.id) ? "1" : "0";
  }
  return "1";
});
register("findable", async (a, ctx) => {
  const looker = await resolveObj(a[0] ?? "me", ctx);
  const target = await resolveObj(a[1] ?? "", ctx);
  if (!looker || !target) return "0";
  if (looker.flags.has("wizard") || looker.flags.has("admin") || looker.flags.has("superuser")) return "1";
  if (target.flags.has("unfindable")) {
    const ownerId = (target.state as Record<string, unknown>)?.owner as string | undefined;
    return (!ownerId || ownerId === looker.id) ? "1" : "0";
  }
  return "1";
});
register("nearby", async (a, ctx) => {
  const o1 = await resolveObj(a[0] ?? "me", ctx);
  const o2 = await resolveObj(a[1] ?? "", ctx);
  if (!o1 || !o2) return "0";
  return o1.location === o2.location ? "1" : "0";
});

// ── traversal helpers ─────────────────────────────────────────────────────────

register("where", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  return obj?.location ? `#${obj.location}` : "#-1";
});
register("rloc", async (a, ctx) => {
  let obj    = await resolveObj(a[0] ?? "me", ctx);
  let levels = int(a[1] ?? "0");
  while (obj && levels-- > 0 && obj.location) {
    obj = await ctx.db.queryById(obj.location);
  }
  return obj ? `#${obj.id}` : "#-1";
});
register("room", async (a, ctx) => {
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
register("lastcreate", async () => "#-1");
