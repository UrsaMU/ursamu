/**
 * @examine / @ex — detailed object inspection.
 */

import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK, IDBObj } from "@ursamu/mush";

const SYSTEM_KEYS = new Set([
  "name", "moniker", "alias", "owner", "lock", "description",
  "flags", "id", "location", "home", "password", "channels",
]);
const HIDDEN_KEYS = new Set(["password"]);

function objectType(flags: Set<string>): string {
  if (flags.has("room"))   return "Room";
  if (flags.has("player")) return "Player";
  if (flags.has("exit"))   return "Exit";
  return "Thing";
}

async function resolveRef(u: IUrsamuSDK, id: string | undefined): Promise<string> {
  if (!id) return "None";
  const obj = await u.util.target(u.me, id, true);
  return obj ? `${u.util.displayName(obj, u.me)} (#${id})` : `#${id}`;
}

function formatAttrValue(v: unknown): string {
  if (v === null || v === undefined) return "(not set)";
  if (Array.isArray(v)) return v.map((i) => typeof i === "object" ? JSON.stringify(i) : String(i)).join(", ");
  if (typeof v === "object") return Object.entries(v as Record<string, unknown>).map(([k, sv]) => `${k}: ${sv}`).join(", ");
  return String(v);
}

addCmd({
  name: "@examine",
  pattern: /^@?ex(?:amine)?\s*(.*)?$/i,
  lock: "connected",
  category: "Building",
  help: `@examine [<target>]  — Show detailed info about an object.
Defaults to the current room. Alias: @ex

EXAMPLES
  @examine
  @examine widget
  @ex #5`,
  exec: async (u: IUrsamuSDK) => {
    const targetName = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const target: IDBObj | null | undefined = targetName
      ? await u.util.target(u.me, targetName, true)
      : u.here;
    if (!target) { u.send(`I can't find "${targetName}" here.`); return; }
    if (!(await u.canEdit(u.me, target)) && !target.flags.has("visual")) {
      u.send("You can't examine that.");
      return;
    }
    const type       = objectType(target.flags);
    const ownerLine  = await resolveRef(u, target.state.owner as string | undefined);
    const homeLine   = await resolveRef(u, target.state.home as string | undefined);
    const locationId = target.location;
    const locationLine = locationId
      ? await resolveRef(u, locationId)
      : "Limbo";

    const contents   = target.contents ?? [];
    const characters = contents.filter((o) => o.flags.has("player"));
    const exits      = contents.filter((o) => o.flags.has("exit"));
    const things     = contents.filter((o) => !o.flags.has("player") && !o.flags.has("exit"));

    type ChanEntry = { channel: string; alias: string; active: boolean };
    const rawChans = target.state.channels;
    const chansLine = Array.isArray(rawChans) && rawChans.length > 0
      ? (rawChans as ChanEntry[]).map((c) => `${c.channel}(${c.alias})${c.active ? "" : " [off]"}`).join(", ")
      : "None";

    const attributes = Object.entries(target.state).filter(
      ([key]) => !SYSTEM_KEYS.has(key.toLowerCase()) && !HIDDEN_KEYS.has(key.toLowerCase()),
    );

    let out = `${u.util.center(`${target.name} (#${target.id}) [${type}]`, 78, "=")}%cn\n`;
    out += `%chFlags:%cn    ${Array.from(target.flags).join(" ") || "None"}\n`;
    out += `%chOwner:%cn    ${ownerLine}\n`;
    out += `%chLock:%cn     ${(target.state.lock as string) || "None"}\n`;
    out += `%chLocation:%cn ${locationLine}\n`;
    out += `%chHome:%cn     ${homeLine}\n`;
    if (type === "Player") out += `%chChannels:%cn ${chansLine}\n`;
    out += `\n%chDescription:%cn\n${(target.state.description as string) || "No description set."}\n`;
    if (exits.length > 0) {
      out += `\n%chExits:%cn\n`;
      exits.forEach((e) => { out += `  %ch${e.name}%cn (#${e.id})\n`; });
    }
    if (things.length > 0) {
      out += `\n%chContents:%cn\n`;
      things.forEach((t) => { out += `  ${u.util.displayName(t, u.me)} (#${t.id})\n`; });
    }
    if (characters.length > 0) {
      out += `\n%chCharacters:%cn\n`;
      characters.forEach((c) => { out += `  ${u.util.displayName(c, u.me)} (#${c.id})\n`; });
    }
    if (attributes.length > 0) {
      out += `\n%chAttributes:%cn\n`;
      attributes.forEach(([k, v]) => { out += `  %ch${k.toUpperCase()}:%cn ${formatAttrValue(v)}\n`; });
    }
    u.send(out);
  },
});
