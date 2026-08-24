/**
 * Live smoke: games/utopia-local — feed, week, act, sphere,
 * /play assets, two-player ready.
 *
 *   cd games/utopia-local && deno task daemon && deno task smoke
 *   or: deno run -A --unstable-kv packages/utopia/e2e/smoke.ts
 */
import { dirname, fromFileUrl, join } from "jsr:@std/path@^0.224.0";

const BASE = (Deno.env.get("UTOPIA_SMOKE_BASE") ||
  "http://127.0.0.1:4493").replace(/\/$/, "");
const WS_URL = Deno.env.get("UTOPIA_SMOKE_WS") ||
  "ws://127.0.0.1:4492?clientType=web";

const GAME = join(
  dirname(fromFileUrl(import.meta.url)),
  "../../../games/utopia-local",
);

type Json = Record<string, unknown>;

let passed = 0;
let failed = 0;
let startedByUs = false;

function ok(label: string, d = ""): void {
  passed += 1;
  console.log(`  PASS  ${label}${d ? " — " + d : ""}`);
}

function fail(label: string, d = ""): void {
  failed += 1;
  console.error(`  FAIL  ${label}${d ? " — " + d : ""}`);
}

function assert(cond: unknown, label: string, d = ""): void {
  if (cond) ok(label, d);
  else fail(label, d);
}

function stripAnsi(s: string): string {
  return String(s || "")
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/%c[a-z0-9#<>;]*/gi, "")
    .replace(/%[rtn]/gi, " ");
}

function payloadText(raw: string): string {
  try {
    const data = JSON.parse(raw) as {
      msg?: string;
      data?: {
        auth?: boolean;
        ui?: {
          type?: string;
          text?: string;
          meta?: { type?: string; result?: string };
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
      if (ui.meta?.type) parts.push("meta:" + ui.meta.type);
      if (ui.meta?.result) parts.push("result:" + ui.meta.result);
      if (ui.text) parts.push(String(ui.text));
      if (ui.type) parts.push("ui:" + ui.type);
      for (const c of ui.components ?? []) {
        if (c.title) parts.push(String(c.title));
        if (c.content) parts.push(String(c.content));
      }
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
  ws: WebSocket | null = null;
  lines: string[] = [];
  authed = false;
  private waiters: Array<{
    test: (s: string) => boolean;
    resolve: (s: string) => void;
    timer: number;
  }> = [];

  constructor(name: string, token: string) {
    this.name = name;
    this.token = token;
  }

  private push(clean: string): void {
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
      }, 15000);
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "auth", token: this.token }));
      };
      ws.onerror = () => {
        clearTimeout(to);
        reject(new Error(this.name + " WS error"));
      };
      ws.onmessage = (ev) => {
        this.push(payloadText(String(ev.data)));
        if (this.authed) {
          clearTimeout(to);
          resolve();
        }
      };
    });
  }

  send(cmd: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error(this.name + " WS closed");
    }
    this.ws.send(JSON.stringify({ msg: cmd }));
  }

  wait(
    test: string | RegExp,
    ms = 8000,
  ): Promise<string> {
    const fn = typeof test === "string"
      ? (s: string) => s.toLowerCase().includes(test.toLowerCase())
      : (s: string) => test.test(s);
    for (let i = this.lines.length - 1; i >= 0; i--) {
      if (fn(this.lines[i])) return Promise.resolve(this.lines[i]);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            this.name + " timeout " + String(test) +
              " last=" +
              JSON.stringify(this.lines.slice(-5).map((l) =>
                l.slice(0, 120)
              )),
          ),
        );
      }, ms);
      this.waiters.push({ test: fn, resolve, timer });
    });
  }

  close(): void {
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
  }
}

async function gameUp(): Promise<boolean> {
  try {
    const r = await fetch(BASE + "/", {
      signal: AbortSignal.timeout(2000),
    });
    return r.status > 0;
  } catch {
    return false;
  }
}

async function sh(args: string[], cwd: string): Promise<void> {
  const p = new Deno.Command("bash", {
    args,
    cwd,
    stdout: "piped",
    stderr: "piped",
  });
  const o = await p.output();
  if (o.code !== 0) {
    throw new Error(
      new TextDecoder().decode(o.stderr) +
        new TextDecoder().decode(o.stdout),
    );
  }
}

