import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { chars, reviews } from "../schema.ts";
import { checkRequired } from "../validation.ts";
import { maxWounds } from "../derived.ts";

addCmd({
  name: "+chargen/submit",
  pattern: /^\+chargen\/submit$/i,
  lock: "connected",
  category: "Chargen",
  help: `+chargen/submit  — Submit your character for staff review.`,
  exec: async (u: IUrsamuSDK) => {
    const char = await chars.findOne({ playerId: u.me.id });
    if (!char) { u.send("Use %cy+chargen/start%cn first."); return; }
    if (char.chargenStatus === "submitted") { u.send("Already submitted. Await staff review."); return; }
    if (char.chargenStatus === "approved")  { u.send("Already approved."); return; }

    const missing = checkRequired(char);
    if (missing.length > 0) {
      u.send(`%cyCannot submit — missing required steps:%cn%r` + missing.map((m) => `  • ${m}`).join("%r"));
      return;
    }
    const cash = char.cash > 0 ? char.cash : char.lifepath.startingCash;
    await chars.update({ id: char.id }, { chargenStatus: "submitted", submittedAt: Date.now(), cash });
    u.send(`%cyCharacter submitted!%cn Staff will review your sheet shortly.`);
  },
});

addCmd({
  name: "+chargen/pending",
  pattern: /^\+chargen\/pending$/i,
  lock: "connected admin+",
  category: "Chargen",
  help: `+chargen/pending  — List all submitted characters awaiting review. (Admin)`,
  exec: async (u: IUrsamuSDK) => {
    const pending = await chars.find({ chargenStatus: "submitted" });
    if (pending.length === 0) { u.send("No characters pending review."); return; }
    const lines = [
      u.util.header("PENDING CHARACTERS"),
      ...pending.map((c) => {
        const ago = c.submittedAt ? Math.floor((Date.now() - c.submittedAt) / 60000) : 0;
        return `  %cy${c.playerName}%cn — submitted ${ago}m ago`;
      }),
    ];
    u.send(lines.join("%r"));
  },
});

addCmd({
  name: "+chargen/view",
  pattern: /^\+chargen\/view\s+(.*)/i,
  lock: "connected admin+",
  category: "Chargen",
  help: `+chargen/view <player>  — View another player's chargen sheet. (Admin)

Examples:
  +chargen/view Alice    View Alice's chargen record.`,
  exec: async (u: IUrsamuSDK) => {
    const name = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const target = await u.util.target(u.me, name, true);
    if (!target) { u.send(`Player "${name}" not found.`); return; }

    const char = await chars.findOne({ playerId: target.id });
    if (!char) { u.send(`${target.name} has no chargen record.`); return; }

    const lines = [
      u.util.header(`${char.playerName} — Chargen`),
      ` Status: ${char.chargenStatus}  Type: ${char.charType ?? "unset"}  Age: ${char.age}`,
      ` Stats: ATT${char.stats.att} BOD${char.stats.bod} CL${char.stats.cl} EMP${char.stats.emp} INT${char.stats.int} LUCK${char.stats.luck} MA${char.stats.ma} REF${char.stats.ref} TECH${char.stats.tech} EDU${char.stats.edu}`,
      ` Careers: ${char.careers.map((c) => c.profession).join(", ") || "none"}`,
      ` Skills: ${Object.entries(char.skills).map(([k, v]) => `${k}+${v}`).join(", ") || "none"}`,
      char.reviewNote ? ` Note: ${char.reviewNote}` : "",
    ].filter(Boolean);
    u.send(lines.join("%r"));
  },
});

addCmd({
  name: "+chargen/approve",
  pattern: /^\+chargen\/approve\s+(.*)/i,
  lock: "connected admin+",
  category: "Chargen",
  help: `+chargen/approve <player>  — Approve and lock a character. (Admin)

Examples:
  +chargen/approve Alice    Approve Alice's character.`,
  exec: async (u: IUrsamuSDK) => {
    const name = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const target = await u.util.target(u.me, name, true);
    if (!target) { u.send(`Player "${name}" not found.`); return; }

    const char = await chars.findOne({ playerId: target.id });
    if (!char) { u.send(`${target.name} has no chargen record.`); return; }
    if (char.chargenStatus === "approved") { u.send(`${target.name} is already approved.`); return; }

    if (!(await u.canEdit(u.me, target))) { u.send("Permission denied."); return; }

    // Initialize wounds to max HP on approval; chargenStatus is the authority for locked state.
    const wounds = maxWounds(char);
    await chars.update({ id: char.id }, { chargenStatus: "approved", approvedAt: Date.now(), wounds, luckRemaining: char.stats.luck });

    await reviews.create({ id: crypto.randomUUID(), charId: char.id, reviewerId: u.me.id, reviewerName: u.me.name ?? "Unknown", action: "approved", timestamp: Date.now() });
    u.send(`%cy${target.name}%cn has been %cgapproved%cn.`);
    u.send(`Your character has been %cyapproved!%cn Welcome to the game.`, target.id);
  },
});

addCmd({
  name: "+chargen/reject",
  pattern: /^\+chargen\/reject\s+(.+)=(.*)/i,
  lock: "connected admin+",
  category: "Chargen",
  help: `+chargen/reject <player>=<note>  — Return a character for revision. (Admin)

Examples:
  +chargen/reject Alice=Please lower REF to 7 per house rules.`,
  exec: async (u: IUrsamuSDK) => {
    const name = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const note = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    if (!note) { u.send("Provide a rejection note: %cy+chargen/reject <player>=<note>%cn."); return; }

    const target = await u.util.target(u.me, name, true);
    if (!target) { u.send(`Player "${name}" not found.`); return; }

    const char = await chars.findOne({ playerId: target.id });
    if (!char) { u.send(`${target.name} has no chargen record.`); return; }

    await chars.update({ id: char.id }, { chargenStatus: "revision", reviewNote: note });
    await reviews.create({ id: crypto.randomUUID(), charId: char.id, reviewerId: u.me.id, reviewerName: u.me.name ?? "Unknown", action: "rejected", note, timestamp: Date.now() });
    u.send(`%cy${target.name}%cn returned for revision.`);
    u.send(`Your character requires revision.%r  Staff note: %cy${note}%cn%r  Fix and re-submit with %cy+chargen/submit%cn.`, target.id);
  },
});
