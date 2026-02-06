import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: score.ts
 * ESM Refactored, Production-ready, and Telnet-compatible.
 */
export default (u: IUrsamuSDK) => {
  const me = u.me;
  const name = (me.state.moniker as string) || (me.state.name as string) || me.name;

  // 1. Telnet Output
  let telnet = `%chPlayer Scorecard: ${name}%cn\n`;
  telnet += `DBRef: #${me.id}  Flags: ${Array.from(me.flags).join(" ")}\n`;
  telnet += `Doing: ${(me.state.doing as string) || "Nothing."}\n`;
  telnet += `Money: ${(me.state.money as number) || 0} credits\n`;
  u.send(telnet);

  // 2. Web UI
  u.ui.layout({
    components: [
      u.ui.panel({ type: "header", content: "Scorecard", style: "bold" }),
      u.ui.panel({ type: "list", content: [
        { label: "Name", value: name },
        { label: "Money", value: String((me.state.money as number) || 0) },
        { label: "Doing", value: (me.state.doing as string) || "None" }
      ]})
    ],
    meta: { type: "score" }
  });
};