async function ensureGame(): Promise<void> {
  if (await gameUp()) {
    console.log("[smoke] game already up");
    return;
  }
  console.log("[smoke] starting utopia-local …");
  await sh(
    ["-lc", "rm -rf data/typegraph.db data/ursamu.db && mkdir -p data logs run"],
    GAME,
  );
  await sh(["./scripts/daemon.sh"], GAME);
  startedByUs = true;
  for (let i = 0; i < 60; i++) {
    if (await gameUp()) {
      console.log("[smoke] game ready");
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("utopia-local not ready");
}

async function register(
  username: string,
  password: string,
): Promise<string> {
  const r = await fetch(BASE + "/api/v1/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      password,
      email: username + "@test.local",
    }),
  });
  const j = await r.json() as Json;
  if (!r.ok || !j.token) {
    const login = await fetch(BASE + "/api/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const lj = await login.json() as Json;
    if (!login.ok || !lj.token) {
      throw new Error("auth failed " + JSON.stringify(j));
    }
    return String(lj.token);
  }
  return String(j.token);
}

async function httpOk(path: string, needle?: string): Promise<void> {
  const r = await fetch(BASE + path);
  const t = await r.text();
  assert(r.ok, "GET " + path, String(r.status));
  if (needle) {
    assert(t.includes(needle), path + " contains " + needle);
  }
}

async function main(): Promise<void> {
  console.log("== Utopia e2e smoke ==");
  await ensureGame();

  await httpOk("/play", "play");
  await httpOk("/site/js/play-deck.js", "PlayDeck");
  await httpOk("/site/css/play-deck.css", "play-deck__masthead");

  const pass = "SmokePass123!";
  const godName = "utogod" + Date.now().toString(36);
  const palName = "utopal" + Date.now().toString(36);
  const godTok = await register(godName, pass);
  const palTok = await register(palName, pass);
  ok("register two players");

  const god = new PlaySession(godName, godTok);
  const pal = new PlaySession(palName, palTok);
  await god.connect();
  await pal.connect();
  ok("ws auth both");

  god.send("+feed");
  const feed = await god.wait("meta:utopia-feed");
  assert(feed.includes("meta:utopia-feed"), "+feed layout");
  assert(/cascadia|week/i.test(feed), "+feed city/week");

  god.send("+week/plan Get the sample.");
  const plan = await god.wait("Get the sample");
  assert(plan.includes("Get the sample"), "+week/plan");

  god.send("+week/ready");
  await god.wait(/ready|Week/i);

  god.send("+act hack");
  const roll = await god.wait("meta:utopia-ruling");
  assert(roll.includes("meta:utopia-ruling"), "+act ruling");
  assert(
    /result:(holds|hitch|fails)/i.test(roll),
    "+act result face",
  );

  god.send("+act/hitch gather-information");
  await god.wait("meta:utopia-ruling");
  ok("+act/hitch ruling");

  god.send("+sphere");
  const sph = await god.wait("meta:utopia-sphere");
  assert(sph.includes("meta:utopia-sphere"), "+sphere layout");

  god.send("+week/you");
  const you = await god.wait("meta:utopia-you");
  assert(you.includes("meta:utopia-you"), "+week/you");

  god.send("+feed/tick");
  const tick = await god.wait("meta:utopia-feed");
  assert(tick.includes("meta:utopia-feed"), "staff +feed/tick");

  pal.send("+week/plan Watch the door.");
  await pal.wait("Watch the door");
  pal.send("+week/ready");
  await pal.wait(/Week|ready/i);
  ok("second player plan+ready");

  god.close();
  pal.close();

  if (startedByUs && Deno.env.get("UTOPIA_SMOKE_KEEP") !== "1") {
    await sh(["./scripts/stop.sh"], GAME).catch(() => {});
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) Deno.exit(1);
}

try {
  await main();
} catch (e) {
  console.error(e);
  if (startedByUs) {
    await sh(["./scripts/stop.sh"], GAME).catch(() => {});
  }
  Deno.exit(1);
}
