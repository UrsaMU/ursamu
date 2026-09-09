// commands/init.ts -- +init combat initiative for the room.
//
// Persists state on u.here.state.initiative so every fighter in the room
// shares one ordered queue. Mechanics live in core/initiative.ts.
import { addCmd, gameHooks } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import "../hooks.ts";
import { findById, findByPlayer } from "../db/charDb.ts";
import { runNpcTurn } from "../core/npc.ts";
import { shiftedDisplayName } from "../core/displayName.ts";
import { poseRoom } from "../core/poseRoom.ts";
import { header, footer } from "../core/format.ts";
import {
  rollInitiative,
  insertEntry,
  nextTurn,
  removeEntry,
  type IInitState,
} from "../core/initiative.ts";

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

// deno-lint-ignore no-explicit-any
function readState(here: any): IInitState | undefined {
  const s = here?.state?.initiative;
  if (!s || typeof s !== "object") return undefined;
  if (!Array.isArray(s.order)) return undefined;
  return s as IInitState;
}

async function writeState(u: IUrsamuSDK, state: IInitState | null): Promise<void> {
  // deno-lint-ignore no-explicit-any
  const here = (u as any).here;
  if (!here?.id) return;
  if (state === null) {
    await u.db.modify(here.id, "$unset", { "state.initiative": "" });
    if (here.state) delete here.state.initiative;
    return;
  }
  await u.db.modify(here.id, "$set", { "state.initiative": state });
  here.state = { ...(here.state ?? {}), initiative: state };
}

function formatOrder(state: IInitState): string[] {
  const lines: string[] = [];
  for (let i = 0; i < state.order.length; i++) {
    const e = state.order[i];
    const marker = i === state.current ? "%cy>%cn " : "  ";
    const name = e.name.padEnd(12).slice(0, 12);
    const total = String(e.total).padStart(2);
    const tag = i === state.current ? "   %cy(current)%cn" : "";
    lines.push(
      `${marker}${name} Dex ${e.dex} + Wits ${e.wits} + d10 ${e.d10} + mod ${e.modifier} = ${total}${tag}`,
    );
  }
  return lines;
}

