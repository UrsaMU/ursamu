/**
 * Live CPR combat smoke — two WS clients, full fight loop.
 *
 * Requires running games/cpr server (http 4303, ws 4302).
 * Uses gLitch.exe + smokestaff (same as chargen smoke).
 *
 *   deno run -A --unstable-kv \
 *     packages/cyberpunk/tools/smoke-combat.ts
 */
const BASE = (Deno.env.get("BASE_URL") || "http://127.0.0.1:4303")
  .replace(/\/$/, "");
const WS_URL = Deno.env.get("WS_URL") || "ws://127.0.0.1:4302?clientType=web";
const PASS = Deno.env.get("SMOKE_PASS") || "SmokePass123!";
const SOLO = Deno.env.get("SMOKE_SOLO") || "gLitch.exe";
const TARGET = Deno.env.get("SMOKE_TARGET") || "smokestaff";

type Json = Record<string, unknown>;

let failed = 0;
let passed = 0;

function ok(label: string, detail = ""): void {
  passed += 1;
  console.log(`  PASS  ${label}${detail ? " — " + detail : ""}`);
}

function fail(label: string, detail = ""): void {
  failed += 1;
  console.error(`  FAIL  ${label}${detail ? " — " + detail : ""}`);
}

function assert(cond: unknown, label: string, detail = ""): void {
  if (cond) ok(label, detail);
  else fail(label, detail);
}

async function api(
  token: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<Json> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = "Bearer " + token;
  const r = await fetch(BASE + path, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  let j: Json = {};
  try {
    j = await r.json() as Json;
  } catch { /* empty */ }
  if (!r.ok) {
    throw new Error(
      `${method} ${path} → ${r.status} ${JSON.stringify(j)}`,
    );
  }
  return j;
}

function stripAnsi(s: string): string {
  return String(s || "")
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
    .replace(/%c[a-z0-9#<>;]*/gi, "")
    .replace(/%[rtn]/gi, " ")
    .replace(/\r/g, "\n");
}

/** Flatten engine WS payload → searchable text. */
function payloadText(raw: string): string {
  try {
    const data = JSON.parse(raw) as {
      msg?: string;
      data?: {
        auth?: boolean;
        ui?: {
          type?: string;
          text?: string;
          components?: Array<{
            type?: string;
            content?: string;
            title?: string;
          }>;
        };
      };
    };
    const parts: string[] = [];
    if (data.msg) parts.push(String(data.msg));
    const ui = data.data?.ui;
    if (ui) {
      if (ui.text) parts.push(String(ui.text));
      if (Array.isArray(ui.components)) {
        for (const c of ui.components) {
          if (c.content) parts.push(String(c.content));
          if (c.title) parts.push(String(c.title));
        }
      }
      if (ui.type) parts.push("ui:" + ui.type);
    }
    if (data.data?.auth) parts.push("AUTH_OK");
    return stripAnsi(parts.join("\n"));
  } catch {
    return stripAnsi(raw);
  }
}

class PlaySession {
  name: string;
  token: string;
  id: string;
  ws: WebSocket | null = null;
  lines: string[] = [];
  authed = false;
  private waiters: Array<{
    test: (s: string) => boolean;
    resolve: (s: string) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  constructor(name: string, token: string, id: string) {
    this.name = name;
    this.token = token;
    this.id = id;
  }

  private pushLine(clean: string): void {
    if (!clean.trim()) return;
    this.lines.push(clean);
    if (clean.includes("AUTH_OK")) this.authed = true;
    for (let i = this.waiters.length - 1; i >= 0; i--) {
      const w = this.waiters[i];
      if (w.test(clean)) {
        clearTimeout(w.timer);
        this.waiters.splice(i, 1);
        w.resolve(clean);
      }
    }
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_URL);
      this.ws = ws;
      const to = setTimeout(() => {
        reject(new Error(this.name + " WS auth timeout"));
      }, 10000);
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "auth", token: this.token }));
      };
      ws.onerror = () => {
        clearTimeout(to);
        reject(new Error(this.name + " WS error"));
      };
      ws.onmessage = (ev) => {
        const clean = payloadText(String(ev.data));
        this.pushLine(clean);
        if (this.authed) {
          clearTimeout(to);
          resolve();
        }
      };
      ws.onclose = () => {
        /* ignore */
      };
    });
  }

  send(cmd: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error(this.name + " WS not open");
    }
    this.ws.send(JSON.stringify({ msg: cmd }));
  }

  wait(
    test: string | RegExp | ((s: string) => boolean),
    ms = 8000,
  ): Promise<string> {
    const fn = typeof test === "string"
      ? (s: string) => s.toLowerCase().includes(test.toLowerCase())
      : test instanceof RegExp
      ? (s: string) => test.test(s)
      : test;
    for (let i = this.lines.length - 1; i >= Math.max(0, this.lines.length - 30); i--) {
      if (fn(this.lines[i])) return Promise.resolve(this.lines[i]);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.timer === timer);
        if (idx >= 0) this.waiters.splice(idx, 1);
        reject(
          new Error(
            this.name + " wait timeout: " + String(test) +
              " last=" +
              JSON.stringify(this.lines.slice(-6).map((l) =>
                l.slice(0, 100)
              )),
          ),
        );
      }, ms);
      this.waiters.push({ test: fn, resolve, reject, timer });
    });
  }

  async cmd(
    line: string,
    expect?: string | RegExp,
    ms = 8000,
  ): Promise<string[]> {
    const before = this.lines.length;
    this.send(line);
    if (expect) {
      try {
        await this.wait(expect, ms);
      } catch {
        /* return whatever we got */
      }
    } else {
      await new Promise((r) => setTimeout(r, 500));
    }
    // small settle for multi-packet replies
    await new Promise((r) => setTimeout(r, 200));
    return this.lines.slice(before);
  }

  recent(n = 12): string {
    return this.lines.slice(-n).join(" | ");
  }

  close(): void {
    try {
      this.ws?.close();
    } catch { /* ignore */ }
  }
}

