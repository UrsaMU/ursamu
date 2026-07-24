/**
 * Restart / reauth disconnect policy.
 *
 * Players must never be left half-connected (TCP up, no login) after a
 * restart that invalidates their session. These pure-policy tests pin the
 * decision table used by telnet + session:auth.
 */
import { assertEquals } from "@std/assert";
import {
  REAUTH_FAIL_MSG,
  RESTART_NO_TOKEN_MSG,
  REAUTH_OK_MSG,
  decideReconnectOpen,
  decideEngineAuthFrame,
} from "../src/session/reauth.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("reconnect open — fresh connect flushes buffer", OPTS, () => {
  const d = decideReconnectOpen({ isReconnecting: false });
  assertEquals(d, { action: "flush" });
});

Deno.test(
  "reconnect open — pre-login WS blip stays connected",
  OPTS,
  () => {
    // Fresh dial-in often hits onclose before the engine is ready; that
    // sets isReconnecting with no token. Must NOT drop the TCP link.
    const d = decideReconnectOpen({ isReconnecting: true });
    assertEquals(d, { action: "flush" });
  },
);

Deno.test(
  "reconnect open — was logged in, no token → disconnect",
  OPTS,
  () => {
    const d = decideReconnectOpen({
      isReconnecting: true,
      wasAuthenticated: true,
    });
    assertEquals(d.action, "disconnect");
    if (d.action === "disconnect") {
      assertEquals(d.notice, RESTART_NO_TOKEN_MSG);
    }
  },
);

Deno.test(
  "reconnect open — token present starts JWT auth",
  OPTS,
  () => {
    const d = decideReconnectOpen({
      isReconnecting: true,
      sessionToken: "jwt.here",
    });
    assertEquals(d, { action: "auth", token: "jwt.here" });
  },
);

Deno.test(
  "engine frame — quit/auth:false forces disconnect",
  OPTS,
  () => {
    assertEquals(
      decideEngineAuthFrame({ quit: true }),
      { action: "disconnect" },
    );
    assertEquals(
      decideEngineAuthFrame({ auth: false }),
      { action: "disconnect" },
    );
    assertEquals(
      decideEngineAuthFrame({ quit: true, auth: false }),
      { action: "disconnect" },
    );
  },
);

Deno.test(
  "engine frame — auth:true restores session",
  OPTS,
  () => {
    assertEquals(
      decideEngineAuthFrame({ auth: true, cid: "42" }),
      { action: "restored", cid: "42" },
    );
  },
);

Deno.test("engine frame — unrelated data is ignored", OPTS, () => {
  assertEquals(decideEngineAuthFrame(undefined), { action: "none" });
  assertEquals(decideEngineAuthFrame({}), { action: "none" });
  assertEquals(
    decideEngineAuthFrame({ token: "x" }),
    { action: "none" },
  );
});

Deno.test("reauth messages stay within 78 chars", OPTS, () => {
  for (const m of [REAUTH_FAIL_MSG, RESTART_NO_TOKEN_MSG, REAUTH_OK_MSG]) {
    // Strip MUSH color codes for printable width check.
    const plain = m.replace(/%c[a-z]/gi, "").replace(/%[rntb]/gi, "");
    assertEquals(
      plain.length <= 78,
      true,
      `message too long (${plain.length}): ${plain}`,
    );
  }
});
