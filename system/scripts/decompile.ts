import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * @decompile[/tf] <object>[=<prefix>]
 *
 * Dumps an object's name, flags, and attributes as copyable @set / &ATTR lines.
 * With /tf: outputs in TinyFugue-compatible format (each line prefixed with /quote).
 * With =<prefix>: uses <prefix> instead of #dbref in output lines.
 *
 * Requires ownership or admin.
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  const switches = u.cmd.switches || [];
  const tf = switches.includes("tf");

  const raw = (u.cmd.args[0] || "").trim();
  if (!raw) { u.send("Usage: @decompile[/tf] <object>[=<prefix>]"); return; }

  const eqIdx = raw.indexOf("=");
  const objRef = eqIdx === -1 ? raw : raw.slice(0, eqIdx).trim();
  const prefix  = eqIdx === -1 ? null : raw.slice(eqIdx + 1).trim();

  // Resolve target — self, here, or search
  let target = actor;
  if (objRef === "me") {
    target = actor;
  } else if (objRef === "here") {
    target = u.here;
  } else {
    const results = await u.db.search(objRef);
    const found = results[0];
    if (!found) { u.send(`I can't find "${objRef}".`); return; }
    target = found;
  }

  const canEdit = await u.canEdit(actor, target);
  if (!canEdit) { u.send("Permission denied."); return; }

  const ref  = prefix || target.id;
  const name = (target.state.name as string) || target.name || target.id;

  // Collect output lines
  const lines: string[] = [];

  // Name
  lines.push(`@name ${ref}=${name}`);

  // Flags (skip internal ones)
  const skipFlags = new Set(["connected", "dark"]);
  const flagList = [...target.flags].filter(f => !skipFlags.has(f)).join(" ");
  if (flagList) lines.push(`@set ${ref}=${flagList}`);

  // Description
  const desc = target.state.description as string | undefined;
  if (desc) lines.push(`@describe ${ref}=${desc}`);

  // Custom attributes
  const attrs = (target.state.attributes as Array<{ name: string; value: string; hidden?: boolean }> | undefined) || [];
  for (const attr of attrs) {
    if (attr.hidden) continue;
    lines.push(`&${attr.name.toUpperCase()} ${ref}=${attr.value}`);
  }

  // Format and send
  const wrap = tf ? (l: string) => `/quote ${l}` : (l: string) => l;
  u.send(`--- Decompile of ${name} (${target.id}) ---`);
  for (const line of lines) u.send(wrap(line));
  u.send("--- End ---");
};
