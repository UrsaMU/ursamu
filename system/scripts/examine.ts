import { IUrsamuSDK, IDBObj as _IDBObj } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: examine.ts
 * ESM Refactored, Production-ready, and Telnet-compatible.
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  const targetName = u.cmd.args.join(" ").trim() || "me";
  const target = (await u.db.search(targetName))[0];

  if (!target) {
    u.send(`I can't find "${targetName}" here.`);
    return;
  }

  if (!u.canEdit(actor, target) && !target.flags.has("visual")) {
    u.send("You can't examine that.");
    return;
  }

  // 1. Build Telnet Text
  let telnet = `%ch${target.name} (#${target.id})%cn\n`;
  telnet += `Flags: ${Array.from(target.flags).join(" ")}\n`;
  telnet += `Owner: ${(target.state.owner as string) || "None"}  Lock: ${(target.state.lock as string) || "None"}\n`;
  telnet += `Location: ${(target.state.location as string) || "Limbo"}\n`;
  telnet += `\n%chDescription:%cn\n${(target.state.description as string) || "No description."}\n`;

  const systemKeys = ['name', 'moniker', 'alias', 'owner', 'lock', 'description', 'flags', 'id', 'location'];
  const attributes = Object.entries(target.state).filter(([key]) => !systemKeys.includes(key.toLowerCase()));

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

  // 2. Build Web UI
  const components: unknown[] = [];
  components.push(u.ui.panel({ type: "header", content: `${target.name} [#${target.id}]`, style: "bold" }));
  components.push(u.ui.panel({ type: "list", title: "Metadata", content: [
    { label: "Flags", value: Array.from(target.flags).join(" ") },
    { label: "Owner", value: (target.state.owner as string) || "None" },
    { label: "Location", value: (target.state.location as string) || "Limbo" }
  ]}));
  components.push(u.ui.panel({ type: "panel", title: "Description", content: (target.state.description as string) || "None" }));

  if (attributes.length > 0) {
    components.push(u.ui.panel({ type: "grid", title: "Attributes", content: attributes.map(([k,v]) => ({ label: k.toUpperCase(), value: String(v) })) }));
  }

  u.ui.layout({ components, meta: { type: "examine", targetId: target.id } });
};
