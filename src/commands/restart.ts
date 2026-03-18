import { addCmd } from "../services/commands/index.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

export default () =>
  addCmd({
    name: "reboot",
    pattern: /^@reboot|^@restart/i,
    lock: "connected & admin+",
    exec: async (u: IUrsamuSDK) => {
      u.broadcast(`%chGame>%cn Server @reboot initiated by ${String(u.me.state.name || u.me.id)}...`);
      await u.sys.reboot();
    },
  });
