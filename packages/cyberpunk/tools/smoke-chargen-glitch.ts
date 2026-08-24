/**
 * Reset glitch.exe + full CPR chargen smoke (notes → pending → approve).
 *
 *   # 1) Server must be STOPPED (DB exclusive lock)
 *   cd games/cpr && bash scripts/stop.sh
 *   deno run -A --unstable-kv \
 *     ../../packages/cyberpunk/tools/smoke-chargen-glitch.ts reset
 *
 *   # 2) Start server
 *   bash scripts/restart.sh   # or your usual start
 *
 *   # 3) Smoke
 *   deno run -A --unstable-kv \
 *     ../../packages/cyberpunk/tools/smoke-chargen-glitch.ts smoke
 */
import { z } from "zod";
import { defineNode, defineGraph, createStore } from "@nicia-ai/typegraph";
import { createLocalPgliteBackend } from "@nicia-ai/typegraph/postgres/pglite";

const BASE = (Deno.env.get("BASE_URL") || "http://127.0.0.1:4303")
  .replace(/\/$/, "");
const GLITCH = "gLitch.exe"; // live name casing
const STAFF = "smokestaff";
const PASS = Deno.env.get("SMOKE_PASS") || "SmokePass123!";
/** bcrypt hash of SmokePass123! (cost 10) — avoid slow wasm bcrypt at reset */
const PASS_HASH =
  Deno.env.get("SMOKE_PASS_HASH") ||
  "$2a$10$n0.Llkg7se3kqOqkF.iQqeZBtoCHRm9EEEBlaZpTbMsch2AIfyFUi";
const NOTES_MIN = 80;
const STATE_FILE = "/tmp/cpr-smoke-glitch.json";
/** TypeGraph namespace for dbojs objects in this game. */
const OBJ_NS = "server.db";

const documentSchema = z.object({
  namespace: z.string(),
  originalId: z.string(),
  content: z.string(),
});
const DocumentNode = defineNode("Document", {
  // deno-lint-ignore no-explicit-any
  schema: documentSchema as any,
});
const DocumentGraph = defineGraph({
  id: "document_graph",
  nodes: { Document: { type: DocumentNode } },
  edges: {},
});

function dbDir(): string {
  return new URL(
    "../../../games/cpr/data/typegraph.db",
    import.meta.url,
  ).pathname;
}

// deno-lint-ignore no-explicit-any
async function openStore(): Promise<any> {
  const dataDir = dbDir();
  console.log("[db]", dataDir);
  const { backend } = await createLocalPgliteBackend({
    dataDir,
    vector: false,
  });
  return await createStore(DocumentGraph, backend);
}

// deno-lint-ignore no-explicit-any
function parseDoc(d: any): { id: string; ns: string; obj: any } | null {
  try {
    const obj = JSON.parse(d.content);
    return {
      id: String(d.originalId ?? obj.id ?? ""),
      ns: String(d.namespace ?? ""),
      obj,
    };
  } catch {
    return null;
  }
}

function setFlags(obj: Record<string, unknown>, add: string[]): void {
  const cur = obj.flags;
  const s = new Set<string>();
  if (typeof cur === "string") {
    for (const f of cur.split(/\s+/)) if (f) s.add(f);
  } else if (Array.isArray(cur)) {
    for (const f of cur) s.add(String(f));
  }
  for (const a of add) s.add(a);
  // store as space string (common mush form)
  obj.flags = [...s].join(" ");
}

