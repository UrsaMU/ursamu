import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

export const aliases = ["@sweep"];

/**
 * System Script: sweep.ts
 * Lists all objects in the current room that have reactive attributes.
 * Reactive attributes: LISTEN, AHEAR, ACONNECT, ADISCONNECT, STARTUP
 * Usage: @sweep
 */
const REACTIVE_ATTRS = ["LISTEN", "AHEAR", "ACONNECT", "ADISCONNECT", "STARTUP"];

export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  const f = Array.from(actor.flags).join(" ").toLowerCase();
  if (!f.includes("wizard") && !f.includes("admin") && !f.includes("superuser")) {
    u.send("Permission denied.");
    return;
  }
  const roomId = u.here.id;

  const contents = await u.db.search({ location: roomId });

  const reactive: string[] = [];

  for (const obj of contents) {
    if (obj.id === actor.id) continue;

    const attrs = obj.state?.attributes as Array<{ name: string }> | undefined;
    if (!attrs || !Array.isArray(attrs)) continue;

    const found = REACTIVE_ATTRS.filter((rAttr) =>
      attrs.some((a) => a.name === rAttr)
    );

    if (found.length > 0) {
      const displayName = obj.name || obj.id;
      reactive.push(`  ${displayName} [${found.join(", ")}]`);
    }
  }

  if (reactive.length === 0) {
    u.send("No reactive objects in this room.");
    return;
  }

  u.send("%chReactive objects in this room:%cn");
  for (const line of reactive) {
    u.send(line);
  }
};
