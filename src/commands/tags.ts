import { addCmd } from "../services/commands/cmdParser.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";
import { playerTags, serverTags } from "../services/Database/index.ts";

const MAX_TAGS = 50;

export default () => {
  // @ltag — personal object tags
  addCmd({
    name: "@ltag",
    pattern: /^@?ltag(?:\/(remove|list))?\s*(.*)?$/i,
    lock: "connected",
    category: "Building",
    help: `@ltag <tagname>=<object>   — Set a personal tag for an object.
@ltag <tagname>            — Show what a personal tag points to.
@ltag/list                 — List all your personal tags.
@ltag/remove <tagname>     — Remove a personal tag.

Tag names: letters, numbers, hyphens, underscores only.
Maximum 50 personal tags. Use #tagname in softcode to reference.

Examples:
  @ltag home=here
  @ltag/list
  @ltag/remove home`,
    exec: async (u: IUrsamuSDK) => {
      const sw  = (u.cmd.args[0] || "").toLowerCase().trim();
      const arg = (u.cmd.args[1] || "").trim();
      const ltagId = (name: string) => `${u.me.id}:${name}`;

      if (sw === "list" || (!arg && sw === "")) {
        const myTags = await playerTags.find({ ownerId: u.me.id });
        if (!myTags.length) { u.send("You have no personal tags set."); return; }
        const lines = myTags.map((t) => `  %ch${t.name}%cn → #${t.objectId}`).join("%r");
        u.send(`Your personal tags:%r${lines}`);
        return;
      }

      if (sw === "remove") {
        if (!arg) { u.send("Usage: @ltag/remove <tagname>"); return; }
        const name = arg.toLowerCase();
        const existing = await playerTags.queryOne({ id: ltagId(name) });
        if (!existing) { u.send(`You have no personal tag named '${name}'.`); return; }
        await playerTags.delete({ id: ltagId(name) });
        u.send(`Personal tag '${name}' removed.`);
        return;
      }

      if (!arg) { u.send("Usage: @ltag[/remove|/list] <tagname>[=<object>]"); return; }

      const eqIdx = arg.indexOf("=");
      if (eqIdx === -1) {
        const name = arg.toLowerCase();
        const existing = await playerTags.queryOne({ id: ltagId(name) });
        if (!existing) { u.send(`You have no personal tag named '${name}'.`); return; }
        const results = await u.db.search(existing.objectId);
        const obj = results[0];
        u.send(`Tag '${name}' → ${obj ? `${obj.name}(#${existing.objectId})` : `#${existing.objectId} (not found)`}`);
        return;
      }

      const tagName = arg.slice(0, eqIdx).trim().toLowerCase();
      const objRef  = arg.slice(eqIdx + 1).trim();

      if (!tagName || !/^[a-z0-9_-]+$/.test(tagName)) {
        u.send("Tag names may only contain letters, numbers, hyphens, and underscores.");
        return;
      }
      if (!objRef) { u.send("Usage: @ltag <tagname>=<object>"); return; }

      const results = await u.db.search(objRef);
      const target = results[0];
      if (!target) { u.send(`I can't find '${objRef}'.`); return; }

      const existing = await playerTags.queryOne({ id: ltagId(tagName) });
      if (!existing) {
        const myTags = await playerTags.find({ ownerId: u.me.id });
        if (myTags.length >= MAX_TAGS) {
          u.send(`You have reached the maximum of ${MAX_TAGS} personal tags.`);
          return;
        }
        await playerTags.create({
          id: ltagId(tagName), name: tagName, ownerId: u.me.id,
          objectId: target.id, createdAt: Date.now(),
        });
        u.send(`Personal tag '${tagName}' set → ${target.name}(#${target.id}).`);
      } else {
        await playerTags.update({ id: ltagId(tagName) }, { ...existing, objectId: target.id });
        u.send(`Personal tag '${tagName}' updated → ${target.name}(#${target.id}).`);
      }
    },
  });

  // @tag — global server tags (wizard+)
  addCmd({
    name: "@tag",
    pattern: /^@?tag(?:\/(remove))?\s*(.*)?$/i,
    lock: "connected admin+",
    category: "Building",
    help: `@tag <tagname>=<object>  — Set a global server tag (admin+).
@tag <tagname>           — Show what a tag points to.
@tag/remove <tagname>    — Remove a global tag.

Use #tagname in softcode to reference globally.

Examples:
  @tag citygate=here
  @tag vault=#142
  @tag/remove citygate`,
    exec: async (u: IUrsamuSDK) => {
      const sw  = (u.cmd.args[0] || "").toLowerCase().trim();
      const arg = (u.cmd.args[1] || "").trim();

      if (sw === "remove") {
        if (!arg) { u.send("Usage: @tag/remove <tagname>"); return; }
        const name = arg.toLowerCase();
        const existing = await serverTags.queryOne({ id: name });
        if (!existing) { u.send(`No tag named '${name}' exists.`); return; }
        await serverTags.delete({ id: name });
        u.send(`Tag '${name}' removed.`);
        return;
      }

      if (!arg) { u.send("Usage: @tag[/remove] <tagname>[=<object>]"); return; }

      const eqIdx = arg.indexOf("=");
      if (eqIdx === -1) {
        const name = arg.toLowerCase();
        const existing = await serverTags.queryOne({ id: name });
        if (!existing) { u.send(`No tag named '${name}' is set.`); return; }
        const results = await u.db.search(existing.objectId);
        const obj = results[0];
        u.send(`Tag '${name}' → ${obj ? `${obj.name}(#${existing.objectId})` : `#${existing.objectId} (not found)`}`);
        return;
      }

      const tagName = arg.slice(0, eqIdx).trim().toLowerCase();
      const objRef  = arg.slice(eqIdx + 1).trim();

      if (!tagName || !/^[a-z0-9_-]+$/.test(tagName)) {
        u.send("Tag names may only contain letters, numbers, hyphens, and underscores.");
        return;
      }
      if (!objRef) { u.send("Usage: @tag <tagname>=<object>"); return; }

      const results = await u.db.search(objRef);
      const target = results[0];
      if (!target) { u.send(`I can't find '${objRef}'.`); return; }

      const existing = await serverTags.queryOne({ id: tagName });
      if (existing) {
        await serverTags.update({ id: tagName }, { ...existing, objectId: target.id, setterId: u.me.id });
        u.send(`Tag '${tagName}' updated → ${target.name}(#${target.id}).`);
      } else {
        await serverTags.create({
          id: tagName, name: tagName, objectId: target.id,
          setterId: u.me.id, createdAt: Date.now(),
        });
        u.send(`Tag '${tagName}' set → ${target.name}(#${target.id}).`);
      }
    },
  });
};
