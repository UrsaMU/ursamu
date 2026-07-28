/**
 * Court: set Welcome Room (#5) description + Accept exit,
 * verify playerStart wiring (config set separately).
 */
import { dbojs } from "../packages/mush/src/world/dbobjs.ts";

const DESC = [
  "Smoke hangs low over wet cobbles. Gaslight pools in the fog,",
  "and blackthorn brambles claw the iron railings as if the city",
  "itself grew thorns overnight. Somewhere beyond the mist,",
  "carriage wheels and distant bells mark a London that never",
  "quite was — the Court of Miracles, where the Lost gather.",
  "",
  "Welcome to %chCourt of Miracles%cn, a %chChangeling: The Lost%cn",
  "game. Here the Mask hides what the Mien remembers: bargains,",
  "courts, and the long road home from Arcadia.",
  "",
  "%chBefore you step further, read and accept these terms:%cn",
  "",
  "  %ch1.%cn Treat people with basic respect. No harassment,",
  "     bigotry, or targeted cruelty — IC villainy is not a",
  "     free pass for OOC harm.",
  "  %ch2.%cn Keep OOC drama out of play. Use pages, jobs, or",
  "     staff if something needs sorting.",
  "  %ch3.%cn Consent matters. Check before dark or sexual play;",
  "     fade to black when asked.",
  "  %ch4.%cn No godmodding, metagaming, or spoiling others'",
  "     plots without agreement.",
  "  %ch5.%cn Staff rulings stand. If you disagree, raise it",
  "     calmly — do not derail the scene.",
  "  %ch6.%cn This is a shared story. Leave the space better",
  "     than you found it.",
  "",
  "Type %ch%cyaccept%cn when you are ready to enter the city.",
].join("%r");

const room = await dbojs.queryOne({ id: "5" });
if (!room) {
  console.error("Room #5 missing");
  Deno.exit(1);
}

const flagSet = new Set(
  String(room.flags || "").split(/\s+/).filter(Boolean),
);
flagSet.add("room");
flagSet.add("safe");

await dbojs.modify({ id: "5" }, "$set", {
  flags: [...flagSet].join(" "),
  "data.name": "Welcome Room",
  "data.description": DESC,
} as never);

const exit = await dbojs.queryOne({ id: "6" });
if (!exit) {
  await dbojs.create({
    flags: "exit dark",
    location: "5",
    data: {
      name: "Accept;accept;yes;agree;enter",
      destination: "1",
      owner: "2",
    },
  } as never);
  console.log("created Accept exit");
} else {
  const eflags = new Set(
    String(exit.flags || "").split(/\s+/).filter(Boolean),
  );
  eflags.add("exit");
  eflags.add("dark");
  await dbojs.modify({ id: "6" }, "$set", {
    flags: [...eflags].join(" "),
    location: "5",
    "data.name": "Accept;accept;yes;agree;enter",
    "data.destination": "1",
  } as never);
  console.log("updated Accept exit #6");
}

const r = await dbojs.queryOne({ id: "5" });
const e = await dbojs.queryOne({ id: "6" });
console.log("room:", r?.data?.name, r?.flags);
console.log(
  "desc lines:",
  String(r?.data?.description || "").split("%r").length,
);
console.log(
  "exit:",
  e?.id,
  e?.flags,
  e?.data?.name,
  "->",
  e?.data?.destination,
);
console.log("--- preview ---");
console.log(
  String(r?.data?.description || "").replace(/%r/g, "\n"),
);
Deno.exit(0);