// commands/npc.ts -- spawn/despawn/list/info/act for Wyrm NPCs.
//
// Staff-only spawn/despawn. /list and /info are open. /act is staff
// for manual AI turn invocation; the init-loop calls runNpcTurn
// directly when an NPC's slot comes up.

import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  allNpcTemplates,
  getNpcTemplate,
  templatesByKind,
  type NpcKind,
} from "../splats/wta/data/wyrmNpcs.ts";
import { findByPlayer } from "../db/charDb.ts";
import { spawnNpc, despawnNpc, runNpcTurn, npcsInRoom } from "../core/npc.ts";
import { divider, footer, header } from "../core/format.ts";

// deno-lint-ignore no-explicit-any
type AnyObj = any;

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

const KINDS: NpcKind[] = ["bane", "fomor", "bsd", "creature"];

addCmd({
  name: "+npc",
  pattern: /^\+npc(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Werewolf",
  help: `+npc[/switch] [<args>]  -- Wyrm bestiary, spawning, and AI.

SYNTAX
  +npc                       List the whole bestiary.
  +npc/list [<kind>]         Filter by kind: bane, fomor, bsd, creature.
  +npc/info <slug>           Show one template's full sheet.
  +npc/here                  List NPCs currently in this room.
  +npc/spawn <slug> [name]   (Staff) Spawn an NPC in this room.
  +npc/despawn <npc>         (Staff) Remove a spawned NPC.
  +npc/act <npc>             (Staff) Run one AI turn for an NPC.

EXAMPLES
  +npc/list bane
  +npc/info bsd-ahroun
  +npc/spawn bane-shade Sliver of the Pit
  +npc/act Sliver of the Pit

SEE ALSO: +help spirit, +help attack, +help init`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    // -- /list (or no switch) ------------------------------------------
    if (!sw || sw === "list") {
      const filter = arg.toLowerCase() as NpcKind;
      if (arg && !KINDS.includes(filter)) {
        u.send(`Unknown kind. Use one of: ${KINDS.join(", ")}.`);
        return;
      }
      const xs = arg ? templatesByKind(filter) : allNpcTemplates();
      const lines: string[] = [
        header(arg ? `Bestiary -- ${arg}` : "Wyrm Bestiary"),
      ];
      let lastKind: string | null = null;
      for (const t of xs) {
        if (!arg && t.kind !== lastKind) {
          lines.push(divider(t.kind));
          lastKind = t.kind;
        }
        lines.push(`  %ch${t.name.padEnd(28)}%cn  %cw[${t.slug}]%cn  Threat ${t.threat}`);
      }
      lines.push(footer());
      u.send(lines.join("%r"));
      return;
    }

    if (sw === "info") {
      if (!arg) { u.send("Usage: +npc/info <slug>"); return; }
      const t = getNpcTemplate(arg);
      if (!t) { u.send(`Unknown template: ${arg}`); return; }
      const lines: string[] = [
        header(`Bestiary: ${t.name}`),
        `  Slug:     ${t.slug}`,
        `  Kind:     ${t.kind}`,
        `  Threat:   ${t.threat} / 5`,
        `  Combat:   ${t.combatModel ?? "physical"}` +
          (t.combatModel === "spirit"
            ? "  (rolls Rage vs target Willpower; canon W20 spirit)"
            : ""),
        divider("Stats"),
        ...((t.combatModel ?? "physical") === "spirit"
          ? [
              `  Rage ${t.rage}   Gnosis ${t.gnosis ?? "-"}   Willpower ${t.willpower}`,
              `  Power ${t.healthMax ?? 7}  (Garou-shape attrs derived for hit-resolution)`,
            ]
          : [
              `  Str ${t.attributes.Strength}  Dex ${t.attributes.Dexterity}  Sta ${t.attributes.Stamina}`,
              `  Per ${t.attributes.Perception}  Wits ${t.attributes.Wits}`,
              `  Willpower ${t.willpower}   Rage ${t.rage}` + (t.gnosis ? `   Gnosis ${t.gnosis}` : ""),
              `  Health max ${t.healthMax ?? 7}` + (t.aggSoak ? `, Agg soak +${t.aggSoak}` : ""),
            ]),
        divider("Attack"),
        `  ${t.attack.mode} (${t.attack.damageType})  +${t.attack.bonus} dice`,
        divider("Flavor"),
        `  ${t.description}`,
      ];
      if (t.specialAbilities?.length) {
        lines.push(divider("Special"));
        for (const s of t.specialAbilities) lines.push(`  - ${s}`);
      }
      lines.push(footer());
      u.send(lines.join("%r"));
      return;
    }

    if (sw === "here") {
      const present = npcsInRoom(u.here);
      const lines: string[] = [header("NPCs in this room")];
      if (present.length === 0) {
        lines.push("  (none)");
      } else {
        for (const obj of present) {
          const c = await findByPlayer(obj.id);
          const k = c?.npcKind ?? "?";
          lines.push(`  %ch${(obj.name as string).padEnd(28)}%cn  [${k}]`);
        }
      }
      lines.push(footer());
      u.send(lines.join("%r"));
      return;
    }

    // -- staff-gated below ---------------------------------------------
    if (sw === "spawn") {
      if (!isStaff(u)) { u.send("Permission denied."); return; }
      if (!arg) { u.send("Usage: +npc/spawn <slug> [name]"); return; }
      // First token = slug; rest = optional custom name.
      const sp = arg.indexOf(" ");
      const slug = (sp < 0 ? arg : arg.slice(0, sp)).trim().toLowerCase();
      const name = sp < 0 ? undefined : arg.slice(sp + 1).trim();
      const result = await spawnNpc(u, slug, name);
      if (!result) { u.send(`Unknown template: ${slug}`); return; }
      const t = getNpcTemplate(slug)!;
      u.send(`%cgSpawned %ch${name ?? t.name}%cn%cg (${slug}) -- id ${result.npcId}.%cn`);
      return;
    }

    if (sw === "despawn") {
      if (!isStaff(u)) { u.send("Permission denied."); return; }
      if (!arg) { u.send("Usage: +npc/despawn <npc>"); return; }
      const tgt = await u.util.target(u.me, arg, true);
      if (!tgt || !(tgt as AnyObj)?.flags?.has?.("npc")) {
        u.send(`No NPC found matching "${arg}".`);
        return;
      }
      const removed = await despawnNpc(u, tgt.id);
      u.send(removed ? `%cyDespawned ${arg}.%cn` : `Failed to remove ${arg}.`);
      return;
    }

    if (sw === "act") {
      if (!isStaff(u)) { u.send("Permission denied."); return; }
      if (!arg) { u.send("Usage: +npc/act <npc>"); return; }
      const tgt = await u.util.target(u.me, arg, true);
      if (!tgt || !(tgt as AnyObj)?.flags?.has?.("npc")) {
        u.send(`No NPC found matching "${arg}".`);
        return;
      }
      const char = await findByPlayer(tgt.id);
      if (!char) { u.send(`NPC has no char record.`); return; }
      const summary = await runNpcTurn(u, char);
      // The pose is already broadcast to the room by runNpcTurn; the
      // /act caller just gets a one-line confirmation.
      u.send(`%cy${arg}: ${summary.engaged} engagement${summary.engaged === 1 ? "" : "s"} resolved.%cn`);
      return;
    }

    u.send(`Unknown switch: /${sw}. See +help npc.`);
  },
});
