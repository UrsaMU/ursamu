// deno-lint-ignore-file require-await
/**
 * @module stdlib/object-identity
 *
 * Identity and flag softcode functions:
 * name, fullname, dbref, num, type, hastype, flags, lflags, hasflag, isdbref
 */

import { register } from "./registry.ts";
import { resolveObj } from "./object-shared.ts";

// ── identity ──────────────────────────────────────────────────────────────────

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
register("num", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  return obj ? `#${obj.id}` : "#-1";
});
register("type", async (a, ctx) => {
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

// ── flags ─────────────────────────────────────────────────────────────────────

register("flags", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  return obj ? [...obj.flags].join(" ") : "#-1 NOT FOUND";
});
register("lflags", async (a, ctx) => {
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
