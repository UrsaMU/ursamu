/** Staff approval — approve/reject branches of +chargen (admin+). */
import type { IUrsamuSDK } from "@ursamu/mush";
import { readChar, type ICinChar } from "../src/types.ts";

export function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") || u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

export async function handleStaff(
  u: IUrsamuSDK,
  sw: string,
  arg: string,
): Promise<void> {
  if (!isStaff(u)) {
    u.send("Permission denied.");
    return;
  }
  const [name, noteRaw] = arg.split("=");
  const target = await u.util.target(u.me, name.trim(), true);
  if (!target) {
    u.send("No such player.");
    return;
  }
  const c = readChar(target.state);
  if (c.status !== "submitted") {
    u.send("Character is not submitted.");
    return;
  }
  if (sw === "approve") {
    c.status = "approved";
    c.reviewedBy = u.me.name ?? "staff";
    const next: ICinChar = { ...c };
    await u.db.modify(target.id, "$set", {
      "state.cinematic": next,
    });
    u.send(`${target.name} approved.`);
    u.send("Your character has been %cgapproved%cn.", target.id);
    return;
  }
  const note = u.util.stripSubs(noteRaw ?? "").trim();
  c.status = "revision";
  c.reviewNote = note;
  await u.db.modify(target.id, "$set", {
    "state.cinematic": { ...c },
  });
  u.send(`${target.name} returned for revision.`);
  u.send(`Character returned: ${note || "see staff"}.`, target.id);
}
