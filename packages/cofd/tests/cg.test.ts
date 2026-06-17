import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { mockU, mockPlayer } from "./helpers/mockU.ts";
import { cgExec, sheetExec, sheetSetExec } from "../commands.ts";
import type { CofdCgState } from "../cg.ts";

describe("Chronicles of Darkness Guided Character Generation", { sanitizeResources: false, sanitizeOps: false }, () => {
  it("runs the full Mortal character generation lifecycle successfully", async () => {
    const me = mockPlayer({ id: "1", name: "Arthur" });
    
    // Set up mock database to auto-mutate the player state when modified
    const u = mockU({
      me,
      dbModify: (_id, op, data: unknown) => {
        const d = data as Record<string, unknown>;
        if (op === "$set") {
          if (d["data.cofd_cg"] !== undefined) {
            me.state.cofd_cg = d["data.cofd_cg"];
          }
          if (d["data.cofd"] !== undefined) {
            me.state.cofd = d["data.cofd"];
          }
        } else if (op === "$unset") {
          if ("data.cofd_cg" in d) {
            delete me.state.cofd_cg;
          }
        }
        return Promise.resolve();
      }
    });

    // 1. Initially, player has no sheet or cg state. Viewing sheet is blocked.
    u.cmd.args = [""];
    u._sent.length = 0;
    await sheetExec(u);
    assertStringIncludes(u._sent.join("\n"), "does not have an approved character sheet");

    // Try modifying via +sheet/set - blocked
    u.cmd.args = ["Strength", "4"];
    u._sent.length = 0;
    await sheetSetExec(u);
    assertStringIncludes(u._sent.join("\n"), "Sheet modifications are blocked until character generation is completed");

    // 2. Start character generation
    u.cmd.args = ["", ""];
    u._sent.length = 0;
    await cgExec(u);
    // Stage-1 instructions render the welcome line + the STAGE 1 header.
    assertStringIncludes(u._sent.join("\n").toLowerCase(), "welcome");
    assertStringIncludes(u._sent.join("\n"), "STAGE 1");

    // Try to submit without setting anything (should fail validation)
    u.cmd.args = ["submit", ""];
    u._sent.length = 0;
    await cgExec(u);
    assertStringIncludes(u._sent.join("\n"), "Concept cannot be empty");

    // Set Concept, Virtue, Vice
    u.cmd.args = ["set", "concept=Modern Knight"];
    u._sent.length = 0;
    await cgExec(u);
    u.cmd.args = ["set", "virtue=Just"];
    u._sent.length = 0;
    await cgExec(u);
    u.cmd.args = ["set", "vice=Greedy"];
    u._sent.length = 0;
    await cgExec(u);

    // Submit Stage 1 -> moves to Stage 2
    u.cmd.args = ["submit", ""];
    u._sent.length = 0;
    await cgExec(u);
    assertStringIncludes(u._sent.join("\n"), "Stage Advanced: Stage 2");
    
    const cgState = me.state.cofd_cg as CofdCgState;
    assertEquals(cgState.stage, 2);
    assertEquals(cgState.sheet.concept, "Modern Knight");

    // Stage 2: Supernatural Template (Mortal by default)
    u.cmd.args = ["submit", ""];
    u._sent.length = 0;
    await cgExec(u);
    assertStringIncludes(u._sent.join("\n"), "Stage Advanced: Stage 3");

    // Stage 3: Template Specifics (Mortal has none, so validation automatically passes)
    u.cmd.args = ["submit", ""];
    u._sent.length = 0;
    await cgExec(u);
    assertStringIncludes(u._sent.join("\n"), "Stage Advanced: Stage 4");

    // Stage 4: Attributes Allocation
    // Must sum extra dots to {5, 4, 3}
    // Set Mental to 5 extra: Intelligence=3 (+2), Wits=3 (+2), Resolve=2 (+1)
    u.cmd.args = ["set", "Intelligence=3"];
    u._sent.length = 0;
    await cgExec(u);
    u.cmd.args = ["set", "Wits=3"];
    u._sent.length = 0;
    await cgExec(u);
    u.cmd.args = ["set", "Resolve=2"];
    u._sent.length = 0;
    await cgExec(u);

    // Set Physical to 4 extra: Strength=3 (+2), Dexterity=2 (+1), Stamina=2 (+1)
    u.cmd.args = ["set", "Strength=3"];
    u._sent.length = 0;
    await cgExec(u);
    u.cmd.args = ["set", "Dexterity=2"];
    u._sent.length = 0;
    await cgExec(u);
    u.cmd.args = ["set", "Stamina=2"];
    u._sent.length = 0;
    await cgExec(u);

    // Set Social to 3 extra: Presence=2 (+1), Manipulation=2 (+1), Composure=2 (+1)
    u.cmd.args = ["set", "Presence=2"];
    u._sent.length = 0;
    await cgExec(u);
    u.cmd.args = ["set", "Manipulation=2"];
    u._sent.length = 0;
    await cgExec(u);
    u.cmd.args = ["set", "Composure=2"];
    u._sent.length = 0;
    await cgExec(u);

    // Submit Stage 4 -> moves to Stage 5
    u.cmd.args = ["submit", ""];
    u._sent.length = 0;
    await cgExec(u);
    assertStringIncludes(u._sent.join("\n"), "Stage Advanced: Stage 5");

    // Stage 5: Skills Allocation
    // Must assign skills to sum to {11, 9, 7}
    // Set Mental Skills to 11 dots: Academics=5, Computer=5, Investigation=1
    u.cmd.args = ["set", "Academics=5"];
    u._sent.length = 0;
    await cgExec(u);
    u.cmd.args = ["set", "Computer=5"];
    u._sent.length = 0;
    await cgExec(u);
    u.cmd.args = ["set", "Investigation=1"];
    u._sent.length = 0;
    await cgExec(u);

    // Set Physical Skills to 9 dots: Athletics=4, Brawl=4, Stealth=1
    u.cmd.args = ["set", "Athletics=4"];
    u._sent.length = 0;
    await cgExec(u);
    u.cmd.args = ["set", "Brawl=4"];
    u._sent.length = 0;
    await cgExec(u);
    u.cmd.args = ["set", "Stealth=1"];
    u._sent.length = 0;
    await cgExec(u);

    // Set Social Skills to 7 dots: Persuasion=3, Empathy=3, Socialize=1
    u.cmd.args = ["set", "Persuasion=3"];
    u._sent.length = 0;
    await cgExec(u);
    u.cmd.args = ["set", "Empathy=3"];
    u._sent.length = 0;
    await cgExec(u);
    u.cmd.args = ["set", "Socialize=1"];
    u._sent.length = 0;
    await cgExec(u);

    // Submit Stage 5 -> moves to Stage 6
    u.cmd.args = ["submit", ""];
    u._sent.length = 0;
    await cgExec(u);
    assertStringIncludes(u._sent.join("\n"), "Stage Advanced: Stage 6");

    // Stage 6: Supernatural Powers (Mortal starting powers dots = 0, but must allocate 7 merits)
    u.cmd.args = ["set", "giant=4"];
    u._sent.length = 0;
    await cgExec(u);
    assertStringIncludes(u._sent.join("\n"), "Successfully set cg trait 'giant' to '4'");

    u.cmd.args = ["set", "mentor(eldritch master)=3"];
    u._sent.length = 0;
    await cgExec(u);
    assertStringIncludes(
      u._sent.join("\n"),
      "Successfully set cg trait 'mentor(eldritch master)' to '3'",
    );

    // Submit Stage 6 -> files a CGEN job, awaits staff approval
    u.cmd.args = ["submit", ""];
    u._sent.length = 0;
    await cgExec(u);
    assertStringIncludes(u._sent.join("\n"), "Character Generation: Submitted");
    assertStringIncludes(u._sent.join("\n"), "job #");

    // CG state persists with the job number; no active sheet until +approve lands
    const submitted = me.state.cofd_cg as CofdCgState;
    assertEquals(typeof submitted.submittedJob, "number");
    assertEquals(me.state.cofd, undefined);

    // Sheet captured in CG state still matches what was built
    assertEquals(submitted.sheet.concept, "Modern Knight");
    assertEquals(submitted.sheet.attributes.strength, 3);
    assertEquals(submitted.sheet.skills.academics, 5);
  });

  it("handles resetting and back switches correctly", async () => {
    const me = mockPlayer({ id: "1", name: "Arthur" });
    const u = mockU({
      me,
      dbModify: (_id, op, data: unknown) => {
        const d = data as Record<string, unknown>;
        if (op === "$set") {
          if (d["data.cofd_cg"] !== undefined) {
            me.state.cofd_cg = d["data.cofd_cg"];
          }
        }
        return Promise.resolve();
      }
    });

    // Start cg
    u.cmd.args = ["", ""];
    u._sent.length = 0;
    await cgExec(u);
    u.cmd.args = ["set", "concept=Modern Knight"];
    u._sent.length = 0;
    await cgExec(u);
    const state = me.state.cofd_cg as CofdCgState;
    assertEquals(state.sheet.concept, "Modern Knight");

    // Back switch (should not do anything at stage 1)
    u.cmd.args = ["back", ""];
    u._sent.length = 0;
    await cgExec(u);
    assertStringIncludes(u._sent.join("\n"), "already at the first stage");

    // Reset cg
    u.cmd.args = ["reset", ""];
    u._sent.length = 0;
    await cgExec(u);
    assertStringIncludes(u._sent.join("\n"), "reset to a fresh Mortal sheet");
    const resetState = me.state.cofd_cg as CofdCgState;
    assertEquals(resetState.sheet.concept, "Unknown");
    assertEquals(resetState.stage, 1);
  });
});
