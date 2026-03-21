import { addCmd } from "../../services/commands/cmdParser.ts";
import type { IUrsamuSDK } from "../../@types/UrsamuSDK.ts";
import { chargenApps, getOrCreateApp, findAppByPlayer } from "./db.ts";
import { chargenHooks } from "./hooks.ts";
import { dbojs, mail } from "../../services/Database/index.ts";
import { setFlags } from "../../utils/setFlags.ts";
import type { IDBOBJ } from "../../@types/IDBObj.ts";
import type { IMail } from "../../@types/IMail.ts";

// ─── helpers ──────────────────────────────────────────────────────────────────

const WIDTH = 77;

function header(title: string): string {
  const t = ` ${title} `;
  const pad = Math.floor((WIDTH - t.length) / 2);
  return "%ch" + "=".repeat(pad) + t + "=".repeat(WIDTH - pad - t.length) + "%cn";
}

function footer(): string {
  return "%ch" + "=".repeat(WIDTH) + "%cn";
}

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
}

/** Resolve a player by partial name or id from dbojs. */
async function resolvePlayer(nameOrId: string): Promise<IDBOBJ | null> {
  // Try exact ID match first
  const byId = await dbojs.queryOne({ id: nameOrId });
  if (byId) return byId;

  // Try name match
  const all = await dbojs.find({});
  const lower = nameOrId.toLowerCase();
  const found = all.find(p =>
    (p.data?.name as string | undefined)?.toLowerCase() === lower
  );
  return found || null;
}

// ─── +chargen ─────────────────────────────────────────────────────────────────

addCmd({
  name: "+chargen",
  pattern: /^\+chargen$/i,
  exec: async (u: IUrsamuSDK) => {
    const app = await getOrCreateApp(u.me.id);
    const lines: string[] = [];
    lines.push(header("Character Generation"));
    lines.push(`Status: %ch${app.data.status.toUpperCase()}%cn`);
    lines.push(`Player: ${u.me.id}`);
    lines.push("-".repeat(WIDTH));

    const fieldNames = Object.keys(app.data.fields);
    if (fieldNames.length === 0) {
      lines.push("No fields set. Use +chargen/set <field>=<value> to fill in your application.");
    } else {
      for (const [k, v] of Object.entries(app.data.fields)) {
        lines.push(`%ch${k}%cn: ${v}`);
      }
    }

    if (app.data.submittedAt) {
      lines.push(`Submitted: ${new Date(app.data.submittedAt).toISOString()}`);
    }
    if (app.data.notes) {
      lines.push(`Notes: ${app.data.notes}`);
    }
    lines.push(footer());
    u.send(lines.join("\n"));
  },
});

// ─── +chargen/set ─────────────────────────────────────────────────────────────

const MAX_FIELD_NAME_LEN = 64;
const MAX_FIELD_VALUE_LEN = 4096;

addCmd({
  name: "+chargen/set",
  pattern: /^\+chargen\/set\s+(.+)$/i,
  exec: async (u: IUrsamuSDK) => {
    const raw = (u.cmd.args[0] || "").trim();
    const eqIdx = raw.indexOf("=");
    if (eqIdx === -1) {
      u.send("Usage: +chargen/set <field>=<value>");
      return;
    }
    const field = raw.slice(0, eqIdx).trim().toLowerCase();
    const value = raw.slice(eqIdx + 1).trim();

    if (!field || !value) {
      u.send("Usage: +chargen/set <field>=<value>");
      return;
    }

    if (field.length > MAX_FIELD_NAME_LEN) {
      u.send(`Field name too long (max ${MAX_FIELD_NAME_LEN} characters).`);
      return;
    }
    if (value.length > MAX_FIELD_VALUE_LEN) {
      u.send(`Field value too long (max ${MAX_FIELD_VALUE_LEN} characters).`);
      return;
    }

    const app = await getOrCreateApp(u.me.id);
    if (app.data.status === "pending") {
      u.send("Your application is pending review. You cannot modify it now. Contact staff if you need changes.");
      return;
    }
    if (app.data.status === "approved") {
      u.send("Your application has already been approved.");
      return;
    }

    const updatedFields = { ...app.data.fields, [field]: value };
    await chargenApps.update({ id: app.id }, {
      ...app,
      data: { ...app.data, fields: updatedFields },
    });
    u.send(`Set %ch${field}%cn on your chargen application.`);
  },
});

// ─── +chargen/submit ──────────────────────────────────────────────────────────

addCmd({
  name: "+chargen/submit",
  pattern: /^\+chargen\/submit$/i,
  exec: async (u: IUrsamuSDK) => {
    const app = await getOrCreateApp(u.me.id);

    if (app.data.status === "pending") {
      u.send("Your application is already submitted and awaiting review.");
      return;
    }
    if (app.data.status === "approved") {
      u.send("Your application has already been approved.");
      return;
    }

    if (Object.keys(app.data.fields).length === 0) {
      u.send("You haven't filled in any fields yet. Use +chargen/set <field>=<value> first.");
      return;
    }

    const now = Date.now();
    const updated = {
      ...app,
      data: {
        ...app.data,
        status: "pending" as const,
        submittedAt: now,
      },
    };
    await chargenApps.update({ id: app.id }, updated);
    await chargenHooks.emit("chargen:submitted", updated);
    u.send("Your character application has been submitted for staff review. You will be notified when it is processed.");
  },
});

// ─── +chargen/view ────────────────────────────────────────────────────────────

