// +cg command implementation: guided 6-stage character creation.

import {
  header,
  footer,
  type IUrsamuSDK,
  type IDBObj,
} from "@ursamu/ursamu";
import {
  initCgState,
  getStageInstructions,
  validateCurrentStage,
  updateCgState,
  maxStageFor,
  addGiftFacet,
  removeGiftFacet,
  addRite,
  removeRite,
  addContract,
  removeContract,
  submitCgDraft,
  wipeCharacter,
  type CofdCgState,
} from "../chargen/index.ts";
import { renderCgList } from "../chargen/list.ts";
import { renderInfo } from "../info/index.ts";
import { wipeExec } from "./wipe.ts";
import { SIGHT_FLAGS } from "../support/sight.ts";

/** Staff may still use +cg (review / testing). */
function isStaff(actor: IDBObj): boolean {
  const f = actor.flags;
  if (!f) return false;
  return (
    f.has("staff") ||
    f.has("storyteller") ||
    f.has("wizard") ||
    f.has("admin") ||
    f.has("superuser")
  );
}

/**
 * Approved = chargen closed for non-staff.
 * Flag is canonical; live sheet (state.cofd) is legacy fallback.
 */
function isApproved(actor: IDBObj): boolean {
  if (actor.flags?.has("approved")) return true;
  return !!actor.state?.cofd;
}

