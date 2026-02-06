import { IUrsamuSDK, IDBObj as _IDBObj } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: look.ts
 * ESM Refactored, Production-ready, and Telnet-compatible.
 */
export default (u: IUrsamuSDK) => {
  const actor = u.me;
  const target = u.target || u.here;

  if (!target) {
    u.send("I can't find that here.");
    return;
  }

  // Blindness check
  if (actor.flags.has("blind")) {
    u.send("You can't see anything!");
    return;
  }

  const canEditTarget = u.canEdit(actor, target);
  const isOpaque = target.flags.has('opaque');
  const showContents = !isOpaque || canEditTarget;

  // Build Output Data
  const description = (target.state.description as string) || "You see nothing special.";

  const characters = (target.contents || []).filter(obj => 
    obj.flags.has('player') && obj.flags.has('connected') && obj.id !== actor.id
  );

  const objects = (target.contents || []).filter(obj => 
    !obj.flags.has('player') && !obj.flags.has('exit') && !obj.flags.has('room')
  );

  const exits = (target.contents || []).filter(obj => obj.flags.has('exit'));

  // Phase 1: Telnet Output (ANSI Text)
  let telnetOutput = `%ch${u.util.displayName(target, actor)}%cn\n`;
  telnetOutput += `${description}\n`;

  if (showContents) {
    if (characters.length > 0) {
      telnetOutput += "\n%chCharacters:%cn\n";
      characters.forEach(c => {
        telnetOutput += `  ${u.util.displayName(c, actor)}\n`;
      });
    }

    if (objects.length > 0) {
      telnetOutput += "\n%chContents:%cn\n";
      objects.forEach(o => {
        telnetOutput += `  ${u.util.displayName(o, actor)}\n`;
      });
    }
  }

  if (exits.length > 0) {
    telnetOutput += "\n%chExits:%cn\n";
    const exitNames = exits.map(e => ((e.state.name as string) || e.name || "").split(';')[0]);
    telnetOutput += `  ${exitNames.join("  ")}\n`;
  }

  // Send telnet output
  u.send(telnetOutput);

  // Phase 2: Web UI Output (Structured JSON)
  const components: unknown[] = [];

  // Header
  components.push(u.ui.panel({
    type: "header",
    content: u.util.displayName(target, actor),
    style: "bold centered"
  }));

  // Body
  components.push(u.ui.panel({
    type: "panel",
    content: description
  }));

  if (showContents) {
    if (characters.length > 0) {
      components.push(u.ui.panel({
        type: "list",
        title: "Characters",
        content: characters.map(c => ({
          name: u.util.displayName(c, actor),
          desc: (c.state.shortdesc as string) || ""
        }))
      }));
    }

    if (objects.length > 0) {
      components.push(u.ui.panel({
        type: "grid",
        title: "Contents",
        content: objects.map(o => ({
          name: o.name,
          id: o.id
        }))
      }));
    }
  }

  if (exits.length > 0) {
    components.push(u.ui.panel({
      type: "grid",
      title: "Exits",
      content: exits.map(e => {
        const parts = ((e.state.name as string) || e.name || "").split(';');
        return { name: parts[0], alias: parts[1] || parts[0] };
      })
    }));
  }

  const mapData = u.util.getMapData ? u.util.getMapData(target.id, 2) : null;

  u.ui.layout({
    components,
    meta: {
      targetId: target.id,
      type: "look",
      map: mapData
    }
  });
};
