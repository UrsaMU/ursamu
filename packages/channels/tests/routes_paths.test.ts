/**
 * Channels REST path matching.
 */
import { assertEquals } from "jsr:@std/assert@^1.0.0";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function matchChanPath(path: string): {
  key?: string;
  sub?: string;
  collection?: boolean;
} {
  if (
    path === "/api/v1/channels" || path === "/api/v1/channels/"
  ) {
    return { collection: true };
  }
  const m = path.match(
    /^\/api\/v1\/channels\/([^/]+)(?:\/(history|who))?$/,
  );
  if (!m) return {};
  return { key: m[1], sub: m[2] };
}

Deno.test("channels REST path shapes", OPTS, () => {
  assertEquals(matchChanPath("/api/v1/channels").collection, true);
  assertEquals(matchChanPath("/api/v1/channels/public").key, "public");
  assertEquals(
    matchChanPath("/api/v1/channels/public/history").sub,
    "history",
  );
  assertEquals(
    matchChanPath("/api/v1/channels/public/who").sub,
    "who",
  );
  assertEquals(matchChanPath("/api/v1/channels/x/y").key, undefined);
});
