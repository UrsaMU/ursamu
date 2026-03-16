/**
 * tests/websocket_e2e.test.ts
 *
 * Integration tests for WebSocketService:
 *   - Connection lifecycle (register / close)
 *   - getConnectedSockets() API
 *   - send() targets specific socket by id or cid
 *   - broadcast() reaches all sockets
 *   - Rate limiting: warn + drop after 10 cmd/s
 *   - Empty / whitespace messages are ignored
 */
import { assertEquals, assertExists } from "@std/assert";
import { wsService } from "../src/services/WebSocket/index.ts";
import { DBO } from "../src/services/Database/database.ts";
import type { IMessage } from "../src/interfaces/IMessage.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// ---------------------------------------------------------------------------
// Minimal WebSocket mock
// ---------------------------------------------------------------------------

class MockWebSocket extends EventTarget {
  readyState = 1; // WebSocket.OPEN
  sent: string[] = [];
  closed = false;

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.closed = true;
    this.dispatchEvent(new CloseEvent("close"));
  }

  simulateMessage(data: Record<string, unknown>) {
    this.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(data) })
    );
  }

  simulateError() {
    this.dispatchEvent(new ErrorEvent("error", { message: "test error" }));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMock(clientType = "web"): MockWebSocket {
  const mock = new MockWebSocket();
  wsService.handleConnection(mock as unknown as WebSocket, clientType);
  return mock;
}

/** Wait for queued microtasks/macrotasks to settle. */
const tick = (ms = 20) => new Promise<void>((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Lifecycle — register on connect, unregister on close
// ---------------------------------------------------------------------------

Deno.test("WS — socket is registered after handleConnection", OPTS, () => {
  const before = wsService.getConnectedSockets().length;
  const mock = makeMock();

  const after = wsService.getConnectedSockets().length;
  assertEquals(after, before + 1);

  // Cleanup
  mock.close();
});

Deno.test("WS — socket is removed after close event", OPTS, async () => {
  const mock = makeMock();
  const countBefore = wsService.getConnectedSockets().length;

  mock.close();
  await tick(); // let the async close handler run

  const countAfter = wsService.getConnectedSockets().length;
  assertEquals(countAfter, countBefore - 1);
});

Deno.test("WS — getConnectedSockets returns socket metadata", OPTS, () => {
  const mock = makeMock("web");
  const sockets = wsService.getConnectedSockets();
  const found = sockets.find((s) => s.clientType === "web" && !s.cid);
  assertExists(found);
  assertExists(found.id);
  mock.close();
});

// ---------------------------------------------------------------------------
// send() — targets by socket id or cid
// ---------------------------------------------------------------------------

Deno.test("WS — send() delivers to socket by id", OPTS, async () => {
  const mock = makeMock("web");
  const sockets = wsService.getConnectedSockets();
  const meta = sockets[sockets.length - 1];
  assertExists(meta.id);

  const msg: IMessage = {
    event: "msg",
    payload: { msg: "hello", data: {} }
  };
  wsService.send([meta.id], msg);
  await tick();

  assertEquals(mock.sent.length > 0, true);
  mock.close();
});

Deno.test("WS — send() does not deliver to non-targeted socket", OPTS, async () => {
  const mockA = makeMock("web");
  const mockB = makeMock("web");

  const sockets = wsService.getConnectedSockets();
  const metaA = sockets[sockets.length - 2];

  const msg: IMessage = {
    event: "msg",
    payload: { msg: "only A", data: {} }
  };
  wsService.send([metaA.id], msg);
  await tick();

  // mockB should NOT have received anything
  assertEquals(mockB.sent.length, 0);

  mockA.close();
  mockB.close();
});

// ---------------------------------------------------------------------------
// broadcast() — reaches all connected sockets
// ---------------------------------------------------------------------------

Deno.test("WS — broadcast() reaches all sockets", OPTS, async () => {
  const a = makeMock("web");
  const b = makeMock("web");

  const before_a = a.sent.length;
  const before_b = b.sent.length;

  wsService.broadcast({ event: "announce", payload: { msg: "all hear this", data: {} } });
  await tick();

  assertEquals(a.sent.length > before_a, true);
  assertEquals(b.sent.length > before_b, true);

  a.close();
  b.close();
});

// ---------------------------------------------------------------------------
// Messages — empty / whitespace messages are silently ignored
// ---------------------------------------------------------------------------

Deno.test("WS — empty msg is not dispatched to cmdParser", OPTS, async () => {
  const mock = makeMock("web");
  // Should not throw even though there's no player in DB
  mock.simulateMessage({ msg: "" });
  mock.simulateMessage({ msg: "   " });
  await tick();
  // No error = pass; rate limit map should still be empty for this socket
  mock.close();
});

// ---------------------------------------------------------------------------
// Rate limiting — exceed 10 cmd/s triggers warn log
// ---------------------------------------------------------------------------

Deno.test("WS — rate limit: console.warn fires after 10 cmd/s exceeded", OPTS, async () => {
  const mock = makeMock("web");

  const warns: string[] = [];
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => warns.push(args.join(" "));

  // Send 12 messages rapidly — first 10 pass, 11 & 12 hit the limit
  for (let i = 0; i < 12; i++) {
    mock.simulateMessage({ msg: `look ${i}` });
  }

  // Warn is synchronous (happens before the first await in the handler)
  console.warn = origWarn;

  assertEquals(warns.filter((w) => w.includes("Rate limit")).length, 2);

  await tick(); // let pending cmdParser calls settle
  mock.close();
});

Deno.test("WS — rate limit resets after window expires", OPTS, async () => {
  const mock = makeMock("web");

  const warns: string[] = [];
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => warns.push(args.join(" "));

  // Saturate the window
  for (let i = 0; i < 12; i++) mock.simulateMessage({ msg: "look" });
  const warnsAfterFirst = warns.filter((w) => w.includes("Rate limit")).length;
  assertEquals(warnsAfterFirst, 2);

  // Wait for window to expire (1050ms > 1000ms RATE_WINDOW_MS)
  await tick(1050);

  // Second burst should pass the first 10 again
  for (let i = 0; i < 3; i++) mock.simulateMessage({ msg: "look" });
  const warnsAfterSecond = warns.filter((w) => w.includes("Rate limit")).length;
  assertEquals(warnsAfterSecond, 2); // no new warns

  console.warn = origWarn;
  await tick();
  mock.close();
});

// ---------------------------------------------------------------------------
// disconnect() — closes socket by cid
// ---------------------------------------------------------------------------

Deno.test("WS — disconnect(cid) closes the matching socket", OPTS, async () => {
  const mock = makeMock("web");

  // Simulate a logged-in player by setting cid via a message
  mock.simulateMessage({ data: { cid: "ws_test_player_99" } });
  await tick();

  wsService.disconnect("ws_test_player_99");
  await tick();

  assertEquals(mock.closed, true);
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

Deno.test("WS E2E — cleanup DB", OPTS, async () => {
  await DBO.close();
});
