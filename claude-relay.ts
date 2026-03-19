/**
 * Claude Relay — WebSocket bridge that keeps Claude connected to the game
 * and exposes an HTTP API for sending commands and reading output.
 *
 * Usage:
 *   deno run --allow-net --unstable-kv claude-relay.ts
 *
 * API:
 *   POST /send   body: { "msg": "+jobs" }   → sends command to game
 *   GET  /read                               → returns buffered output
 *   GET  /status                             → connection status
 */

const GAME_WS = "ws://127.0.0.1:4203";
const RELAY_PORT = 9876;
const CHAR_NAME = "Claude";
const CHAR_PASS = "cl4ud3pw";

let sock: WebSocket | null = null;
let cid: string | null = null;
let outputBuffer: string[] = [];
let connected = false;

function connectToGame() {
  console.log("[relay] Connecting to game...");
  sock = new WebSocket(GAME_WS);

  sock.onopen = () => {
    console.log("[relay] WebSocket connected, logging in...");
    sock!.send(JSON.stringify({
      msg: `connect ${CHAR_NAME} ${CHAR_PASS}`,
      data: {}
    }));
  };

  sock.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.data?.cid) {
        cid = payload.data.cid;
        console.log("[relay] Got cid:", cid);
      }
      // Mark as connected once we receive any game output
      if (!connected && payload.msg) {
        connected = true;
        console.log("[relay] Logged in as", CHAR_NAME);
      }
      if (payload.msg) {
        // Strip ANSI codes for clean text
        const clean = payload.msg.replace(/\x1b\[[0-9;]*m/g, "");
        outputBuffer.push(clean);
        // Keep buffer manageable
        if (outputBuffer.length > 200) {
          outputBuffer = outputBuffer.slice(-100);
        }
      }
    } catch {
      // raw message
      outputBuffer.push(String(event.data));
    }
  };

  sock.onclose = () => {
    console.log("[relay] WebSocket closed, reconnecting in 5s...");
    connected = false;
    cid = null;
    setTimeout(connectToGame, 5000);
  };

  sock.onerror = (e) => {
    console.error("[relay] WebSocket error:", e);
  };
}

// Start game connection
connectToGame();

// HTTP API
Deno.serve({ port: RELAY_PORT }, async (req) => {
  const url = new URL(req.url);

  if (url.pathname === "/send" && req.method === "POST") {
    try {
      const body = await req.json();
      const msg = body.msg;
      if (!msg || !sock || !connected) {
        return new Response(JSON.stringify({ error: "not connected" }), { status: 503 });
      }
      sock.send(JSON.stringify({ msg, data: { cid } }));
      // Wait a moment for response
      await new Promise(r => setTimeout(r, 1500));
      const recent = outputBuffer.splice(0);
      return new Response(JSON.stringify({ ok: true, output: recent }), {
        headers: { "content-type": "application/json" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 400 });
    }
  }

  if (url.pathname === "/read") {
    const recent = outputBuffer.splice(0);
    return new Response(JSON.stringify({ output: recent }), {
      headers: { "content-type": "application/json" },
    });
  }

  if (url.pathname === "/status") {
    return new Response(JSON.stringify({ connected, cid, bufferSize: outputBuffer.length }), {
      headers: { "content-type": "application/json" },
    });
  }

  return new Response("Claude Relay API\n  POST /send {msg}\n  GET /read\n  GET /status\n", { status: 200 });
});

console.log(`[relay] HTTP API listening on port ${RELAY_PORT}`);
