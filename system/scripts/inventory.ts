import { IUrsamuSDK, IDBObj as _IDBObj } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: inventory.ts
 * ESM Refactored, Production-ready, and Telnet-compatible.
 */
export default (u: IUrsamuSDK) => {
  const actor = u.me;
  const items = (actor.contents || []).filter(obj => !obj.flags.has('exit') && !obj.flags.has('room'));

  // 1. Telnet Output
  let telnet = `%ch${u.util.displayName(actor, actor)}'s Inventory%cn\n`;
  if (items.length === 0) {
    telnet += "You are not carrying anything.\n";
  } else {
    items.forEach(item => {
      telnet += `  ${u.util.displayName(item, actor)}\n`;
    });
  }
  u.send(telnet);

  // 2. Web UI
  const components: unknown[] = [];
  components.push(u.ui.panel({ type: "header", content: "Inventory", style: "bold centered" }));
  if (items.length === 0) {
    components.push(u.ui.panel({ content: "Empty." }));
  } else {
    components.push(u.ui.panel({ type: "list", content: items.map(i => ({ name: i.name, desc: (i.state.shortdesc as string) || "" })) }));
  }

  u.ui.layout({ components, meta: { type: "inventory", count: items.length } });
};
