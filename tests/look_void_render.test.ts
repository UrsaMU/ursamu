/**
 * Render demo: "The Void" — exercises NAMEFORMAT/DESCFORMAT/CONFORMAT/EXITFORMAT
 * via real softcode against a fully-seeded room. Prints the captured look output.
 *
 * Demonstrates:
 *   - Multi-line description wrapped to 78 cols via softcode wrap()
 *   - Multiple players with role badges (Wizard / Admin / Player)
 *   - Things rendered in a separate "Objects" section
 *   - Exits with name;alias convention rendered as "[<alias>] <name>"
 */
import { dbojs, DBO } from "../src/services/Database/database.ts";
import { createNativeSDK } from "../src/services/SDK/index.ts";
import { execLook } from "../src/commands/look.ts";
import { hydrate } from "../src/utils/evaluateLock.ts";
import type { IDBObj } from "../src/@types/UrsamuSDK.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false, timeout: 20000 };

const ROOM   = "800200";
const ALICE  = "800201"; // viewer (won't appear in own Players list)
const DIABLE = "800202"; // admin
const MORPH  = "800203"; // wizard
const LYRA   = "800204"; // plain player
const ORB    = "800205"; // thing
const TOME   = "800206"; // thing
const E_NORTH  = "800207"; // exit  North;n
const E_DOOR   = "800208"; // exit  Crystal Door;cd;door
const E_PORTAL = "800209"; // exit  Portal;p

// execLook no longer inserts auto-spacing between sections — each format
// attribute controls its own surrounding whitespace via explicit %r.

// NAMEFORMAT — top border + newline. Using new `header()` softcode helper.
const NAMEFORMAT = `[header(%0)]%r`;

// DESCFORMAT — blank line, wrapped desc, blank line after.
const DESCFORMAT = `%r[wrap(%0,78)]%r%r`;

// ── CONFORMAT — two sub-sections (Players, Objects) iterated over %0 ─────────
//   For each id we switch on type(%i0): PLAYER builds a player row, THING
//   builds an object row, anything else evaluates to empty (suppressed by
//   filterbool-style switch default).
const PLAYER_ROW =
  `%b[ljust(name(%i0),22)]` +
  `[ljust(switch(1,hasflag(%i0,wizard),(Wizard),hasflag(%i0,admin),(Admin),(Player)),12)]` +
  `[rjust(default(%i0/IDLE,0),2)]s  ` +
  `[default(%i0/SHORT-DESC,)]`;

const OBJECT_ROW =
  `%b[ljust(name(%i0),22)][default(%i0/SHORT-DESC,)]`;

// Build filtered id lists into registers q0 (players) and q1 (things) first,
// then iter just those — keeps per-row %r separators clean.
const CONFORMAT =
  `[setq(0,squish(iter(%0,switch(type(%i0),PLAYER,%i0,))))]` +
  `[setq(1,squish(iter(%0,switch(type(%i0),THING,%i0,))))]` +
  `[divider(Players)]%r` +
  `[iter(%q0,${PLAYER_ROW},,%r)]%r` +
  `[divider(Objects)]%r` +
  `[iter(%q1,${OBJECT_ROW},,%r)]%r`;

// ── EXITFORMAT — "[<alias>] <name>" per exit, plus 78-char footer ────────────
//   name(%i0) returns "Crystal Door;cd;door" — before(...,;) is the
//   display name, after(...,;) is the alias list; before(after(...),;) is
//   the first alias.
// Each exit cell: "<alias> Name" padded to 25 cols (3 cells per 78-col row).
// `<` / `>` are literal; only `[` / `]` are softcode meta-characters here.
// After every 3rd item, emit %r to break the row.
const EXIT_CELL =
  `[ljust(<[before(after(name(%i0),;),;)]> [before(name(%i0),;)],25)]`;

