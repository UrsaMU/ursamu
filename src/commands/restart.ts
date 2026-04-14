import { addCmd } from "../services/commands/index.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

export async function execReboot(u: IUrsamuSDK): Promise<void> {
  const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
  if (!isAdmin) { u.send("Permission denied."); return; }
  u.here.broadcast(`%chGame>%cn Server @reboot initiated by ${String(u.me.state.name || u.me.id)}...`);
  await u.sys.reboot();
}

export default () =>
  addCmd({
    name: "reboot",
    pattern: /^@reboot|^@restart/i,
    lock: "connected & admin+",
    exec: execReboot,
  });
