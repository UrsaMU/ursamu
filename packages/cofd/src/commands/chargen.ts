// +cg command implementation: guided 6-stage character creation.

import {
  header,
  footer,
  type IUrsamuSDK,
  type IDBObj,
} from "@ursamu/ursamu";
import {
  getNextJobNumber,
  jobs,
  jobHooks,
  type IJob,
} from "@ursamu/jobs";
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
  type CofdCgState,
} from "../chargen/index.ts";
import { renderCgList } from "../chargen/list.ts";
import { renderInfo } from "../info/index.ts";
import { formatSheet } from "../sheet/index.ts";

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

  // Find target - self only for character generation
  const target = u.me;

  // Approved non-staff: no +cg (including /list, /set, /submit, /reset).
  if (isApproved(target) && !isStaff(u.me)) {
    u.send(
      "Your character is already %chapproved%cn. " +
        "Chargen is closed. Contact staff if you need a rework.",
    );
    return;
  }

  // List switch — filtered by active cg sheet (or live sheet / blank draft).
  // /list with no arg shows the index of topics available to this sheet.
  if (sw === "list") {
    const cg = target.state?.cofd_cg as CofdCgState | undefined;
    const live = target.state?.cofd as CofdCgState["sheet"] | undefined;
    const sheet = cg?.sheet ?? live ?? null;
    u.send(renderCgList(rawArg, sheet));
    return;
  }

  // Info switch — detail lookup for a named merit, condition, tilt, dread
  // power, virtue, vice, seeming, kith, or court.
  if (sw === "info") {
    u.send(renderInfo(rawArg));
    return;
  }

  // Load existing character generation state
  let cgState = target.state?.cofd_cg as CofdCgState | undefined;

  // Reset switch — staff only once approved (non-staff blocked above).
  if (sw === "reset" || sw === "restart") {
    cgState = initCgState();
    await u.db.modify(target.id, "$set", { "data.cofd_cg": cgState });
    await u.db.modify(target.id, "$unset", { "data.cofd": "" });
    if (target.flags?.has("approved") && u.setFlags) {
      await u.setFlags(target.id, "!approved");
      target.flags.delete("approved");
    }
    u.send(await header("Character Generation: Reset"));
    u.send(
      "Your character generation state has been reset " +
        "to a fresh Mortal sheet.",
    );
    // getStageInstructions already ends with a footer.
    u.send(
      await getStageInstructions(
        u.util.displayName(target, u.me),
        cgState,
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
      if (!sheet.specialties) sheet.specialties = {};

      const submitterName = u.util.displayName(target, u.me);
      const now = Date.now();
      const template = (sheet.template ?? "Mortal").toString();
      const concept = (sheet.concept ?? "(none)").toString();
      const formatted = await formatSheet(submitterName, target.id, sheet);
      const snapshot = [
        `Character: ${submitterName}`,
        `Template:  ${template}`,
        `Concept:   ${concept}`,
        ``,
        `Sheet snapshot:`,
        formatted,
        ``,
        `Raw JSON snapshot:`,
        "```json",
        JSON.stringify(sheet, null, 2),
        "```",
      ].join("\n");

      // Resolve existing open CGEN job (by number or player).
      // Coerce numbers and strip # on player ids — DB may round-trip
      // either form depending on adapter / older writes.
      const bareId = String(target.id).replace(/^#/, "");
      let existing: IJob | null = null;
      try {
        const all = await jobs.find({});
        if (cgState.submittedJob != null) {
          const want = Number(cgState.submittedJob);
          existing = all.find(
            (j) => Number(j.number) === want,
          ) ?? null;
        }
        if (
          !existing ||
          (existing.status !== "new" && existing.status !== "open")
        ) {
          existing = all
            .filter((j) => {
              const by = String(j.submittedBy ?? "")
                .replace(/^#/, "");
              return (
                by === bareId &&
                String(j.bucket ?? "").toUpperCase() ===
                  "CGEN" &&
                (j.status === "new" || j.status === "open")
              );
            })
            .sort(
              (a, b) => Number(b.number) - Number(a.number),
            )[0] ?? null;
        }
      } catch {
        existing = null;
      }

      // Already pending staff review (submitted, not denied).
      if (
        existing &&
        (existing.status === "new" || existing.status === "open") &&
        cgState.isSubmitted
      ) {
        u.send(
          `%crYou already have CGEN job #${existing.number} ` +
            `pending staff review.%cn`,
        );
        return;
      }

      let number: number;
      if (
        existing &&
        (existing.status === "new" || existing.status === "open")
      ) {
        // Resubmit after deny: refresh snapshot, comment, keep open.
        number = existing.number;
        const resubComment = {
          id: `jc-${now}-resub`,
          authorId: target.id,
          authorName: submitterName,
          text: "Player resubmitted after revision.",
          timestamp: now,
          published: true,
          staffOnly: false,
        };
        existing.description = snapshot;
        existing.status = "open";
        existing.updatedAt = now;
        existing.comments = [
          ...existing.comments,
          resubComment,
        ];
        await jobs.update({ id: existing.id }, existing);
        // Mirror +request/comment → Jobs BBS board reply.
        try {
          await jobHooks.emit(
            "job:commented",
            existing,
            resubComment,
          );
        } catch (e: unknown) {
          console.error("[cofd] job:commented (resub):", e);
        }
      } else {
        number = await getNextJobNumber();
        const job: IJob = {
          id: `job-${number}`,
          number,
          title: `Chargen: ${submitterName} (${template})`,
          bucket: "CGEN",
          status: "new",
          submittedBy: target.id,
          submitterName,
          description: snapshot,
          comments: [],
          createdAt: now,
          updatedAt: now,
        };
        await jobs.create(job);
        // Mirror +request → Jobs BBS board root post.
        try {
          await jobHooks.emit("job:created", job);
        } catch (e: unknown) {
          console.error("[cofd] job:created emit failed:", e);
        }
      }

      cgState.submittedJob = number;
      cgState.submittedAt = now;
      cgState.isSubmitted = true;
      await u.db.modify(target.id, "$set", {
        "data.cofd_cg": cgState,
      });

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
