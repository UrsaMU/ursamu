import { createEncounter, addParticipant, encounterDb } from "../src/combat/encounter.ts";
import { turnExec } from "../src/commands/turn.ts";
import { mockU, MockObjectStore } from "./helpers/mockU.ts";
import { defaultSheet } from "../src/stats/index.ts";

const store = new MockObjectStore();
const obj = store.create({ id: "pc1", name: "Alice", flags: new Set(["player","connected"]), state: { cofd: defaultSheet() } });
// deno-lint-ignore no-explicit-any
(obj as any).id = "pc1";
// deno-lint-ignore no-explicit-any
(store as any).store.delete(obj.id);
// deno-lint-ignore no-explicit-any
(store as any).store.set("pc1", obj);

const u = mockU({ objectStore: store });
// deno-lint-ignore no-explicit-any
(u as any).me = obj;
// deno-lint-ignore no-explicit-any
(u as any).here = { id: "room-x", broadcast: (m: string) => console.log("BCAST:", m) };

const enc = await createEncounter("room-x");
await addParticipant(enc.id, obj);
// deno-lint-ignore no-explicit-any
const fresh = await encounterDb.findOne({ id: enc.id } as any);
console.log("PARTS:", fresh!.participants.map((p) => ({ actorId: p.actorId, name: p.name, kind: p.kind })));
// deno-lint-ignore no-explicit-any
await encounterDb.update({ id: enc.id } as any, { ...fresh, status: "active" });

// deno-lint-ignore no-explicit-any
(u as any).cmd = { name: "+turn", original: "+turn/reaction ambush", args: ["reaction", "ambush"], switches: [] };

const origSend = u.send;
// deno-lint-ignore no-explicit-any
(u as any).send = (m: unknown) => { console.log("SEND:", m); origSend(m as string); };

console.log("u.me.id =", u.me.id);
await turnExec(u as Parameters<typeof turnExec>[0]);

// deno-lint-ignore no-explicit-any
const after = await encounterDb.findOne({ id: enc.id } as any);
console.log("AFTER:", JSON.stringify(after!.participants, null, 2));