addCmd({
  name: "+init",
  pattern: /^\+init(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Combat",
  help: `+init[/switch] [<modifier>]  -- Combat initiative for the room.

SYNTAX
  +init [<mod>]      Roll initiative; add yourself to the order.
  +init/show         Show the current order and whose turn it is.
  +init/next         Advance to the next turn.
  +init/reroll [<mod>] Drop and re-roll yourself with a fresh d10.
  +init/drop         Leave combat (remove yourself from the order).
  +init/clear        Staff: end combat for the room.

EXAMPLES
  +init              Roll Dex + Wits + d10.
  +init 2            Same, +2 (e.g. ready firearm).
  +init/show         See the order.
  +init/next         Pass the turn.

SEE ALSO: +help attack, +help wod20th`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    // deno-lint-ignore no-explicit-any
    const here = (u as any).here;
    if (!here?.id) { u.send("You are nowhere -- no initiative here."); return; }

    // -- /show -------------------------------------------------------------
    if (sw === "show") {
      const state = readState(here);
      if (!state || state.order.length === 0) {
        u.send("No initiative in progress here.");
        return;
      }
      const lines: string[] = [
        header(`Initiative -- Round ${state.round}`),
        ...formatOrder(state),
        footer(),
      ];
      u.send(lines.join("%r"));
      return;
    }

    // -- /clear (staff) ----------------------------------------------------
    if (sw === "clear") {
      if (!isStaff(u)) { u.send("%crPermission denied.%cn"); return; }
      const state = readState(here);
      if (!state) { u.send("No initiative in progress here."); return; }
      await writeState(u, null);
      u.send("%cgInitiative cleared.%cn");
      poseRoom(u, "%cyCombat ends; initiative cleared.%cn");
      return;
    }

    // -- /next -------------------------------------------------------------
    if (sw === "next") {
      let state = readState(here);
      if (!state || state.order.length === 0) {
        u.send("No initiative in progress here.");
        return;
      }
      let advanced = nextTurn(state);
      await writeState(u, advanced);
      let cur = advanced.order[advanced.current];
      let wrapped = advanced.round !== state.round;
      let tag = wrapped ? ` (round ${advanced.round})` : "";
      u.send(`%cyTurn:%cn ${cur.name}${tag}.`);
      poseRoom(u, `%cyInitiative:%cn ${cur.name}'s turn${tag}.`);

      // Auto-run NPC turns until the order reaches a PC slot.
      // Safety: cap to order.length iterations to avoid runaway loops.
      let safety = advanced.order.length;
      while (safety-- > 0) {
        const turnChar = await findById(cur.charId);
        if (!turnChar?.isNpc) break;
        await runNpcTurn(u, turnChar);
        const before = advanced;
        advanced = nextTurn(advanced);
        await writeState(u, advanced);
        cur = advanced.order[advanced.current];
        wrapped = advanced.round !== before.round;
        tag = wrapped ? ` (round ${advanced.round})` : "";
        u.send(`%cyTurn:%cn ${cur.name}${tag}.`);
        poseRoom(u, `%cyInitiative:%cn ${cur.name}'s turn${tag}.`);
      }
      return;
    }

    // -- /addnpc (staff) ---------------------------------------------------
    if (sw === "addnpc") {
      if (!isStaff(u)) { u.send("%crPermission denied.%cn"); return; }
      if (!arg) { u.send("Usage: +init/addnpc <npc>"); return; }
      const tgt = await u.util.target(u.me, arg, true);
      // deno-lint-ignore no-explicit-any
      if (!tgt || !(tgt as any)?.flags?.has?.("npc")) {
        u.send(`No NPC found matching "${arg}".`);
        return;
      }
      const npcChar = await findByPlayer(tgt.id);
      if (!npcChar?.isNpc) { u.send("Target is not an NPC."); return; }
      let state = readState(here) ?? {
        round: 1, startedAt: Date.now(), current: 0, order: [],
      } as IInitState;
      const dex  = Math.max(1, Number(npcChar.attributes?.Dexterity ?? 0) + 1);
      const wits = Math.max(1, Number(npcChar.attributes?.Wits ?? 0) + 1);
      const entry = rollInitiative({
        charId:   npcChar.id,
        playerId: tgt.id,
        name:     npcChar.fullName ?? (tgt.name as string),
        dex, wits, modifier: 0,
      });
      state = insertEntry(state, entry);
      await writeState(u, state);
      u.send(`%cyAdded ${entry.name} to initiative:%cn ${entry.total}`);
      poseRoom(u, `${entry.name} rolls initiative: ${entry.total}`);
      return;
    }

    // -- /drop -------------------------------------------------------------
    if (sw === "drop") {
      const state = readState(here);
      const char = await findByPlayer(u.me.id);
      if (!state || !char) { u.send("You are not in the order."); return; }
      const mine = state.order.find((e) => e.charId === char.id);
      if (!mine) { u.send("You are not in the order."); return; }
      const updated = removeEntry(state, char.id);
      await writeState(u, updated);
      u.send("%cyYou drop out of combat.%cn");
      poseRoom(u, `%cy${mine.name} drops out of combat.%cn`);
      return;
    }

    // -- /reroll / default roll -------------------------------------------
    if (sw && sw !== "reroll") {
      u.send(`Unknown switch: /${sw}. See +help init.`);
      return;
    }

    const char = await findByPlayer(u.me.id);
    if (!char) { u.send("You have no character on file."); return; }

    let modifier = 0;
    if (arg) {
      const n = Number(arg);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        u.send("Modifier must be an integer.");
        return;
      }
      modifier = Math.max(-10, Math.min(10, n));
    }

    let state = readState(here);
    const already = state?.order.find((e) => e.charId === char.id);
    if (already && sw !== "reroll") {
      u.send("You are already in the order. Use +init/reroll to re-roll.");
      return;
    }

    const dex  = Math.max(1, Number(char.attributes?.Dexterity ?? 0) + 1);
    const wits = Math.max(1, Number(char.attributes?.Wits ?? 0) + 1);
    // attributes record stores extra dots above base 1; +1 baseline.
    // Use the same convention used by dice.ts resolvePoolExpr for attributes.

    const loginName = u.util.displayName(u.me, u.me);
    const displayName = shiftedDisplayName(char, loginName);

    const entry = rollInitiative({
      charId:   char.id,
      playerId: u.me.id,
      name:     displayName,
      dex,
      wits,
      modifier,
    });

    state = insertEntry(state, entry);
    await writeState(u, state);

    const modTag = modifier !== 0
      ? ` ${modifier >= 0 ? "+" : "-"} mod(${Math.abs(modifier)})`
      : "";
    u.send(
      `%cyYou roll initiative:%cn Dex(${entry.dex}) + Wits(${entry.wits}) + d10(${entry.d10})${modTag} = ${entry.total}`,
    );
    poseRoom(u, `${displayName} rolls initiative: ${entry.total}`);

    gameHooks.emit("wod20th:init-rolled", {
      charId:   char.id,
      playerId: u.me.id,
      total:    entry.total,
    });
  },
});
