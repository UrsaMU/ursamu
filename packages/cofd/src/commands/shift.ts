// +shift -- form / Mask / Chrysalis for CoFD templates.

import type { IUrsamuSDK, IDBObj } from "@ursamu/ursamu";
import {
  applyAnimalShift,
  applyMaskShift,
  findAnimal,
  hasChrysalis,
  isChangelingSheet,
} from "../form/index.ts";
import {
  getSeason,
  onMaskDownOpenWays,
  waysForRoom,
} from "../hedge/index.ts";
import type { CofdSheet } from "../stats/index.ts";
import {
  announce,
  getSheet,
  persistSheet,
  resolveActor,
  splitForTarget,
  syncLookShortDesc,
} from "./shift_helpers.ts";
import {
  shiftInfo,
  shiftList,
  shiftStatus,
} from "./shift_status.ts";

async function applyAndSave(
  u: IUrsamuSDK,
  actor: IDBObj,
  result: {
    ok: boolean;
    reason?: string;
    sheet?: CofdSheet;
    from?: string;
    to?: string;
    glamourSpent?: number;
    message?: string;
    notes?: string[];
  },
  key: string,
): Promise<void> {
  if (!result.ok || !result.sheet) {
    u.send(result.reason ?? "Cannot shift.");
    return;
  }
  let sheet = result.sheet;
  const notes = [...(result.notes ?? [])];

  // Mask down: open local hedgeways + Huntsman trail.
  if (key === "mien" && result.to === "mien") {
    const roomId = actor.location ?? u.here?.id ?? "";
    if (roomId) {
      const ways = (await waysForRoom(roomId)).filter(
        (w) => w.mortalRoomId === roomId,
      );
      const season = await getSeason();
      const gate = await onMaskDownOpenWays(
        sheet,
        ways,
        season,
        actor.id,
      );
      sheet = gate.sheet;
      // Replace generic trail stubs with live gate notes.
      const filtered = notes.filter(
        (n) =>
          !n.includes("Hedge gateways") &&
          !n.includes("trail for Huntsmen"),
      );
      notes.length = 0;
      notes.push(...filtered, ...gate.notes);
    }
  }

  await persistSheet(u, actor.id, sheet);
  await syncLookShortDesc(u, actor, sheet);
  const spent = result.glamourSpent ?? 0;
  const gLeft = sheet.energyCurrent ?? 0;
  const costLine = spent > 0
    ? `\n  Glamour -${spent} (now ${gLeft}).`
    : "";
  const extra = notes.map((n) => `  ${n}`).join("\n");
  u.send(
    `${result.message ?? "Shifted."}${costLine}` +
      (extra ? `\n${extra}` : ""),
  );
  announce(u, actor, result.from ?? "?", result.to ?? key);
}

async function shiftTo(
  u: IUrsamuSDK,
  actor: IDBObj,
  target: string,
): Promise<void> {
  const sheet = getSheet(actor);
  if (!sheet) {
    u.send("No approved character sheet.");
    return;
  }

  const key = target.toLowerCase().trim();
  if (!key) {
    await shiftStatus(u, actor);
    return;
  }

  if (!isChangelingSheet(sheet)) {
    if (sheet.template?.toLowerCase() === "werewolf") {
      u.send("Werewolf forms are not online yet.");
      return;
    }
    u.send("You have no forms to shift into.");
    return;
  }

  if (key === "mask" || key === "mien") {
    if (sheet.formState?.system === "animal") {
      await applyAndSave(u, actor, applyAnimalShift(sheet, key), key);
      return;
    }
    await applyAndSave(u, actor, applyMaskShift(sheet, key), key);
    return;
  }

  if (key === "human" || findAnimal(key)) {
    await applyAndSave(u, actor, applyAnimalShift(sheet, key), key);
    return;
  }

  u.send(
    `Unknown form '${target}'. Try +shift/list` +
      (hasChrysalis(sheet) ? " or +shift/list animals." : "."),
  );
}

export async function shiftExec(u: IUrsamuSDK): Promise<void> {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const restRaw = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
  const { body, target: forName } = splitForTarget(restRaw);

  if (sw === "list") {
    const actor = await resolveActor(u, forName);
    if (!actor) return;
    await shiftList(u, actor, body);
    return;
  }
  if (sw === "info") {
    await shiftInfo(u, body || forName);
    return;
  }
  if (sw) {
    const actor = await resolveActor(u, forName);
    if (!actor) return;
    await shiftTo(u, actor, sw);
    return;
  }
  if (body) {
    const actor = await resolveActor(u, forName);
    if (!actor) return;
    await shiftTo(u, actor, body);
    return;
  }
  const actor = await resolveActor(u, forName);
  if (!actor) return;
  await shiftStatus(u, actor);
}
