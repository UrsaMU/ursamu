import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { mockU, mockPlayer } from "./helpers/mockU.ts";
import { notesExec } from "../src/commands/notes.ts";
import type { CofdNotes } from "../src/notes/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function wireDb(player: { id: string; state: Record<string, unknown> }) {
  return (id: string, op: string, data: Record<string, unknown>) => {
    if (id !== player.id) return Promise.resolve();
    if (op === "$set" && data["data.cofd_notes"] !== undefined) {
      player.state.cofd_notes = data["data.cofd_notes"];
    }
    return Promise.resolve();
  };
}

describe("+notes", OPTS, () => {
  it("/add creates a public note on self", async () => {
    const me = mockPlayer({ id: "1", name: "Alice" });
    const u = mockU({ me, args: ["add", "Backstory=Born in a small town."] });
    u.db.modify = wireDb(me);

    await notesExec(u);

    assertStringIncludes(u._sent.join("\n"), "added on Alice");
    const notes = me.state.cofd_notes as CofdNotes;
    assertEquals(notes.backstory.name, "Backstory");
    assertEquals(notes.backstory.visibility, "public");
    assertEquals(notes.backstory.text, "Born in a small town.");
  });

  it("/add refuses duplicate name", async () => {
    const me = mockPlayer({ id: "1", name: "Alice", state: { cofd_notes: { backstory: { name: "Backstory", text: "old", visibility: "public", createdAt: 1, updatedAt: 1, createdBy: "1" } } } });
    const u = mockU({ me, args: ["add", "Backstory=newer"] });
    u.db.modify = wireDb(me);

    await notesExec(u);
    assertStringIncludes(u._sent.join("\n"), "already exists");
  });

  it("/edit overwrites an existing note", async () => {
    const me = mockPlayer({ id: "1", name: "Alice", state: { cofd_notes: { backstory: { name: "Backstory", text: "old", visibility: "private", createdAt: 1, updatedAt: 1, createdBy: "1" } } } });
    const u = mockU({ me, args: ["edit", "Backstory=newer"] });
    u.db.modify = wireDb(me);

    await notesExec(u);
    const notes = me.state.cofd_notes as CofdNotes;
    assertEquals(notes.backstory.text, "newer");
    assertEquals(notes.backstory.visibility, "private"); // preserved
  });

  it("private notes are hidden from non-staff non-owner viewers", async () => {
    const owner = mockPlayer({ id: "owner", name: "Alice", state: { cofd_notes: { secret: { name: "Secret", text: "shh", visibility: "private", createdAt: 1, updatedAt: 1, createdBy: "owner" } } } });
    const viewer = mockPlayer({ id: "viewer", name: "Bob" });
    const u = mockU({ me: viewer, args: ["", "Alice/Secret"] });
    u.util.target = () => Promise.resolve(owner);
    u.util.displayName = (o) => o.name ?? "?";

    await notesExec(u);
    assertStringIncludes(u._sent.join("\n"), "No such note");
  });

  it("private notes are visible to staff", async () => {
    const owner = mockPlayer({ id: "owner", name: "Alice", state: { cofd_notes: { secret: { name: "Secret", text: "shh", visibility: "private", createdAt: 1, updatedAt: 1, createdBy: "owner" } } } });
    const staff = mockPlayer({ id: "wiz", name: "Wiz", flags: new Set(["player", "connected", "admin"]) });
    const u = mockU({ me: staff, args: ["", "Alice/Secret"] });
    u.util.target = () => Promise.resolve(owner);
    u.util.displayName = (o) => o.name ?? "?";

    await notesExec(u);
    assertStringIncludes(u._sent.join("\n"), "shh");
  });

  it("/priv flips visibility", async () => {
    const me = mockPlayer({ id: "1", name: "Alice", state: { cofd_notes: { backstory: { name: "Backstory", text: "x", visibility: "public", createdAt: 1, updatedAt: 1, createdBy: "1" } } } });
    const u = mockU({ me, args: ["priv", "Backstory=private"] });
    u.db.modify = wireDb(me);

    await notesExec(u);
    const notes = me.state.cofd_notes as CofdNotes;
    assertEquals(notes.backstory.visibility, "private");
  });

  it("/del removes a note", async () => {
    const me = mockPlayer({ id: "1", name: "Alice", state: { cofd_notes: { backstory: { name: "Backstory", text: "x", visibility: "public", createdAt: 1, updatedAt: 1, createdBy: "1" } } } });
    const u = mockU({ me, args: ["del", "Backstory"] });
    u.db.modify = wireDb(me);

    await notesExec(u);
    const notes = me.state.cofd_notes as CofdNotes;
    assertEquals(notes.backstory, undefined);
  });

  it("rejects oversize text", async () => {
    const me = mockPlayer({ id: "1", name: "Alice" });
    const u = mockU({ me, args: ["add", "Big=" + "x".repeat(8001)] });
    u.db.modify = wireDb(me);

    await notesExec(u);
    assertStringIncludes(u._sent.join("\n"), "<= 8000");
  });

  it("rejects bad name characters", async () => {
    const me = mockPlayer({ id: "1", name: "Alice" });
    const u = mockU({ me, args: ["add", "Bad!Name=text"] });
    u.db.modify = wireDb(me);

    await notesExec(u);
    assertStringIncludes(u._sent.join("\n"), "letters, numbers");
  });

  it("staff can edit another player's note via player/name", async () => {
    const owner = mockPlayer({ id: "owner", name: "Alice" });
    const staff = mockPlayer({ id: "wiz", name: "Wiz", flags: new Set(["player", "connected", "admin"]) });
    const u = mockU({ me: staff, args: ["add", "Alice/StaffNote=From staff."] });
    u.util.target = () => Promise.resolve(owner);
    u.util.displayName = (o) => o.name ?? "?";
    u.canEdit = () => Promise.resolve(true);
    u.db.modify = wireDb(owner);

    await notesExec(u);
    const notes = owner.state.cofd_notes as CofdNotes;
    assertEquals(notes.staffnote.name, "StaffNote");
    assertEquals(notes.staffnote.createdBy, "wiz");
  });

  it("non-staff cannot edit another player's note (canEdit denies)", async () => {
    const owner = mockPlayer({ id: "owner", name: "Alice" });
    const me = mockPlayer({ id: "rando", name: "Bob" });
    const u = mockU({ me, args: ["add", "Alice/SnoopNote=mine"], canEditResult: false });
    u.util.target = () => Promise.resolve(owner);
    u.util.displayName = (o) => o.name ?? "?";

    await notesExec(u);
    assertStringIncludes(u._sent.join("\n"), "Permission denied");
  });
});
