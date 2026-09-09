// commands/stepside.ts -- +stepside command for WtA Umbra travel.
//
// Pattern: ^\+stepside(?:\/(\S+))?\s*(.*)
//   args[0] = switch (undefined | "check" | "where")
//   args[1] = rest   (unused)
//
// Pure mechanics live in core/umbra.ts. This file owns persistence,
// hook emission, and player-facing output.
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { findByPlayer, saveChar } from "../db/charDb.ts";
import type { IWoDChar } from "../core/types.ts";
import { DEFAULT_GAUNTLET, stepSideways, isInUmbra } from "../core/umbra.ts";
import { spendPool } from "../core/pools.ts";
import { appliedPool } from "../core/wounds.ts";
import { frenzyBlockMessage } from "../core/frenzyGate.ts";
import { poseRoom } from "../core/poseRoom.ts";
import { shiftedDisplayName } from "../core/displayName.ts";
import { formatRoll } from "../core/renderer.ts";
import { emitSteppedSideways } from "../hooks.ts";
import { caernIdForRoom } from "../core/caern.ts";
import { findCaernById, findCaernByName } from "../db/caernDb.ts";

addCmd({
  name: "+stepside",
  pattern: /^\+stepside(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Werewolf",
  help: `+stepside[/switch]  -- Step sideways into (or out of) the Umbra.

  Roll Gnosis vs the local Gauntlet (default ${DEFAULT_GAUNTLET}). Each
  success speeds the shift. Failure or botch costs 1 temporary Gnosis.

SYNTAX
  +stepside                Attempt to shift across the Gauntlet.
  +stepside/check          Preview a roll without persisting.
  +stepside/where          Show your current location.
  +stepside/moonbridge <caern>  Open a moon bridge between caerns.

EXAMPLES
  +stepside                Try to enter or leave the Umbra.
  +stepside/check          Roll without committing.
  +stepside/moonbridge Heart-of-the-Glen  Travel between two caerns.

SEE ALSO: +help stepside, +help caern, +help realm, +help gnosis`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();

    const char = await findByPlayer(u.me.id);
    if (!char) { u.send("You have no character on file."); return; }
    if (char.splat !== "wta") {
      u.send("Only Garou (WtA) characters can step sideways.");
      return;
    }
    if (!char.gnosis || char.gnosis <= 0) {
      u.send("You have no Gnosis pool -- you cannot step sideways.");
      return;
    }

    // -- /moonbridge <caern> ------------------------------------------------
    if (sw === "moonbridge") {
      const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
      if (!arg) { u.send("Usage: +stepside/moonbridge <caern>"); return; }

      const fromCaernId = caernIdForRoom(u.here);
      if (!fromCaernId) {
        u.send("Moon bridges can only be opened from within a caern.");
        return;
      }
      const fromCaern = await findCaernById(fromCaernId);
      if (!fromCaern) {
        u.send("This room's caern record is missing; cannot open a bridge.");
        return;
      }

      const target = await findCaernByName(arg);
      if (!target) { u.send(`No caern named "${arg}".`); return; }
      if (target.id === fromCaern.id) { u.send("You are already at that caern."); return; }
      if (!target.locationRoomId) {
        u.send(`${target.name} is not bound to a room; no bridge can land there.`);
        return;
      }

      const block = frenzyBlockMessage(char, "open a moon bridge");
      if (block) { u.send(block); return; }

      const spend = spendPool(char, "gnosis", 1);
      if (!spend.ok) { u.send(spend.message); return; }
      char.gnosisCurrent = spend.remaining;
      await saveChar(char);

      // Move the player to the target caern's bound room.
      await u.db.modify(u.me.id, "$set", { location: target.locationRoomId });

      const name = u.util.displayName(u.me, u.me);
      const seenAs = shiftedDisplayName(char, name);
      u.send(`%cmA moon bridge arcs from %ch${fromCaern.name}%cn%cm to %ch${target.name}%cn%cm. (-1 Gnosis)%cn`);
      poseRoom(u, `%cm${seenAs} steps onto a moon bridge and is gone.%cn`);
      return;
    }

    // -- /where --------------------------------------------------------------
    if (sw === "where") {
      const raw = Number(u.here?.state?.gauntlet);
      const localGauntlet = Number.isInteger(raw) && raw >= 2 && raw <= 10 ? raw : DEFAULT_GAUNTLET;
      const loc = isInUmbra(char)
        ? "Location: %ch%cmIn the Umbra.%cn"
        : "Location: %chIn the material plane.%cn";
      u.send(`${loc}  %cyGauntlet ${localGauntlet}%cn`);
      return;
    }

    // Frenzy shatters the concentration required to cross the Gauntlet.
    const block = frenzyBlockMessage(char, "step sideways");
    if (block) { u.send(block); return; }

    // Per-room Gauntlet strength: cities ~ 8, wilderness 4-5, caerns 3-4.
    // Falls back to DEFAULT_GAUNTLET (6) when the room doesn't specify one.
    const raw = Number(u.here?.state?.gauntlet);
    const gauntlet = Number.isInteger(raw) && raw >= 2 && raw <= 10 ? raw : DEFAULT_GAUNTLET;

    // M20 wound penalties reduce the Gnosis pool used for the shift.
    // Incapacitated characters cannot attempt it at all.
    const gnosisPool = Math.max(1, char.gnosisCurrent ?? char.gnosis ?? 0);
    const applied    = appliedPool(char, gnosisPool);
    if (applied.incap) {
      u.send("%crYou are incapacitated and cannot step sideways.%cn");
      return;
    }
    // Roll using a wound-adjusted clone so stepSideways sees the reduced
    // Gnosis pool. We must not mutate `char` itself -- the failure branch
    // below decrements char.gnosisCurrent via spendPool, and we want that
    // applied to the player's actual Gnosis, not the temporary clone.
    // The audit guard requires the literal `stepSideways(char, gauntlet)`
    // call shape, so we shadow `char` inside this block.
    const reducedGnosis = Math.max(1, applied.pool);
    const result = ((char: IWoDChar) => stepSideways(char, gauntlet))(
      { ...char, gnosisCurrent: reducedGnosis, gnosis: reducedGnosis },
    );
    const name = u.util.displayName(u.me, u.me);

    const pubLabel  = "Gnosis";
    const penTag    = applied.penalty > 0 ? ` (wound -${applied.penalty})` : "";
    const privLabel = `Gnosis(${char.gnosisCurrent ?? char.gnosis})${penTag}`;
    const { priv } = formatRoll(result.roll, { pubLabel, privLabel }, name);

    // -- /check -- preview only --------------------------------------------
    if (sw === "check") {
      u.send(priv);
      let preview: string;
      switch (result.outcome) {
        case "entered": preview = "Would enter the Umbra."; break;
        case "exited":  preview = "Would return to the material plane."; break;
        case "failed":  preview = "Shift would fail (lose 1 temporary Gnosis)."; break;
        case "botched": preview = "Shift would botch (trapped, lose 1 temporary Gnosis)."; break;
      }
      u.send(`(preview) ${preview}`);
      return;
    }

    // -- default: attempt and persist --------------------------------------
    u.send(priv);

    if (result.outcome === "entered" || result.outcome === "exited") {
      char.inUmbra = result.outcome === "entered";
      await saveChar(char);
      // Persist reality plane on the player record so sgp's look (and any
      // future visibility predicates) filter occupants by plane.
      await u.db.modify(u.me.id, "$set", {
        "state.reality": result.outcome === "entered" ? "penumbra" : "material",
      });
      u.send(result.outcome === "entered"
        ? "%cmYou slip across the Gauntlet into the Umbra.%cn"
        : "%cgYou step back across the Gauntlet into the material plane.%cn");
      const seenAs = shiftedDisplayName(char, name);
      poseRoom(u, result.outcome === "entered"
        ? `%cm${seenAs} grows indistinct and fades into the Umbra.%cn`
        : `%cg${seenAs} shimmers into view from the Umbra.%cn`);
    } else {
      // Failed or botched -- spend 1 temporary Gnosis.
      const spend = spendPool(char, "gnosis", 1);
      if (spend.ok && spend.remaining !== undefined) {
        char.gnosisCurrent = spend.remaining;
        await saveChar(char);
      }
      u.send(result.outcome === "botched"
        ? "%cr%chBotch!%cn You are trapped at the Gauntlet, dazed. (-1 Gnosis)"
        : "%cyThe reflection ripples and stills. The shift fails. (-1 Gnosis)%cn");
    }

    emitSteppedSideways({
      playerId: u.me.id,
      charId:   char.id,
      outcome:  result.outcome,
      roll:     result.roll,
    });
  },
});
