#!/usr/bin/env -S deno run -A --unstable-kv
// Showcase runner — Cinematic Unisystem commands in-process.
// Reads flows from showcases/*.json. Usage: deno task showcase [key]
import { expandGlob } from "@std/fs";
import { cmds } from "@ursamu/mush";
import "../commands.ts";

// Deterministic RNG so rolls are stable between runs.
let __rng = 0x12345678 >>> 0;
Math.random = () => {
  __rng = (__rng * 1664525 + 1013904223) >>> 0;
  return __rng / 0x100000000;
};

const plain = (s: string) =>
  s.replace(/%c[a-zA-Z]/g, "").replace(/%[nrtbR]/g, "\n");

const me = {
  id: "showcase_player",
  name: "Riley",
  flags: new Set(["player", "connected", "admin"]),
  state: {} as Record<string, unknown>,
  location: "showcase_room",
  contents: [],
};

const sent: string[] = [];
const u = {
  me,
  here: {
    id: "showcase_room",
    name: "Library",
    flags: new Set(["room"]),
    state: {},
    location: "",
    contents: [],
    broadcast: () => {},
  },
  cmd: { name: "", original: "", args: [] as string[], switches: [] },
  send: (m: string) => sent.push(m),
  broadcast: () => {},
  canEdit: async () => true,
  attr: {
    get: async () => null,
    set: async () => {},
    clear: async () => true,
  },
  db: {
    modify: async (
      id: string,
      op: string,
      data: Record<string, unknown>,
    ) => {
      if (id === me.id && op === "$set" && data["state.cinematic"]) {
        me.state.cinematic = data["state.cinematic"];
      }
    },
    search: async () => [],
    create: async (d: unknown) => d as typeof me,
    destroy: async () => {},
  },
  util: {
    target: async () => me,
    displayName: (o: { name: string }) => o.name,
    stripSubs: (s: string) =>
      s.replace(/%c[a-z]/gi, "").replace(/%[rntb]/gi, ""),
    center: (s: string) => s,
    ljust: (s: string, w: number) => s.padEnd(w),
    rjust: (s: string, w: number) => s.padStart(w),
  },
} as never as Parameters<
  NonNullable<{ exec?: (u: never) => void }["exec"]>
>;

type Exec = (u: never) => Promise<void> | void;

function run(input: string): Exec | undefined {
  const cmd = cmds.find((c) => c.pattern.test(input));
  if (!cmd) return undefined;
  const m = input.match(cmd.pattern) ?? [];
  u.cmd.args = m.slice(1).map((x) => x ?? "");
  return cmd.exec as Exec;
}

interface FlowStep {
  cmd: string;
  note?: string;
}
interface FlowFile {
  key: string;
  label?: string;
  steps: FlowStep[];
}

const flows: FlowFile[] = [];
for await (
  const f of expandGlob("showcases/*.json", { rootPath: Deno.cwd() })
) {
  flows.push(JSON.parse(await Deno.readTextFile(f.path)) as FlowFile);
}

const wanted = Deno.args[0];
if (!wanted || wanted === "--list") {
  console.log("Showcase flows:");
  for (const f of flows) {
    console.log(
      `  ${f.key.padEnd(10)} ${f.label ?? ""} (${f.steps.length} steps)`,
    );
  }
  console.log("\nRun one: deno task showcase <key>");
  Deno.exit(0);
}
const flow = flows.find((f) => f.key === wanted);
if (!flow) {
  console.log(`Unknown flow "${wanted}". Use: deno task showcase`);
  Deno.exit(1);
}

console.log(
  `-- showcase: ${flow.label ?? flow.key} (${flow.steps.length} steps) --`,
);

for (const step of flow.steps) {
  const exec = run(step.cmd);
  console.log(`\n> ${step.cmd}`);
  if (step.note) console.log(`  (${step.note})`);
  if (!exec) {
    console.log("  ?? no command matched");
    continue;
  }
  sent.length = 0;
  await exec(u);
  for (const m of sent) console.log(plain(m).trim());
}
console.log("\n-- showcase done --");
Deno.exit(0);
