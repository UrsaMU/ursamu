/**
 * +motd admin switches: set / del / reset.
 */
import type { IUrsamuSDK } from "../../commands/types.ts";
import { motdDb, type IMotdEntry } from "./motd-db.ts";

export type MotdScope = "general" | "wizard";

export function parseScope(s: string): MotdScope | null {
  const v = s.toLowerCase().trim();
  return v === "general" || v === "wizard" ? v : null;
}

export async function byScope(
  scope: MotdScope,
): Promise<IMotdEntry[]> {
  const all = await motdDb.find({ scope });
  return [...all].sort((a, b) => a.order - b.order);
}

async function nextOrder(scope: MotdScope): Promise<number> {
  const list = await byScope(scope);
  return list.length === 0 ? 1 : list[list.length - 1].order + 1;
}

export async function motdSet(
  u: IUrsamuSDK,
  arg: string,
): Promise<void> {
  const eq = arg.indexOf("=");
  if (eq === -1) {
    u.send("Usage: +motd/set <general|wizard>=<text>");
    return;
  }
  const scope = parseScope(arg.slice(0, eq));
  const text = u.util.stripSubs(arg.slice(eq + 1)).trim();
  if (!scope) {
    u.send("Scope must be 'general' or 'wizard'.");
    return;
  }
  if (!text) {
    u.send("Usage: +motd/set <general|wizard>=<text>");
    return;
  }
  await motdDb.create({
    id: crypto.randomUUID(),
    scope,
    order: await nextOrder(scope),
    text,
    setter: u.me.id,
    ts: Date.now(),
  });
  u.send(`Added entry to ${scope} MOTD.`);
}

export async function motdDel(
  u: IUrsamuSDK,
  arg: string,
): Promise<void> {
  const eq = arg.indexOf("=");
  if (eq === -1) {
    u.send("Usage: +motd/del <general|wizard>=<n>");
    return;
  }
  const scope = parseScope(arg.slice(0, eq));
  const n = parseInt(arg.slice(eq + 1).trim(), 10);
  if (!scope || isNaN(n) || n < 1) {
    u.send("Usage: +motd/del <general|wizard>=<n>");
    return;
  }
  const list = await byScope(scope);
  const hit = list.find((e) => e.order === n);
  if (!hit) {
    u.send(`No entry #${n} in ${scope} MOTD.`);
    return;
  }
  await motdDb.delete({ id: hit.id });
  u.send(`Removed entry #${n} from ${scope} MOTD.`);
}

export async function motdReset(
  u: IUrsamuSDK,
  arg: string,
): Promise<void> {
  const scope = parseScope(arg);
  if (!scope) {
    u.send("Usage: +motd/reset <general|wizard>");
    return;
  }
  const list = await byScope(scope);
  for (const e of list) await motdDb.delete({ id: e.id });
  const n = list.length;
  u.send(
    `Wiped ${n} entr${n === 1 ? "y" : "ies"} from ${scope}.`,
  );
}