addCmd({
  name: "+chargen/view",
  pattern: /^\+chargen\/view\s+(.+)$/i,
  exec: async (u: IUrsamuSDK) => {
    if (!isStaff(u)) {
      u.send("Permission denied.");
      return;
    }

    const targetName = (u.cmd.args[0] || "").trim();
    if (!targetName) {
      u.send("Usage: +chargen/view <player>");
      return;
    }

    const player = await resolvePlayer(targetName);
    if (!player) {
      u.send("Player not found.");
      return;
    }

    const app = await findAppByPlayer(player.id);
    if (!app) {
      u.send(`${player.data?.name || player.id} has no chargen application.`);
      return;
    }

    const playerName = (player.data?.name as string) || player.id;
    const lines: string[] = [];
    lines.push(header(`Chargen: ${playerName}`));
    lines.push(`Status:  %ch${app.data.status.toUpperCase()}%cn`);
    lines.push(`Player:  ${player.id}`);
    if (app.data.submittedAt) {
      lines.push(`Submitted: ${new Date(app.data.submittedAt).toISOString()}`);
    }
    if (app.data.reviewedAt) {
      lines.push(`Reviewed:  ${new Date(app.data.reviewedAt).toISOString()}`);
    }
    if (app.data.reviewedBy) {
      lines.push(`Reviewer:  ${app.data.reviewedBy}`);
    }
    lines.push("-".repeat(WIDTH));

    const fieldNames = Object.keys(app.data.fields);
    if (fieldNames.length === 0) {
      lines.push("No fields set.");
    } else {
      for (const [k, v] of Object.entries(app.data.fields)) {
        lines.push(`%ch${k}%cn: ${v}`);
      }
    }

    if (app.data.notes) {
      lines.push("-".repeat(WIDTH));
      lines.push(`Notes: ${app.data.notes}`);
    }

    lines.push(footer());
    u.send(lines.join("\n"));
  },
});

// ─── +chargen/approve ─────────────────────────────────────────────────────────

addCmd({
  name: "+chargen/approve",
  pattern: /^\+chargen\/approve\s+(.+)$/i,
  exec: async (u: IUrsamuSDK) => {
    if (!isStaff(u)) {
      u.send("Permission denied.");
      return;
    }

    const raw = (u.cmd.args[0] || "").trim();
    const eqIdx = raw.indexOf("=");
    const targetName = eqIdx === -1 ? raw : raw.slice(0, eqIdx).trim();
    const note = eqIdx === -1 ? "" : raw.slice(eqIdx + 1).trim();

    if (!targetName) {
      u.send("Usage: +chargen/approve <player>[=<note>]");
      return;
    }

    const player = await resolvePlayer(targetName);
    if (!player) {
      u.send("Player not found.");
      return;
    }

    const app = await findAppByPlayer(player.id);
    if (!app) {
      u.send(`${player.data?.name || player.id} has no chargen application.`);
      return;
    }

    const reviewerName = (u.me.name || u.me.id);
    const now = Date.now();
    const updated = {
      ...app,
      data: {
        ...app.data,
        status: "approved" as const,
        reviewedAt: now,
        reviewedBy: reviewerName,
        notes: note || app.data.notes,
      },
    };
    await chargenApps.update({ id: app.id }, updated);

    // Set "approved" flag, remove "unapproved" flag on the player object
    await setFlags(player, "approved !unapproved");

    await chargenHooks.emit("chargen:approved", updated);

    const playerName = (player.data?.name as string) || player.id;
    u.send(`${playerName}'s application has been approved.`);

    // Notify the player if they're online
    const { wsService } = await import("../../services/WebSocket/index.ts");
    const sockets = wsService.getConnectedSockets();
    const playerSockets = sockets.filter(s => s.cid === player.id);
    if (playerSockets.length > 0) {
      const { send } = await import("../../services/broadcast/index.ts");
      send(playerSockets.map(s => s.id), "%ch>CHARGEN:%cn Congratulations! Your character application has been approved!");
    }
  },
});

// ─── +chargen/reject ──────────────────────────────────────────────────────────

addCmd({
  name: "+chargen/reject",
  pattern: /^\+chargen\/reject\s+(.+)$/i,
  exec: async (u: IUrsamuSDK) => {
    if (!isStaff(u)) {
      u.send("Permission denied.");
      return;
    }

    const raw = (u.cmd.args[0] || "").trim();
    const eqIdx = raw.indexOf("=");
    if (eqIdx === -1) {
      u.send("Usage: +chargen/reject <player>=<reason>");
      return;
    }
    const targetName = raw.slice(0, eqIdx).trim();
    const reason = raw.slice(eqIdx + 1).trim();

    if (!targetName || !reason) {
      u.send("Usage: +chargen/reject <player>=<reason>");
      return;
    }

    const player = await resolvePlayer(targetName);
    if (!player) {
      u.send("Player not found.");
      return;
    }

    const app = await findAppByPlayer(player.id);
    if (!app) {
      u.send(`${player.data?.name || player.id} has no chargen application.`);
      return;
    }

    const reviewerName = (u.me.name || u.me.id);
    const now = Date.now();
    const updated = {
      ...app,
      data: {
        ...app.data,
        status: "rejected" as const,
        reviewedAt: now,
        reviewedBy: reviewerName,
        notes: reason,
      },
    };
    await chargenApps.update({ id: app.id }, updated);
    await chargenHooks.emit("chargen:rejected", updated);

    const playerName = (player.data?.name as string) || player.id;
    u.send(`${playerName}'s application has been rejected.`);

    // Send in-game mail to the player
    const mailMsg: IMail = {
      id: `cgmail-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      from: u.me.id,
      to: [player.id],
      subject: "Your Character Application",
      message: `Your character application has been rejected.\n\nReason: ${reason}\n\nPlease update your application with +chargen/set and resubmit with +chargen/submit.`,
      date: now,
    };
    await mail.create(mailMsg);
  },
});
