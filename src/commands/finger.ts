import {
  addCmd,
  capString,
  footer,
  getAttribute,
  header,
  Obj,
  send,
  target,
} from "../index.ts";

export default () => {
  addCmd({
    name: "finger",
    pattern: /^[\+@]?finger\s+(.*)/i,
    lock: "connected",
    exec: async (ctx, args) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;

      const tar = await target(en, args[0]);
      if (!tar) return send([ctx.socket.id], "No such entity.");

      const keyNames = [
        "e-mail",
        "position",
        "fullname",
        "age",
        "fame",
        "app_age",
        "plan",
        "rp-prefs",
        "alts",
        "themesong",
        "quote",
        "off-hours",
        "temperment",
        "vacation",
        "url",
      ];

      const keys: { [key: string]: string } = {};

      const fingerFields = Object.keys(keys).filter((key) =>
        keys[key] !== undefined
      );

      let output = header(`Finger info for: ${en.name}`) + "\n";
      output += "%chAlias:%cn " + (en.alias || "") + "\n";
      keyNames.forEach((key) => {
        const attr = getAttribute(tar, key);
        if (attr) {
          output += ("%ch" + capString(key) + "%cn:").padEnd(15) + attr.value +
            "\n";
        }
      });

      Object.values(tar.attributes).filter((attr) =>
        attr.key?.startsWith("finger-")
      ).forEach((attr) => {
        output += ("%ch" + capString(attr.key?.slice(7) || "") +
          "%cn:").padEnd(15) + attr.value + "\n";
      });

      output += footer();

      await send([ctx.socket.id], output);
    },
  });
};
