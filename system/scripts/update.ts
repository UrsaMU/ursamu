import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

export const aliases = ["upgrade"];

/**
 * @update [<branch>]
 *
 * Pull the latest code from the git remote and reboot the server.
 * Optionally specify a branch; defaults to the current tracking branch.
 *
 * Examples:
 *   @update
 *   @update main
 *   @update feature/new-stuff
 */
export default async (u: IUrsamuSDK) => {
  if (
    !u.me.flags.has("admin") &&
    !u.me.flags.has("wizard") &&
    !u.me.flags.has("superuser")
  ) {
    u.send("Permission denied.");
    return;
  }

  const branch = (u.cmd.args[0] || "").trim();
  u.here.broadcast(
    `%chGame>%cn @update initiated by %ch${u.me.name}%cn — pulling latest code...`
  );
  await u.sys.update(branch);
};
