// commands/pool.ts -- +rage and +gnosis pool spend/regain/set commands.
//
// Pattern: ^\+(rage|gnosis)(?:\/(\S+))?\s*(.*)
//   args[0] = pool name ("rage" | "gnosis")
//   args[1] = switch    (undefined | "spend" | "regain" | "set")
//   args[2] = rest      (amount, or "<amount> <target>" for /set)
//
// Switches:
//   (none)      Show current/permanent.
//   /spend N    Decrement current; rejects if insufficient.
//   /regain N   Increment current; capped at permanent.
//   /set N tgt  Staff-only -- set permanent rating; emits stat:changed and
//               writes a stat log entry. Caps at POOL_CAP (10).
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { findByPlayer, saveChar } from "../db/charDb.ts";
import { POOL_CAP, type Pool, regainPool, spendPool } from "../core/pools.ts";
import { frenzyBlockMessage } from "../core/frenzyGate.ts";
import { emitPoolRegained, emitPoolSpent, emitStatChanged } from "../hooks.ts";
import { caernBonus, caernIdForRoom } from "../core/caern.ts";
import { findCaernById } from "../db/caernDb.ts";

/** True when the actor holds an admin-class flag. */
function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

/** Capitalize a pool name for player-facing messages. */
function label(pool: Pool): string {
  return pool[0].toUpperCase() + pool.slice(1);
}

/** Read the (permanent, current) pair for `pool` from a character record. */
function readCurrent(
  char: { rage?: number; gnosis?: number; rageCurrent?: number; gnosisCurrent?: number },
  pool: Pool,
): { permanent: number | undefined; current: number } {
  if (pool === "rage") {
    const permanent = char.rage;
    return { permanent, current: char.rageCurrent ?? permanent ?? 0 };
  }
  const permanent = char.gnosis;
  return { permanent, current: char.gnosisCurrent ?? permanent ?? 0 };
}

/** Parse a positive integer; returns null on any failure. */
function parsePositiveInt(s: string): number | null {
  if (!/^\d+$/.test(s.trim())) return null;
  const n = parseInt(s, 10);
  return n > 0 ? n : null;
}

/**
 * Build and register the +rage / +gnosis command pair. Both commands share
 * a single executor branching on `args[0]` to keep the switch handling and
 * help formatting in one place.
 */
