import { assert, assertEquals } from "@std/assert";
import { cmdLearn, cmdReload } from "../commands.ts";
import {
  clearLangs,
  registerLangForTest,
} from "../src/langStore.ts";
import { mockU, mockPlayer } from "./helpers/mockU.ts";
import type { LangDef } from "../src/schema.ts";

const lang: LangDef = {
  schema: 1, name: "huttese", mode: "phoneme",
  onsets: ["k"], nuclei: ["a"], codas: [""],
  syllablePatterns: ["CV"], wordLenWeights: [0, 1],
};

function setup() {
  clearLangs();
  registerLangForTest(lang);
}

Deno.test("cmdLearn — rejects non-staff caller (no DB write, denial sent)", async () => {
  setup();
  const u = mockU({
    me: { id: "1", flags: new Set(["player", "connected"]) },
    targetResult: mockPlayer({ id: "5", name: "Victim" }),
  });
  await cmdLearn(u, "Victim=huttese/100");
  const sent = (u as unknown as { _sent: string[] })._sent;
  const dbCalls = (u as unknown as { _dbCalls: unknown[][] })._dbCalls;
  assert(sent.some((m) => /permission denied/i.test(m)), `expected denial, got: ${sent.join(" | ")}`);
  assertEquals(dbCalls.length, 0, "no DB writes for unprivileged caller");
});

Deno.test("cmdLearn — admin allowed", async () => {
  setup();
  const u = mockU({
    me: { id: "1", flags: new Set(["player", "connected", "admin"]) },
    targetResult: mockPlayer({ id: "5", name: "Victim" }),
  });
  await cmdLearn(u, "Victim=huttese/50");
  const dbCalls = (u as unknown as { _dbCalls: unknown[][] })._dbCalls;
  assertEquals(dbCalls.length, 1);
});

Deno.test("cmdLearn — wizard allowed", async () => {
  setup();
  const u = mockU({
    me: { id: "1", flags: new Set(["player", "connected", "wizard"]) },
    targetResult: mockPlayer({ id: "5", name: "Victim" }),
  });
  await cmdLearn(u, "Victim=huttese/50");
  assertEquals((u as unknown as { _dbCalls: unknown[][] })._dbCalls.length, 1);
});

Deno.test("cmdReload — rejects non-wizard caller (admin not enough)", async () => {
  setup();
  const u = mockU({
    me: { id: "1", flags: new Set(["player", "connected", "admin"]) },
  });
  await cmdReload(u);
  const sent = (u as unknown as { _sent: string[] })._sent;
  assert(sent.some((m) => /permission denied/i.test(m)));
});

Deno.test("cmdLearn — rejects when target is not a player flag", async () => {
  setup();
  const u = mockU({
    me: { id: "1", flags: new Set(["player", "connected", "admin"]) },
    targetResult: mockPlayer({ id: "5", name: "Rock", flags: new Set(["thing"]) }),
  });
  await cmdLearn(u, "Rock=huttese/50");
  const sent = (u as unknown as { _sent: string[] })._sent;
  assert(sent.some((m) => /no such player/i.test(m)));
  assertEquals((u as unknown as { _dbCalls: unknown[][] })._dbCalls.length, 0);
});
