// deno-lint-ignore-file require-await
/**
 * @module stdlib/object-attrs
 *
 * Attribute access and user-function softcode:
 * hasattr, lattr, get, xget, get_eval, v, default, edefault, udefault,
 * u, ulocal, eval, subeval, s, objeval, zfun
 */

import { register } from "./registry.ts";
import type { EvalContext } from "../context.ts";
import { snapshotRegisters, restoreRegisters, isTooDeep } from "../context.ts";
import { evaluate } from "../evaluator.ts";
import { parse } from "../parser.ts";
import type { IDBObj } from "../../../@types/UrsamuSDK.ts";
import { resolveObj } from "./object-shared.ts";

// ── Internal helpers ──────────────────────────────────────────────────────────

function safeParse(code: string): ReturnType<typeof parse> | null {
  try { return parse(code) as ReturnType<typeof parse>; }
  catch { return null; }
}

function globRe(pattern: string): RegExp {
  const re = "^" + pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".") + "$";
  return new RegExp(re, "i");
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
    executor:  obj,
    caller:    ctx.executor,
    args,
    depth:     ctx.depth + 1,
    registers: local ? new Map(ctx.registers) : ctx.registers,
  };

  const result = await evaluate(ast as Parameters<typeof evaluate>[0], subCtx);
  if (local && snapshot) restoreRegisters(ctx, snapshot);
  return result;
}

async function callAttr(
  spec: string, args: string[], ctx: EvalContext, local = false
): Promise<string> {
  const slashI   = spec.indexOf("/");
  const objRef   = slashI >= 0 ? spec.slice(0, slashI) : "me";
  const attrName = slashI >= 0 ? spec.slice(slashI + 1) : spec;
  const obj      = await resolveObj(objRef, ctx);
  if (!obj) return "#-1 NOT FOUND";
  return callAttrOnObj(obj, attrName, args, ctx, local);
}

// ── Attribute query ───────────────────────────────────────────────────────────

register("hasattr",   async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "0";
  return (await ctx.db.getAttribute(obj, a[1] ?? "")) !== null ? "1" : "0";
});
register("hasattrp",  async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "0";
  return (await ctx.db.getAttribute(obj, a[1] ?? "")) !== null ? "1" : "0";
});
register("lattr",     async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "#-1 NOT FOUND";
  const attrs = await ctx.db.lattr(obj.id);
  const pat = a[1] ?? "*";
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
register("lattrp",    async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "";
  return (await ctx.db.lattr(obj.id)).join(" ");
});
register("attrcnt",   async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "0";
  return String((await ctx.db.lattr(obj.id)).length);
});

// ── get / set ─────────────────────────────────────────────────────────────────

register("get", async (a, ctx) => {
  const spec   = a[0] ?? "";
  const slashI = spec.indexOf("/");
  const objRef = slashI >= 0 ? spec.slice(0, slashI) : "me";
  const attr   = slashI >= 0 ? spec.slice(slashI + 1) : (a[1] ?? "");
  const obj    = await resolveObj(objRef, ctx);
  if (!obj) return "#-1 NOT FOUND";
  return (await ctx.db.getAttribute(obj, attr)) ?? "";
});
register("xget", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
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

// ── v() / default / edefault / udefault ──────────────────────────────────────

register("v", async (a, ctx) => {
  return (await ctx.db.getAttribute(ctx.executor, a[0] ?? "")) ?? "";
});
register("default", async (a, ctx) => {
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

// ── u() / ulocal() / eval / subeval / s / objeval / zfun ─────────────────────

register("u",       async (a, ctx) => callAttr(a[0] ?? "", a.slice(1), ctx, false));
register("ulocal",  async (a, ctx) => callAttr(a[0] ?? "", a.slice(1), ctx, true));
register("eval",    async (a, ctx) => {
  const code = a[0] ?? "";
  const ast  = safeParse(code);
  return ast ? await evaluate(ast as Parameters<typeof evaluate>[0], ctx) : code;
});
register("subeval", async (a, ctx) => {
  const code = a[0] ?? "";
  const ast  = safeParse(code);
  return ast ? await evaluate(ast as Parameters<typeof evaluate>[0], ctx) : code;
});
// s() is the TinyMUX alias for eval/subeval — overrides the logic.ts stub.
register("s", async (a, ctx) => {
  const code = a[0] ?? "";
  const ast  = safeParse(code);
  return ast ? await evaluate(ast as Parameters<typeof evaluate>[0], ctx) : code;
});
register("objeval", async (a, ctx) => {
  const obj  = await resolveObj(a[0] ?? "me", ctx);
  const code = a[1] ?? "";
  if (!obj) return "#-1 NOT FOUND";
  const ast    = safeParse(code);
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