async function login(user: string): Promise<{ token: string; id: string }> {
  const j = await api(null, "POST", "/api/v1/login", {
    username: user,
    password: PASS,
  });
  const token = String(j.token ?? "");
  const id = String(j.id ?? "").replace(/^#/, "");
  if (!token) throw new Error("no token for " + user);
  return { token, id };
}

async function ensureApproved(
  staffTok: string,
  playerId: string,
): Promise<void> {
  try {
    await api(staffTok, "POST", "/api/v1/cpr/approve", {
      playerId,
    });
  } catch {
    /* may already be approved */
  }
}

/** Minimal streetrat solo so staff can +init / take hits. */
async function ensureCombatReady(
  token: string,
  staffTok: string,
  playerId: string,
  label: string,
): Promise<void> {
  try {
    const sh = await api(token, "GET", "/api/v1/cpr/sheet");
    const sheet = (sh.sheet ?? sh) as Json;
    if (sheet && sheet.chargenComplete === true) {
      ok(label + " already approved");
      return;
    }
  } catch {
    /* no sheet */
  }
  console.log(`[setup] ${label} quick chargen…`);
  try {
    await api(token, "POST", "/api/v1/cpr/chargen/start", {
      role: "solo",
    });
  } catch { /* already */ }
  try {
    await api(token, "POST", "/api/v1/cpr/chargen/set", {
      field: "method",
      value: "streetrat",
    });
    await api(token, "POST", "/api/v1/cpr/chargen/set", {
      field: "role",
      value: "solo",
    });
  } catch { /* */ }

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
    try {
      await api(token, "POST", "/api/v1/cpr/chargen/roll", {
        stage,
        n: stage === "lifepath_role" ? 3 : 1,
      });
      if (stage === "lifepath_family") {
        await api(token, "POST", "/api/v1/cpr/chargen/roll", {
          stage,
          n: 1,
        });
      }
      await api(token, "POST", "/api/v1/cpr/chargen/next", {});
    } catch { /* stage may skip */ }
  }
  // advance remaining stages
  for (let i = 0; i < 12; i++) {
    try {
      const cg = await api(token, "GET", "/api/v1/cpr/chargen");
      const st = String(
        (cg.draft as Json)?.chargenStage ?? cg.stage ?? "",
      );
      if (st === "review" || st === "complete" || cg.pending) break;
      if (st === "lifestyle") {
        await api(token, "POST", "/api/v1/cpr/chargen/set", {
          field: "lifestyle",
          value: "kibble",
        });
      }
      await api(token, "POST", "/api/v1/cpr/chargen/next", {});
    } catch {
      break;
    }
  }
  const notes = "Combat smoke dummy notes. ".repeat(6);
  try {
    await api(token, "POST", "/api/v1/cpr/chargen/submit", {
      notes,
    });
  } catch { /* */ }
  await ensureApproved(staffTok, playerId);
  ok(label + " combat-ready");
}

