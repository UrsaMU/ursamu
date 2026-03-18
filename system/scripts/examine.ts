import { IUrsamuSDK, IDBObj as _IDBObj } from "../../src/@types/UrsamuSDK.ts";

// Keys handled explicitly — excluded from the generic attributes block.
const SYSTEM_KEYS = new Set([
  'name', 'moniker', 'alias', 'owner', 'lock', 'description',
  'flags', 'id', 'location', 'home', 'password', 'channels',
]);

// Keys that contain sensitive data — never displayed.
const HIDDEN_KEYS = new Set(['password']);

export default async (u: IUrsamuSDK) => {
  const actor  = u.me;
  const targetName = u.cmd.args.join(" ").trim() || "me";
  const target = (await u.db.search(targetName))[0];

  if (!target) {
    u.send(`I can't find "${targetName}" here.`);
    return;
  }

  if (!(await u.canEdit(actor, target)) && !target.flags.has("visual")) {
    u.send("You can't examine that.");
    return;
  }

  // ── Home + Location: resolve id → name ───────────────────────────────────
  let homeLine = "None";
  const homeId = target.state.home as string | undefined;
  if (homeId) {
    const homeObj = (await u.db.search(homeId))[0];
    homeLine = homeObj ? `${homeObj.name} (#${homeId})` : `#${homeId}`;
  }

  let locationLine = "Limbo";
  const locationId = target.location;
  if (locationId) {
    const locationObj = (await u.db.search(locationId))[0];
    locationLine = locationObj ? `${locationObj.name} (#${locationId})` : `#${locationId}`;
  }

  // ── Channels: format list ─────────────────────────────────────────────────
  type ChanEntry = { channel: string; alias: string; active: boolean };
  const rawChans = target.state.channels;
  let chansLine = "None";
  if (Array.isArray(rawChans) && rawChans.length > 0) {
    chansLine = (rawChans as ChanEntry[])
      .map(c => `${c.channel}(${c.alias})${c.active ? "" : " [off]"}`)
      .join(", ");
  }

  // ── Generic attributes (excluding system + hidden keys) ───────────────────
  const attributes = Object.entries(target.state).filter(
    ([key]) => !SYSTEM_KEYS.has(key.toLowerCase()) && !HIDDEN_KEYS.has(key.toLowerCase()),
  );

  // ── Telnet output ─────────────────────────────────────────────────────────
  let telnet = `%ch${target.name} (#${target.id})%cn\n`;
  telnet += `%chFlags:%cn ${Array.from(target.flags).join(" ")}\n`;
  telnet += `%chOwner:%cn ${(target.state.owner as string) || "None"}\n`;
  telnet += `%chLock:%cn ${(target.state.lock as string) || "None"}\n`;
  telnet += `%chLocation:%cn ${locationLine}\n`;
  telnet += `%chHome:%cn ${homeLine}\n`;
  telnet += `%chChannels:%cn ${chansLine}\n`;
  telnet += `\n%chDescription:%cn\n${(target.state.description as string) || "No description."}\n`;

  if (attributes.length > 0) {
    telnet += "\n%chAttributes:%cn\n";
    attributes.forEach(([k, v]) => {
      telnet += `  %ch${k.toUpperCase()}:%cn ${String(v)}\n`;
    });
  }

  const characters = (target.contents || []).filter(o => o.flags.has('player'));
  if (characters.length > 0) {
    telnet += `\n%chCharacters:%cn ${characters.map(c => u.util.displayName(c, actor)).join(", ")}\n`;
  }

  u.send(telnet);

  // ── Web UI ────────────────────────────────────────────────────────────────
  const components: unknown[] = [];
  components.push(u.ui.panel({ type: "header", content: `${target.name} [#${target.id}]`, style: "bold" }));
  components.push(u.ui.panel({ type: "list", title: "Metadata", content: [
    { label: "Flags",    value: Array.from(target.flags).join(" ") },
    { label: "Owner",    value: (target.state.owner as string) || "None" },
    { label: "Location", value: (target.state.location as string) || "Limbo" },
    { label: "Home",     value: homeLine },
    { label: "Channels", value: chansLine },
  ]}));
  components.push(u.ui.panel({ type: "panel", title: "Description", content: (target.state.description as string) || "None" }));

  if (attributes.length > 0) {
    components.push(u.ui.panel({
      type: "grid", title: "Attributes",
      content: attributes.map(([k, v]) => ({ label: k.toUpperCase(), value: String(v) })),
    }));
  }

  u.ui.layout({ components, meta: { type: "examine", targetId: target.id } });
};
