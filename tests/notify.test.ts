/**
 * tests/notify.test.ts
 *
 * Verifies the `notify(actorId, msg)` helper:
 *   - delivers to a socket whose cid matches actorId
 *   - returns true when delivered, false when actor is offline
 *   - does not deliver to other actors' sockets
 */
import { assertEquals } from "@std/assert";
import { wsService } from "../src/services/WebSocket/index.ts";
import { notify } from "../src/services/broadcast/broadcast.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

class MockWebSocket extends EventTarget {
  readyState = 1;
  sent: string[] = [];
  send(data: string) { this.sent.push(data); }
  close() { this.dispatchEvent(new CloseEvent("close")); }
}

function makeMock(): MockWebSocket {
  const mock = new MockWebSocket();
  wsService.handleConnection(mock as unknown as WebSocket, "web");
  return mock;
}

/** Patch the just-created (last-registered) socket's cid. Call immediately after makeMock(). */
function setCidOnLast(cid: string) {
  const sockets = wsService.getConnectedSockets();
  sockets[sockets.length - 1].cid = cid;
}

const tick = (ms = 20) => new Promise<void>((r) => setTimeout(r, ms));

Deno.test("notify — returns false when actor is offline", OPTS, () => {
  const delivered = notify("nobody_here", "hi");
  assertEquals(delivered, false);
});

Deno.test("notify — delivers to socket whose cid matches actorId", OPTS, async () => {
  const a = makeMock();
  setCidOnLast("actor_alice");

  const delivered = notify("actor_alice", "you have mail");
  await tick();

  assertEquals(delivered, true);
  assertEquals(a.sent.length > 0, true);
  a.close();
  await tick();
});

Deno.test("notify — does not deliver to other actors", OPTS, async () => {
  const a = makeMock();
  setCidOnLast("actor_a");
  const b = makeMock();
  // b stays without a cid
  const beforeB = b.sent.length;

  const delivered = notify("actor_a", "private");
  await tick();

  assertEquals(delivered, true);
  assertEquals(b.sent.length, beforeB);
  a.close();
  b.close();
  await tick();
});