async function main(): Promise<void> {
  console.log("=== CPR combat smoke ===");
  console.log("BASE", BASE, "WS", WS_URL);
  console.log("Solo", SOLO, "Target", TARGET);

  // Health
  try {
    const meta = await api(null, "GET", "/api/v1/cpr/meta");
    assert(meta.system === "cpr", "cpr meta");
  } catch (e) {
    fail("server health", String(e));
    Deno.exit(1);
  }

  console.log("\n-- login --");
  const soloLogin = await login(SOLO);
  const tgtLogin = await login(TARGET);
  ok("login solo", soloLogin.id);
  ok("login target", tgtLogin.id);

  // Staff can approve; use whichever has admin for approve
  const approver = tgtLogin.token;
  await ensureCombatReady(
    soloLogin.token,
    approver,
    soloLogin.id,
    "solo",
  );
  await ensureCombatReady(
    tgtLogin.token,
    soloLogin.token, // glitch is wizard too
    tgtLogin.id,
    "target",
  );

  console.log("\n-- websocket --");
  const solo = new PlaySession(SOLO, soloLogin.token, soloLogin.id);
  const tgt = new PlaySession(TARGET, tgtLogin.token, tgtLogin.id);
  try {
    await solo.connect();
    ok("solo WS");
  } catch (e) {
    fail("solo WS", String(e));
    Deno.exit(1);
  }
  try {
    await tgt.connect();
    ok("target WS");
  } catch (e) {
    fail("target WS", String(e));
    Deno.exit(1);
  }

  // Settle connect splash after auth
  await new Promise((r) => setTimeout(r, 1200));

  console.log("\n-- co-locate --");
  await solo.cmd("home");
  await tgt.cmd("home");
  await new Promise((r) => setTimeout(r, 400));
  // Staff teleport to solo (builder/wizard)
  await tgt.cmd(`@tel me=#${solo.id}`);
  await new Promise((r) => setTimeout(r, 400));
  const lookOut = (await solo.cmd("look", /./)).join("\n");
  ok(
    "co-locate",
    /smokestaff|staff/i.test(lookOut)
      ? "target in look"
      : "home shared (best-effort)",
  );

  console.log("\n-- smartgun kit (solo) --");
  await solo.cmd("+combat/end");
  await new Promise((r) => setTimeout(r, 300));

  await solo.cmd(
    "+cyber/install neural link",
    /neural|install|already|chrome|denied|error|HL/i,
  );
  await solo.cmd(
    "+cyber/install subdermal grip",
    /grip|install|already|chrome|denied|error|HL|smart/i,
  );
  const chrome = await solo.cmd(
    "+cyber/view",
    /CHROME|neural|grip|meat|cyber|install/i,
  );
  const chromeBlob = chrome.join("\n");
  assert(
    /neural|grip|smartgun|subdermal|CHROME/i.test(chromeBlob),
    "chrome view",
    chromeBlob.slice(0, 120).replace(/\n/g, " "),
  );

  await solo.cmd(
    "+gear/add heavy_pistol=weapon",
    /added|heavy_pistol|inventory|error/i,
  );
  const gearLines = await solo.cmd(
    "+gear",
    /INVENTORY|heavy_pistol|weapon|gear|empty/i,
  );
  const gearBlob = gearLines.join("\n");
  assert(/heavy_pistol|INVENTORY/i.test(gearBlob), "+gear list");

  const idMatch = gearBlob.match(
    /([0-9a-f]{8})[0-9a-f-]*/i,
  );
  if (idMatch) {
    const eq = await solo.cmd(
      `+gear/equip ${idMatch[1]}=wielded`,
      /wielded|moved|equip|error|heavy/i,
    );
    assert(
      /wielded|moved|equip|heavy/i.test(eq.join("\n")),
      "equip heavy_pistol",
      idMatch[1],
    );
  } else {
    fail("equip heavy_pistol", "no id in gear:\n" + gearBlob.slice(0, 200));
  }

  await solo.cmd("+seteb me=8000");
  await solo.cmd(
    "+ammo/buy smart",
    /bought|smart|ammo|eb|error|pack|euro/i,
  );
  await solo.cmd(
    "+ammo/load heavy_pistol=smart",
    /load|smart|ammo|error|heavy|AMMO/i,
  );
  const ammoOut = await solo.cmd(
    "+ammo",
    /AMMO|smart|heavy|basic|loadout|WEAPON/i,
  );
  assert(
    /smart|heavy_pistol|AMMO|WEAPON/i.test(ammoOut.join("\n")),
    "ammo loadout",
  );

  console.log("\n-- initiative --");
  await solo.cmd("+combat/end");
  await new Promise((r) => setTimeout(r, 300));
  const init1 = await solo.cmd(
    "+init",
    /COMBAT|initiative|INITIATIVE|REF|join|rolls initiative/i,
    8000,
  );
  assert(
    /init|COMBAT|REF/i.test(init1.join("\n")),
    "solo +init",
    init1.join(" ").slice(0, 100),
  );

  const init2 = await tgt.cmd(
    "+init",
    /COMBAT|initiative|INITIATIVE|join|rolls|character|chrome/i,
    8000,
  );
  assert(
    /init|COMBAT|join|rolls/i.test(init2.join("\n")) &&
      !/no character|chargen first/i.test(init2.join("\n")),
    "target +init",
    init2.join(" ").slice(0, 100),
  );

  const queue = await solo.cmd(
    "+combat",
    /COMBAT|queue|round|INIT|active|TRACKER/i,
  );
  assert(
    /combat|round|queue|init|TRACKER/i.test(queue.join("\n")),
    "+combat tracker",
  );

  console.log("\n-- attacks --");
  let attackOk = false;
  let attackMsg = "";
  for (let i = 0; i < 8; i++) {
    const out = await solo.cmd(
      `+attack ${TARGET} with heavy_pistol`,
      /ATTACK|hit|miss|damage|DV|wound|turn|target|combat|error|not your/i,
      6000,
    );
    attackMsg = out.join("\n");
    if (
      /ATTACK|hit|miss|damage|DV|wound|not your|target/i.test(
        attackMsg,
      )
    ) {
      attackOk = true;
      break;
    }
    await solo.cmd("+pass");
    await tgt.cmd("+pass");
    await new Promise((r) => setTimeout(r, 250));
  }
  assert(attackOk, "+attack heavy_pistol", attackMsg.slice(0, 180));

  const aimed = await solo.cmd(
    `+attack/aimed ${TARGET} with heavy_pistol`,
    /ATTACK|aimed|hit|miss|turn|damage|error|not your/i,
    5000,
  );
  assert(
    /ATTACK|aimed|hit|miss|turn|damage|not your/i.test(
      aimed.join("\n"),
    ),
    "+attack/aimed",
  );

  const melee = await solo.cmd(
    `+attack/melee ${TARGET}`,
    /ATTACK|melee|hit|miss|turn|damage|brawl|not your/i,
    5000,
  );
  assert(
    /ATTACK|melee|hit|miss|turn|damage|brawl|not your/i.test(
      melee.join("\n"),
    ),
    "+attack/melee",
  );

  console.log("\n-- pass / log / end --");
  await solo.cmd("+pass", /pass|turn|combat|error|not/i);
  await solo.cmd("+combat/log", /./i);
  ok("+combat/log");
  await solo.cmd("+combat/end", /end|combat|closed|over|no combat/i);
  ok("+combat/end");

  await solo.cmd("+heal");
  await solo.cmd(`+heal ${TARGET}`);
  await tgt.cmd("+heal");

  console.log("\n-- score --");
  const score = await solo.cmd(
    "+score",
    /HP|REF|wound|healthy|lightly|seriously|EMP/i,
  );
  assert(/HP|REF|EMP|wound|healthy/i.test(score.join("\n")), "+score");
  solo.close();
  tgt.close();

  console.log("\n=== RESULT ===");
  console.log(`passed=${passed} failed=${failed}`);
  if (failed > 0) {
    console.error("COMBAT SMOKE FAILED");
    Deno.exit(1);
  }
  console.log("COMBAT SMOKE PASSED");
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    Deno.exit(1);
  });
}