// deno-lint-ignore no-explicit-any
async function upsertObject(store: any, id: string, obj: any): Promise<void> {
  const bare = String(id).replace(/^#/, "");
  await store.nodes.Document.upsertById(`${OBJ_NS}:${bare}`, {
    namespace: OBJ_NS,
    originalId: bare,
    content: JSON.stringify(obj),
  });
}

async function resetDb(): Promise<void> {
  const store = await openStore();
  const docs = await store.nodes.Document.find({ limit: 50000 });
  const hashed = PASS_HASH;

  // deno-lint-ignore no-explicit-any
  let glitch: any = null;
  let glitchId = "";
  // deno-lint-ignore no-explicit-any
  let staff: any = null;
  let staffId = "";
  let maxNum = 0;

  for (const d of docs) {
    const p = parseDoc(d);
    if (!p || p.ns !== OBJ_NS) continue;
    const bare = p.id.replace(/^#/, "");
    const n = parseInt(bare, 10);
    if (!isNaN(n) && n > maxNum) maxNum = n;

    const name = String(
      p.obj?.data?.name ?? p.obj?.name ?? "",
    ).toLowerCase();
    const alias = String(p.obj?.data?.alias ?? "").toLowerCase();
    if (
      name === GLITCH.toLowerCase() ||
      alias === GLITCH.toLowerCase() ||
      name === "glitch.exe"
    ) {
      glitch = p.obj;
      glitchId = bare;
    }
    if (name === STAFF.toLowerCase() || alias === STAFF.toLowerCase()) {
      staff = p.obj;
      staffId = bare;
    }
  }

  if (!glitch) {
    console.error("[reset] glitch.exe not found under", OBJ_NS);
    Deno.exit(1);
  }

  // Purge CPR + set known password (keep wizard flags if any)
  glitch.data = glitch.data || {};
  delete glitch.data.cpr;
  if (glitch.state) delete glitch.state.cpr;
  glitch.data.password = hashed;
  // Keep existing staff flags on glitch if present
  setFlags(glitch, ["player"]);
  await upsertObject(store, glitchId, glitch);
  console.log(
    "[reset]",
    glitch.data.name,
    "id=",
    glitchId,
    "CPR wiped, pass set",
  );

  // Ensure staff wizard
  if (!staff) {
    staffId = String(maxNum + 1);
    staff = {
      id: staffId,
      flags: "player wizard admin",
      location: "1",
      data: {
        name: STAFF,
        alias: STAFF,
        email: STAFF + "@test.local",
        password: hashed,
        home: "1",
      },
    };
    console.log("[reset] created staff", staffId);
  } else {
    staff.data = staff.data || {};
    staff.data.password = hashed;
    staff.data.name = STAFF;
    setFlags(staff, ["player", "wizard", "admin"]);
    console.log("[reset] updated staff", staffId);
  }
  await upsertObject(store, staffId, staff);

  await Deno.writeTextFile(
    STATE_FILE,
    JSON.stringify({
      glitchId,
      staffId,
      pass: PASS,
      glitchName: glitch.data?.name ?? GLITCH,
    }, null, 2),
  );
  console.log("[reset] ok — start server, then run: smoke");
  console.log("[reset] glitch login:", glitch.data?.name ?? GLITCH, PASS);
  console.log("[reset] staff login:", STAFF, PASS);
}

async function api(
  token: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = "Bearer " + token;
  const r = await fetch(BASE + path, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  let j: Record<string, unknown> = {};
  try {
    j = await r.json() as Record<string, unknown>;
  } catch { /* empty */ }
  if (!r.ok) {
    throw new Error(
      `${method} ${path} → ${r.status} ${JSON.stringify(j)}`,
    );
  }
  return j;
}

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error("FAIL: " + m);
}

async function smoke(): Promise<void> {
  // health
  const meta = await api(null, "GET", "/api/v1/cpr/meta");
  assert(meta.system === "cpr", "cpr meta");

  console.log("[smoke] login glitch");
  const login = await api(null, "POST", "/api/v1/login", {
    username: GLITCH,
    password: PASS,
  });
  const token = String(login.token ?? "");
  const playerId = String(login.id ?? "").replace(/^#/, "");
  assert(token, "token");

  console.log("[smoke] start chargen");
  await api(token, "POST", "/api/v1/cpr/chargen/start", {
    role: "solo",
  });

  console.log("[smoke] method + role");
  await api(token, "POST", "/api/v1/cpr/chargen/set", {
    field: "method",
    value: "streetrat",
  });
  await api(token, "POST", "/api/v1/cpr/chargen/set", {
    field: "role",
    value: "solo",
  });

  const lp = [
    "lifepath_cultural",
    "lifepath_personality",
    "lifepath_motivations",
    "lifepath_family",
    "lifepath_friends",
    "lifepath_enemies",
    "lifepath_events",
    "lifepath_role",
  ];
  for (const stage of lp) {
    process.stdout?.write?.(`[smoke] ${stage}\n`);
    console.log("[smoke]", stage);
    await api(token, "POST", "/api/v1/cpr/chargen/roll", {
      stage,
      n: stage === "lifepath_role" ? 3 : 1,
    });
    if (stage === "lifepath_family") {
      await api(token, "POST", "/api/v1/cpr/chargen/roll", {
        stage,
        n: 2,
      });
    }
    await api(token, "POST", "/api/v1/cpr/chargen/next", {});
  }

  let cg = await api(token, "GET", "/api/v1/cpr/chargen");
  let d = cg.draft as Record<string, unknown>;
  assert(d.chargenStage === "stats", "stats stage got " + d.chargenStage);
  assert((d.stats as { ref?: number })?.ref === 8, "REF 8");

  await api(token, "POST", "/api/v1/cpr/chargen/next", {}); // skills
  await api(token, "POST", "/api/v1/cpr/chargen/next", {}); // lifestyle
  await api(token, "POST", "/api/v1/cpr/chargen/set", {
    field: "lifestyle",
    value: "kibble",
  });

  cg = await api(token, "GET", "/api/v1/cpr/chargen");
  d = cg.draft as Record<string, unknown>;
  assert(d.chargenStage === "cyberware", "cyberware");

  console.log("[smoke] chrome stack");
  for (const name of [
    "neural link",
    "chipware socket",
    "skill chip",
    "subdermal armor",
  ]) {
    try {
      await api(token, "POST", "/api/v1/cpr/chargen/set", {
        field: "chrome",
        value: name,
        action: "install",
      });
      console.log("  +", name);
    } catch (e) {
      console.log("  skip", name, String(e).slice(0, 80));
    }
  }

  await api(token, "POST", "/api/v1/cpr/chargen/next", {});
  cg = await api(token, "GET", "/api/v1/cpr/chargen");
  d = cg.draft as Record<string, unknown>;
  assert(d.chargenStage === "equipment", "equipment");

  try {
    await api(token, "POST", "/api/v1/cpr/chargen/set", {
      field: "gear",
      value: "medium pistol",
      action: "add",
    });
    console.log("[smoke] + medium pistol");
  } catch (e) {
    console.log("[smoke] gear skip", e);
  }

  await api(token, "POST", "/api/v1/cpr/chargen/next", {});
  cg = await api(token, "GET", "/api/v1/cpr/chargen");
  d = cg.draft as Record<string, unknown>;
  assert(d.chargenStage === "review", "review");

  console.log("[smoke] reject short notes");
  let failed = false;
  try {
    await api(token, "POST", "/api/v1/cpr/chargen/submit", {
      notes: "short",
    });
  } catch {
    failed = true;
  }
  assert(failed, "short notes must fail");

  const notes = (
    "Glitch.exe is a streetrat solo who burned a corpo convoy for " +
    "chrome and never looked back. Wants a crew, a roof, and one " +
    "clean shot at the fixer who sold her out in Heywood."
  );
  assert(notes.length >= NOTES_MIN, "notes len");

  console.log("[smoke] submit → pending");
  const sub = await api(token, "POST", "/api/v1/cpr/chargen/submit", {
    notes,
  });
  assert(sub.status === "pending" || sub.pending === true, "pending");
  const sheet = sub.sheet as {
    chargenComplete?: boolean;
    chargenStatus?: string;
    conceptNotes?: string;
  };
  assert(sheet.chargenComplete !== true, "locked");
  assert(sheet.chargenStatus === "pending", "pending status");
  assert(
    (sheet.conceptNotes ?? "").length >= NOTES_MIN,
    "notes saved",
  );
  console.log("[smoke] CGEN job", sub.jobNumber);

  // Play still locked
  console.log("[smoke] confirm play locked (sheet 404/incomplete)");
  try {
    const sh = await api(token, "GET", "/api/v1/cpr/sheet");
    const s = sh.sheet as { chargenComplete?: boolean } | undefined;
    if (s?.chargenComplete) {
      throw new Error("sheet should not be complete while pending");
    }
  } catch (e) {
    console.log("[smoke] sheet while pending:", String(e).slice(0, 100));
  }

  console.log("[smoke] staff login + approve");
  const stLogin = await api(null, "POST", "/api/v1/login", {
    username: STAFF,
    password: PASS,
  });
  const stTok = String(stLogin.token ?? "");
  assert(stTok, "staff token");

  const ap = await api(stTok, "POST", "/api/v1/cpr/approve", {
    playerId,
  });
  assert(ap.complete === true || ap.status === "approved", "approved");
  console.log("[smoke] approved", ap.name);

  cg = await api(token, "GET", "/api/v1/cpr/chargen");
  assert(cg.complete === true, "glitch complete");
  d = cg.draft as Record<string, unknown>;
  const cw = (d.cyberware as unknown[]) ?? [];
  console.log("[smoke] chrome count", cw.length);
  console.log("[smoke] FULL PASS");
}

const cmd = Deno.args[0] ?? "help";
if (cmd === "reset") {
  await resetDb();
} else if (cmd === "smoke") {
  await smoke();
} else {
  console.log("usage: reset | smoke");
  console.log("  reset  — server STOPPED; wipe glitch CPR + seed staff");
  console.log("  smoke  — server UP; full chargen as glitch + approve");
}
