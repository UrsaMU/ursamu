import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * @bblist — list all bulletin boards with post and unread counts
 */
export default async (u: IUrsamuSDK) => {
  const boards = await u.bb.listBoards();

  if (!boards.length) {
    u.send("No bulletin boards have been created yet.");
    return;
  }

  const header = u.util.ljust("Board", 20) + u.util.rjust("Posts", 7) + u.util.rjust("New", 6);
  u.send("%ch%cy" + header + "%cn");
  u.send("%ch%cy" + "-".repeat(33) + "%cn");

  for (const b of boards as Array<{ id: string; name: string; description?: string; postCount: number; newCount: number }>) {
    const nameCol = u.util.ljust(b.name, 20);
    const postCol = u.util.rjust(String(b.postCount), 7);
    const newCol = b.newCount > 0 ? u.util.rjust(`%ch%cy${b.newCount}%cn`, 6) : u.util.rjust("0", 6);
    u.send(nameCol + postCol + newCol);
  }

  u.send('Use "@bbread <board>" to read posts.');
};
