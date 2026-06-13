import type { IUrsamuSDK } from "jsr:@ursamu/ursamu";

export const aliases = ["ex"];

// Keys displayed explicitly — excluded from the generic attributes block.
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

/**
 * @examine [<target>]
 *
 * Shows detailed information about an object, including flags, owner, lock,
 * location, home, description, exits, contents, and attributes.
 * Defaults to the current room if no target is given.
 *
 * Examples:
 *   @examine
 *   @examine widget
 *   @ex #5
 */
export default async (u: IUrsamuSDK) => {
  const actor      = u.me;
  const targetName = (u.cmd.args[0] || "").trim();
  const target     = targetName ? await u.util.target(u.me, targetName, true) : u.here;

  if (!target) { u.send(`I can't find "${targetName}" here.`); return; }
  if (!(await u.canEdit(actor, target)) && !target.flags.has("visual")) {
    u.send("You can't examine that.");
    return;
  }

  const type = objectType(target.flags);

  // Resolve owner
  let ownerLine = "None";
  const ownerId = target.state.owner as string | undefined;
  if (ownerId) {
    const ownerObj = await u.util.target(u.me, ownerId, true);
    ownerLine = ownerObj ? `${u.util.displayName(ownerObj, actor)} (#${ownerId})` : `#${ownerId}`;
  }

  // Resolve home
  let homeLine = "None";
  const homeId = target.state.home as string | undefined;
  if (homeId) {
    const homeObj = await u.util.target(u.me, homeId, true);
    homeLine = homeObj ? `${homeObj.name} (#${homeId})` : `#${homeId}`;
  }

  // Resolve location
  let locationLine = "Limbo";
  const locationId = target.location;
  if (locationId) {
    const locationObj = await u.util.target(u.me, locationId, true);
    locationLine = locationObj ? `${locationObj.name} (#${locationId})` : `#${locationId}`;
  }

  // Contents split by type
  const contents   = target.contents || [];
  const characters = contents.filter(o => o.flags.has("player"));
  const exits      = contents.filter(o => o.flags.has("exit"));
  const things     = contents.filter(o => !o.flags.has("player") && !o.flags.has("exit"));

  // Channels — graceful degrade when channels plugin not loaded
  type ChanEntry = { channel: string; alias: string; active: boolean };
  const rawChans = target.state.channels;
  let chansLine = "None";
  if (Array.isArray(rawChans) && rawChans.length > 0) {
    chansLine = (rawChans as ChanEntry[])
      .map(c => `${c.channel}(${c.alias})${c.active ? "" : " [off]"}`)
      .join(", ");
  }

  // Generic attributes (excluding system + hidden keys)
  const attributes = Object.entries(target.state).filter(
    ([key]) => !SYSTEM_KEYS.has(key.toLowerCase()) && !HIDDEN_KEYS.has(key.toLowerCase()),
  );

  // Telnet output
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
    exits.forEach(e => { out += `  %ch${e.name}%cn (#${e.id})\n`; });
  }
  if (things.length > 0) {
    out += `\n%chContents:%cn\n`;
    things.forEach(t => { out += `  ${u.util.displayName(t, actor)} (#${t.id})\n`; });
  }
  if (characters.length > 0) {
    out += `\n%chCharacters:%cn\n`;
    characters.forEach(c => { out += `  ${u.util.displayName(c, actor)} (#${c.id})\n`; });
  }
  if (attributes.length > 0) {
    out += `\n%chAttributes:%cn\n`;
    attributes.forEach(([k, v]) => {
      let display: string;
      if (v === null || v === undefined) {
        display = "(not set)";
      } else if (Array.isArray(v)) {
        display = v.map(item => typeof item === "object" ? JSON.stringify(item) : String(item)).join(", ");
      } else if (typeof v === "object") {
        display = Object.entries(v as Record<string, unknown>).map(([sk, sv]) => `${sk}: ${sv}`).join(", ");
      } else {
        display = String(v);
      }
      out += `  %ch${k.toUpperCase()}:%cn ${display}\n`;
    });
  }
  u.send(out);

  // Web UI
  const components: unknown[] = [];
  components.push(u.ui.panel({ type: "header", content: `${target.name} [#${target.id}] — ${type}`, style: "bold" }));
  components.push(u.ui.panel({ type: "list", title: "Metadata", content: [
    { label: "Type",     value: type },
    { label: "Flags",    value: Array.from(target.flags).join(" ") || "None" },
    { label: "Owner",    value: ownerLine },
    { label: "Lock",     value: (target.state.lock as string) || "None" },
    { label: "Location", value: locationLine },
    { label: "Home",     value: homeLine },
    ...(type === "Player" ? [{ label: "Channels", value: chansLine }] : []),
  ]}));
  components.push(u.ui.panel({ type: "panel", title: "Description", content: (target.state.description as string) || "None" }));
  if (exits.length > 0) {
    components.push(u.ui.panel({ type: "list", title: "Exits", content: exits.map(e => ({ label: e.name, value: `#${e.id}` })) }));
  }
  if (attributes.length > 0) {
    components.push(u.ui.panel({ type: "grid", title: "Attributes", content: attributes.map(([k, v]) => ({ label: k.toUpperCase(), value: String(v) })) }));
  }
  u.ui.layout({ components, meta: { type: "examine", targetId: target.id } });
};