export async function cgExec(u: IUrsamuSDK) {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  // stripSubs first: chargen fields (name, concept, etc.) are persisted to
  // cofd_cg and later copied to the live sheet via +approve. Without this,
  // a player can plant %c color codes in their own concept/description.
  const rawArg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  // Staff full wipe of another (or self) character bit
  if (sw === "wipe") {
    return await wipeExec(u);
  }

  // Find target - self only for character generation
  const target = u.me;

  // /list and /info are always available (catalog browse), including
  // approved players and web clients. Do not gate or redirect these.
  if (sw === "list") {
    const cg = target.state?.cofd_cg as CofdCgState | undefined;
    const live = target.state?.cofd as CofdCgState["sheet"] | undefined;
    const sheet = cg?.sheet ?? live ?? null;
    u.send(renderCgList(rawArg, sheet));
    return;
  }
  if (sw === "info") {
    u.send(renderInfo(rawArg));
    return;
  }

  // Approved non-staff: no stepper (+cg, /set, /submit, /reset).
  // Web play may run +cg in the terminal; Character tab is optional.
  if (isApproved(target) && !isStaff(u.me)) {
    u.send(
      "Your character is already %chapproved%cn. " +
        "Chargen is closed. Contact staff if you need a rework.\n" +
        "Browse catalogs anytime: %ch+cg/list%cn, %ch+info%cn.",
    );
    return;
  }

  // Load existing character generation state
  let cgState = target.state?.cofd_cg as CofdCgState | undefined;

  // Reset switch — self only. Staff wiping others: +cg/wipe.
  // Staff may still reset themselves when approved (blocked for
  // non-staff above).
  if (sw === "reset" || sw === "restart") {
    const result = await wipeCharacter({
      playerId: target.id,
      staffId: u.me.id,
      staffName: u.util.displayName(u.me, u.me),
      startDraft: true,
      notify: false,
    });
    if (!result.ok) {
      // Nothing to wipe — still seed a draft
      cgState = initCgState();
      await u.db.modify(target.id, "$set", {
        "data.cofd_cg": cgState,
      });
    } else {
      cgState = initCgState();
      if (target.state) {
        delete target.state.cofd;
        target.state.cofd_cg = cgState;
      }
      target.flags?.delete("approved");
      for (const f of SIGHT_FLAGS) target.flags?.delete(f);
    }
    u.send(await header("Character Generation: Reset"));
    u.send(
      "Your character generation state has been reset " +
        "to a fresh Mortal sheet." +
        (result.ok && result.wasApproved
          ? " Approval cleared."
          : ""),
    );
    u.send(
      await getStageInstructions(
        u.util.displayName(target, u.me),
        cgState!,
      ),
    );
    return;
  }

  // If no active cg session exists
  if (!cgState) {
    // If they already have an approved sheet, confirm if they want to reset
    if (target.state?.cofd) {
      u.send(
        "You already have an approved character sheet. " +
          "If you want to start over, run '%ch+cg/reset%cn'. " +
          "%chWARNING:%cn This will immediately delete your approved sheet.",
      );
      return;
    }
    // Start fresh cg session
    cgState = initCgState();
    await u.db.modify(target.id, "$set", { "data.cofd_cg": cgState });
    u.send(await header("Character Generation: Started"));
    u.send("Welcome to Chronicles of Darkness Character Generation!");
    // getStageInstructions already ends with a footer.
    u.send(
      await getStageInstructions(
        u.util.displayName(target, u.me),
        cgState,
      ),
    );
    return;
  }

  // Handle +cg/set
  if (sw === "set") {
    if (!rawArg.includes("=")) {
      u.send("Usage: +cg/set <trait>=<value> (e.g., +cg/set Concept=Street Detective, +cg/set Strength=3)");
      return;
    }

    const eqIndex = rawArg.indexOf("=");
    const key = rawArg.slice(0, eqIndex).trim();
    const value = rawArg.slice(eqIndex + 1).trim();

    try {
      cgState = updateCgState(cgState, key, value);
      await u.db.modify(target.id, "$set", { "data.cofd_cg": cgState });
      u.send(`Successfully set cg trait '${key}' to '${value}'.`);
      // Re-send status and instructions for the stage
      u.send(await getStageInstructions(u.util.displayName(target, u.me), cgState));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      u.send(`%crError:%cn ${msg}`);
    }
    return;
  }

  // Handle Werewolf Stage-8 Gift/Rite selection.
  if (sw === "gift" || sw === "ungift" || sw === "rite" || sw === "unrite") {
    if (cgState.stage !== 8) {
      u.send("%crGifts and Rites are chosen in Stage 8.%cn Advance there with %ch+cg/next%cn.");
      return;
    }
    try {
      if (sw === "gift")        cgState = addGiftFacet(cgState, rawArg);
      else if (sw === "ungift") cgState = removeGiftFacet(cgState, rawArg);
      else if (sw === "rite")   cgState = addRite(cgState, rawArg);
      else                      cgState = removeRite(cgState, rawArg);
      await u.db.modify(target.id, "$set", { "data.cofd_cg": cgState });
      const verb = sw === "gift" || sw === "rite" ? "Added" : "Removed";
      const what = sw === "gift" || sw === "ungift" ? "Gift facet" : "Rite";
      u.send(`${verb} ${what} '${rawArg}'.`);
      u.send(await getStageInstructions(u.util.displayName(target, u.me), cgState));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      u.send(`%crError:%cn ${msg}`);
    }
    return;
  }

  // Handle Changeling Stage-7 Contract selection.
  if (sw === "contract" || sw === "uncontract") {
    if (cgState.stage !== 7 || cgState.sheet.template !== "changeling") {
      u.send("%crContracts are chosen in Stage 7 of Changeling chargen.%cn");
      return;
    }
    try {
      cgState = sw === "contract" ? addContract(cgState, rawArg) : removeContract(cgState, rawArg);
      await u.db.modify(target.id, "$set", { "data.cofd_cg": cgState });
      u.send(`${sw === "contract" ? "Added" : "Removed"} Contract '${rawArg}'.`);
      u.send(await getStageInstructions(u.util.displayName(target, u.me), cgState));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      u.send(`%crError:%cn ${msg}`);
    }
    return;
  }

  // Handle +cg/back
  if (sw === "back") {
    if (cgState.stage > 1) {
      cgState.stage -= 1;
      await u.db.modify(target.id, "$set", { "data.cofd_cg": cgState });
      u.send(await getStageInstructions(u.util.displayName(target, u.me), cgState));
    } else {
      u.send("You are already at the first stage.");
    }
    return;
  }

  // Handle +cg/next or +cg/submit (advance stage or complete)
  if (sw === "submit" || sw === "next") {
    // Validate stage
    const valResult = validateCurrentStage(cgState);
    if (!valResult.valid) {
      u.send(`%crValidation Error:%cn ${valResult.error}`);
      return;
    }

    const sheet = cgState.sheet;
    const maxStage = maxStageFor(sheet.template);

    if (cgState.stage === maxStage) {
      const submitterName = u.util.displayName(target, u.me);
      const result = await submitCgDraft({
        actorId: target.id,
        actorName: submitterName,
        cg: cgState,
      });
      if (!result.ok) {
        u.send(`%cr${result.error}%cn`);
        return;
      }
      cgState = result.cg;
      await u.db.modify(target.id, "$set", {
        "data.cofd_cg": cgState,
      });
      const number = result.jobNumber;

      const lines: string[] = [];
      lines.push(await header("Character Generation: Submitted"));
      lines.push(
        `Your character %ch${submitterName}%cn is ready for ` +
          `staff review (job #${number}).`,
      );
      lines.push(``);
      lines.push(`%chStaff will:%cn`);
      lines.push(`  +sheet ${submitterName}   review your draft`);
      lines.push(`  +approve ${submitterName} make it live`);
      lines.push(
        `  +deny ${submitterName}=…  return it with notes`,
      );
      lines.push(``);
      lines.push(`%chReminders:%cn`);
      lines.push(
        `  - Background: %ch+notes/add Backstory=<text>%cn`,
      );
      lines.push(
        `  - Merit detail (Allies, Contacts, …): ` +
          `%ch+notes/add <Merit>=<details>%cn`,
      );
      lines.push(``);
      lines.push(
        `%ch+cg%cn shows status; %ch+cg/reset%cn discards ` +
          `the draft.`,
      );
      lines.push(await footer());
      u.send(lines.join("\n"));
    } else {
      // Advance stage
      cgState.stage += 1;
      await u.db.modify(target.id, "$set", { "data.cofd_cg": cgState });

      u.send(await header(`Stage Advanced: Stage ${cgState.stage}`));
      u.send(
        "Successfully submitted and validated your choices " +
          "for the previous stage.",
      );
      // getStageInstructions already ends with a footer.
      u.send(
        await getStageInstructions(
          u.util.displayName(target, u.me),
          cgState,
        ),
      );
    }
    return;
  }

  // Default +cg command shows current instructions/status
  u.send(await getStageInstructions(u.util.displayName(target, u.me), cgState));
}
