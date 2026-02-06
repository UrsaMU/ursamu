import { IUrsamuSDK, IDBObj as _IDBObj } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: set.ts
 * ESM Refactored, Production-ready, and Telnet-compatible.
 */
export default async (u: IUrsamuSDK) => {
  const input = u.cmd.args.join(" ").trim();
  const match = input.match(/^(.+?)\/(.+?)=(.*)$/);

  if (!match) {
    u.send("Usage: @set <target>/<attribute>=[value]");
    return;
  }

  const targetName = match[1].trim();
  const attribute = match[2].trim().toUpperCase();
  const value = match[3].trim();

  if (!/^[A-Z0-9_]+$/.test(attribute)) {
    u.send("Invalid attribute name.");
    return;
  }

  const target = (await u.db.search(targetName))[0];
  if (!target) {
    u.send(`I can't find "${targetName}" here.`);
    return;
  }

  if (!u.canEdit(u.me, target)) {
    u.send("Permission denied.");
    return;
  }

  let resultMsg = "";
  if (value === "") {
    if (['id', 'name', 'flags', 'location'].includes(attribute.toLowerCase())) {
       u.send("Cannot delete internal system properties.");
       return;
    }
    delete target.state[attribute];
    resultMsg = `Attribute ${attribute} cleared on ${target.name}.`;
  } else {
    if (value.length > 4096) {
      u.send("Value too long.");
      return;
    }
    target.state[attribute] = value;
    resultMsg = `Set - ${target.name}/${attribute}: ${value}`;
  }

  // ANSI Output
  u.send(resultMsg);

  // Web Result
  u.ui.layout({
    components: [],
    meta: {
      type: "set",
      targetId: target.id,
      attribute,
      value: value || null,
      message: resultMsg
    }
  });
};
