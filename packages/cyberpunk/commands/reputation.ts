/**
 * +rep, +facedown -- Reputation and Social Combat Commands
 */
import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import type { ICPRCharacter } from "../db/schemas.ts";
import { rollD10Critical } from "../engine/dice.ts";
import { facedownTotal, resolveFacedown, FACEDOWN_SCENE_MS } from "../engine/combat.ts";
import type { ICPRNpc } from "../db/schemas.ts";
import { emitReputationGained } from "../engine/emitters.ts";
import { bar, div, hdr, lbl, val, acc, dim, ARR, ERR, OK, row, wrap } from "./chargen.ts";

addCmd({
  name: "+rep",
  pattern: /^\+rep(?:\/(view|add|deed))?\s*(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+rep[/<switch>] [<argument>]  -- Manage your reputation.

Switches:
  /view                    Show your reputation and deeds.
  /add <amount>            (Admin) Adjust reputation.
  /deed <description>      Record a notable deed.

Reputation affects Facedown rolls, NPC reactions, and access to Fixers.

Examples:
  +rep                     View your reputation.
  +rep/deed Took down MaxTac solo  Record a deed.
  +rep/add 2               (Admin) Add 2 rep.`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "view").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

    if (!sw || sw === "view") {
      const name = u.util.displayName(u.me, u.me);
      const lines = [
        bar(),
        hdr("STREET CRED"),
        bar(),
        row("HANDLE",     val(name)),
        row("REP",        val(`${cpr.reputation}`)),
        row("TIER",       reputationTier(cpr.reputation)),
      ];
      if (cpr.reputationDeeds.length > 0) {
        lines.push(div());
        lines.push(`  ${lbl("KNOWN FOR:")}`);
        cpr.reputationDeeds.slice(0, 8).forEach((d) => lines.push(`    * ${d}`));
      }
      lines.push(bar());
      u.send(lines.join("\r\n"));
      return;
    }

    if (sw === "deed") {
      if (!arg) { u.send(`${ERR}Provide a deed description: ${val("+rep/deed <description>")}`); return; }
      const newDeeds = [arg, ...cpr.reputationDeeds].slice(0, 10); // keep last 10
      await u.db.modify(u.me.id, "$set", { "state.cpr.reputationDeeds": newDeeds });
      u.send(`${OK}Deed recorded: ${dim(`"${arg}"`)}`);
      return;
    }

    const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard");
    if (!isAdmin) { u.send(`${ERR}Only admins can adjust street cred.`); return; }

    if (sw === "add") {
      const amount = parseInt(arg, 10);
      if (isNaN(amount)) { u.send(`${ERR}Provide an amount: ${val("+rep/add <number>")}`); return; }
      const newRep = Math.max(0, Math.min(10, cpr.reputation + amount));
      await u.db.modify(u.me.id, "$set", { "state.cpr.reputation": newRep });
      if (amount > 0) await emitReputationGained(u.me, amount, "admin adjustment");
      u.send(`${OK}Rep ${amount >= 0 ? acc(`+${amount}`) : acc(`${amount}`)} ${dim("->")} ${val(newRep)}`);
    }
  },
});

function reputationTier(rep: number): string {
  if (rep <= 0) return `${dim("Unknown")} -- Nobody knows you yet.`;
  if (rep <= 2) return `${dim("Local")} -- Your neighborhood knows your name.`;
  if (rep <= 4) return `${acc("Street Known")} -- You have a rep on the streets.`;
  if (rep <= 6) return `${acc("City Known")} -- Night City knows who you are.`;
  if (rep <= 8) return `%cg${"Famous"}%cn -- You're a legend in the making.`;
  return `%cg${"LEGEND"}%cn -- Your name is feared and respected worldwide.`;
}

// -- +facedown -----------------------------------------------------------------

addCmd({
  name: "+facedown",
  pattern: /^\+facedown(?:\/(\S+))?(?:\s+(.*))?$/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+facedown [<target>]  -- Initiate a reputation facedown.

COOL + Reputation + 1d10 vs target's COOL + Reputation + 1d10. Tied totals
re-roll once; a second tie is a stalemate. The loser is "impressed" for
about 5 minutes (the scene) and is expected to back down.

Switches:
  /clear   Clear the impressed condition on yourself.

Examples:
  +facedown            Show your facedown total (uncontested).
  +facedown Rogue      Face down Rogue.
  +facedown/clear      Clear an impressed condition you are under.`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

    if (sw === "clear") {
      await u.db.modify(u.me.id, "$set", { "state.cpr.impressedBy": null });
      u.send(`${OK}Impressed condition cleared.`);
      return;
    }

    const myName = u.util.displayName(u.me, u.me);

    if (!arg) {
      const myRoll = rollD10Critical();
      const myTotal = facedownTotal(cpr.stats.cool, cpr.reputation, myRoll.total);
      u.send([
        bar(),
        hdr("FACEDOWN"),
        bar(),
        row(myName, `COOL(${cpr.stats.cool}) + Rep(${cpr.reputation}) + d10(${myRoll.total}) = ${val(myTotal)}`),
        bar(),
      ].join("\r\n"));
      return;
    }

    const target = await u.util.target(u.me, arg, false);
    if (!target) { u.send(`${ERR}No target ${val(`"${arg}"`)} found nearby.`); return; }

    const targetCpr = target.state.cpr as ICPRCharacter | undefined;
    const targetNpc = target.state.cprNpc as ICPRNpc | undefined;
    const theirCool = targetCpr?.stats.cool ?? targetNpc?.stats.cool ?? 5;
    const theirRep  = targetCpr?.reputation ?? 0;
    const theirName = u.util.displayName(target, u.me);

    const fd = resolveFacedown(
      () => rollD10Critical().total,
      { cool: cpr.stats.cool, reputation: cpr.reputation },
      { cool: theirCool, reputation: theirRep },
    );

    const rollLine = (label: string, ours: number, total: number, rep: number, cool: number) =>
      row(label, `COOL(${cool}) + Rep(${rep}) + d10(${ours}) = ${val(total)}`);
    const lines = [
      bar(),
      hdr("FACEDOWN"),
      bar(),
      ...fd.rolls.flatMap((r, i) => [
        ...(fd.rolls.length > 1 ? [`  ${dim(`-- roll ${i + 1} --`)}`] : []),
        rollLine(myName,    r.attacker, facedownTotal(cpr.stats.cool, cpr.reputation, r.attacker), cpr.reputation, cpr.stats.cool),
        rollLine(theirName, r.defender, facedownTotal(theirCool, theirRep, r.defender), theirRep, theirCool),
      ]),
      div(),
      fd.outcome === "attacker" ? `  ${OK}${val(myName)} WINS -- ${theirName} is impressed and should back down.`
        : fd.outcome === "defender" ? `  ${ERR}${val(theirName)} WINS -- ${myName} loses face.`
        : `  ${dim("STALEMATE")} -- neither side backs down.`,
      bar(),
    ];
    const msg = lines.join("\r\n");
    u.send(msg);
    u.here.broadcast?.(msg, { exclude: [u.me.id] });

    if (fd.outcome === "attacker" && targetCpr) {
      await u.db.modify(target.id, "$set", {
        "state.cpr.impressedBy": { actorId: u.me.id, actorName: myName, expiresAt: Date.now() + FACEDOWN_SCENE_MS },
      });
    } else if (fd.outcome === "defender") {
      await u.db.modify(u.me.id, "$set", {
        "state.cpr.impressedBy": { actorId: target.id, actorName: theirName, expiresAt: Date.now() + FACEDOWN_SCENE_MS },
      });
    }
  },
});