// Explicit counter in %q9: inc each iter, emit %r every 3rd cell.
const EXITFORMAT =
  `[divider(Exits)]%r` +
  `[setq(9,0)]` +
  `[iter(%0,${EXIT_CELL}[setq(9,inc(%q9))][switch(mod(%q9,3),0,%r,)],,)]` +
  `[switch(mod(%q9,3),0,,%r)]` +
  `[footer()]`;

async function cleanup() {
  for (const id of [ROOM, ALICE, DIABLE, MORPH, LYRA, ORB, TOME, E_NORTH, E_DOOR, E_PORTAL]) {
    await dbojs.delete({ id }).catch(() => {});
  }
}

Deno.test("render demo: The Void (multi-player, objects, exits)", OPTS, async () => {
  await cleanup();

  const longDesc =
    "A featureless void, stretching endlessly in all directions. The very fabric " +
    "of reality seems thin here, as though one might step through into something " +
    "else entirely. A faint, pulsing hum emanates from somewhere beyond perception, " +
    "and motes of pale light drift past on currents that obey no physics you know.";

  await dbojs.create({
    id: ROOM,
    flags: "room",
    data: {
      name: "The Void",
      description: longDesc,
      attributes: [
        { name: "NAMEFORMAT", value: NAMEFORMAT, setter: ALICE, type: "attribute" },
        { name: "DESCFORMAT", value: DESCFORMAT, setter: ALICE, type: "attribute" },
        { name: "CONFORMAT",  value: CONFORMAT,  setter: ALICE, type: "attribute" },
        { name: "EXITFORMAT", value: EXITFORMAT, setter: ALICE, type: "attribute" },
      ],
    },
  });

  // Viewer
  await dbojs.create({ id: ALICE, flags: "player connected", data: { name: "Alice" }, location: ROOM });

  // Players — softcode `get` reads data[<lowercase>], so attrs are flat.
  await dbojs.create({
    id: DIABLE,
    flags: "player connected admin",
    data: { name: "Diablerie", "short-desc": "Some awesome dude!", "idle": "0" },
    location: ROOM,
  });
  await dbojs.create({
    id: MORPH,
    flags: "player connected wizard",
    data: { name: "Morphic", "short-desc": "Cloaked in shifting shadow.", "idle": "12" },
    location: ROOM,
  });
  await dbojs.create({
    id: LYRA,
    flags: "player connected",
    data: { name: "Lyra", "short-desc": "Tall, with a wary stance.", "idle": "3" },
    location: ROOM,
  });

  // Objects
  await dbojs.create({
    id: ORB,
    flags: "thing",
    data: { name: "A glowing orb", "short-desc": "humming softly." },
    location: ROOM,
  });
  await dbojs.create({
    id: TOME,
    flags: "thing",
    data: { name: "A weathered tome", "short-desc": "bound in cracked leather." },
    location: ROOM,
  });

  // Exits with name;alias[;alias...]
  await dbojs.create({ id: E_NORTH,  flags: "exit", data: { name: "North;n" },             location: ROOM });
  await dbojs.create({ id: E_DOOR,   flags: "exit", data: { name: "Crystal Door;cd;door" }, location: ROOM });
  await dbojs.create({ id: E_PORTAL, flags: "exit", data: { name: "Portal;p" },            location: ROOM });

  const u = await createNativeSDK("void-sock", ALICE, { name: "look", original: "look", args: [""], switches: [] });
  const children = await dbojs.find({ location: ROOM });
  (u.here as unknown as { contents: IDBObj[] }).contents = children
    .filter((c) => c.id !== ALICE)
    .map((c) => hydrate(c));

  const sent: string[] = [];
  u.send = (m: string) => { sent.push(m); };
  (u.here as unknown as { broadcast: (m: string) => void }).broadcast = () => {};

  await execLook(u);

  const rendered = sent.join("");
  const stripped = rendered
    .replace(/%c[a-z]/gi, "")
    .replace(/%[rR]/g, "\n")
    .replace(/%b/g, " ")
    .replace(/%t/g, "\t");

  console.log("\n===== RENDERED =====");
  console.log(stripped);
  console.log("===== END =====\n");

  await cleanup();
  await DBO.close();
});