function makePoolCmd(pool: Pool): void {
  const upper = label(pool);
  const example = pool === "rage" ? "frenzy" : "step sideways";

  addCmd({
    name: `+${pool}`,
    pattern: new RegExp(`^\\+(${pool})(?:\\/(\\S+))?\\s*(.*)`, "i"),
    lock: "connected",
    category: "Werewolf",
    help: `+${pool}[/switch] [<args>]  -- View or change your ${upper} pool.

SYNTAX
  +${pool}                  Show your current / permanent ${upper}.
  +${pool}/spend <n>        Spend <n> points (e.g. ${example}).
  +${pool}/regain <n>       Regain <n> points; capped at permanent.
  +${pool}/set <n> <tgt>    Staff only: set permanent rating (max ${POOL_CAP}).

EXAMPLES
  +${pool}              Show pool.
  +${pool}/spend 1      Spend 1 ${upper}.
  +${pool}/regain 2     Regain 2 ${upper}.

SEE ALSO: +help ${pool}`,

    exec: async (u: IUrsamuSDK) => {
      const sw = (u.cmd.args[1] ?? "").toLowerCase().trim();
      const rest = u.util.stripSubs(u.cmd.args[2] ?? "").trim();

      // -- /set (staff only) -------------------------------------------------
      if (sw === "set") {
        if (!isStaff(u)) { u.send("%crPermission denied.%cn"); return; }
        const parts = rest.split(/\s+/);
        if (parts.length < 2) {
          u.send(`Usage: +${pool}/set <n> <target>`);
          return;
        }
        const n = parsePositiveInt(parts[0]);
        if (n === null || n > POOL_CAP) {
          u.send(`Permanent ${upper} must be 1-${POOL_CAP}.`);
          return;
        }
        const targetName = parts.slice(1).join(" ");
        const target = await u.util.target(u.me, targetName, true);
        if (!target) { u.send("Target not found."); return; }
        if (!(await u.canEdit(u.me, target))) {
          u.send("%crPermission denied.%cn");
          return;
        }
        const char = await findByPlayer(target.id);
        if (!char) {
          u.send(`${u.util.displayName(target, u.me)} has no character on file.`);
          return;
        }

        const oldValue = pool === "rage" ? char.rage : char.gnosis;
        if (pool === "rage") char.rage = n; else char.gnosis = n;

        // Clamp current down to new permanent if we lowered the cap.
        const cur = pool === "rage" ? char.rageCurrent : char.gnosisCurrent;
        if (cur !== undefined && cur > n) {
          if (pool === "rage") char.rageCurrent = n;
          else char.gnosisCurrent = n;
        }

        (char.statLog ??= []).push({
          staffId: u.me.id,
          trait: pool,
          old: oldValue,
          new: n,
          ts: Date.now(),
        });

        await saveChar(char);

        emitStatChanged({
          staffId: u.me.id,
          targetId: target.id,
          charId: char.id,
          trait: pool,
          old: oldValue,
          newVal: n,
        });

        u.send(
          `%chStat set:%cn ${u.util.displayName(target, u.me)} / ${pool} = ${n} ` +
            `(was: ${oldValue ?? "unset"})`,
        );
        return;
      }

      // -- All remaining switches act on the actor's own sheet ---------------
      const char = await findByPlayer(u.me.id);
      if (!char) { u.send("No character on file."); return; }

      // -- (no switch) -- show --------------------------------------------
      if (!sw || sw === "show") {
        const { permanent, current } = readCurrent(char, pool);
        if (permanent === undefined) {
          u.send(`You have no ${upper} pool.`);
          return;
        }
        u.send(`${upper}: ${current}/${permanent}`);
        return;
      }

      // -- /spend ------------------------------------------------------------
      if (sw === "spend") {
        const amount = parsePositiveInt(rest);
        if (amount === null) {
          u.send(`Usage: +${pool}/spend <positive integer>`);
          return;
        }
        // Frenzy locks gift fuel (gnosis). Rage is the fuel of frenzy itself.
        if (pool === "gnosis") {
          const block = frenzyBlockMessage(char, "spend Gnosis");
          if (block) { u.send(block); return; }
        }
        const result = spendPool(char, pool, amount);
        if (!result.ok || result.remaining === undefined) {
          u.send(`%cr${result.message}%cn`);
          return;
        }
        if (pool === "rage") char.rageCurrent = result.remaining;
        else char.gnosisCurrent = result.remaining;
        await saveChar(char);

        u.send(result.message);
        emitPoolSpent({
          playerId: u.me.id,
          charId: char.id,
          pool,
          amount,
          remaining: result.remaining,
          permanent: (pool === "rage" ? char.rage : char.gnosis) ?? 0,
        });
        return;
      }

      // -- /regain -----------------------------------------------------------
      if (sw === "regain") {
        const baseAmount = parsePositiveInt(rest);
        if (baseAmount === null) {
          u.send(`Usage: +${pool}/regain <positive integer>`);
          return;
        }
        // Caern bonus: if we're regaining Gnosis in a caern-bound room, the
        // canonical-spirit caern multiplies the amount by its gnosisRate.
        let amount = baseAmount;
        let caernNote = "";
        if (pool === "gnosis") {
          // deno-lint-ignore no-explicit-any
          const caernId = caernIdForRoom((u as any).here ?? undefined);
          if (caernId) {
            const caern = await findCaernById(caernId);
            const bonus = caernBonus(char, caern);
            if (bonus.gnosisRate && bonus.gnosisRate > 1) {
              const boosted = Math.floor(baseAmount * bonus.gnosisRate);
              if (boosted > baseAmount) {
                amount = boosted;
                caernNote = ` %cy(caern bonus: ${baseAmount} -> ${amount})%cn`;
              }
            }
          }
        }
        const result = regainPool(char, pool, amount);
        if (!result.ok || result.current === undefined) {
          u.send(`%cr${result.message}%cn`);
          return;
        }
        if (pool === "rage") char.rageCurrent = result.current;
        else char.gnosisCurrent = result.current;
        await saveChar(char);

        u.send(result.message + caernNote);
        emitPoolRegained({
          playerId: u.me.id,
          charId: char.id,
          pool,
          amount,
          remaining: result.current,
          permanent: (pool === "rage" ? char.rage : char.gnosis) ?? 0,
        });
        return;
      }

      u.send(`Unknown switch /${sw}. Try +help ${pool}.`);
    },
  });
}

makePoolCmd("rage");
makePoolCmd("gnosis");
