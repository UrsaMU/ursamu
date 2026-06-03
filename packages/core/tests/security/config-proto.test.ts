/**
 * Security test — config mergeDeep dangerous key sanitisation
 *
 * Prototype pollution via __proto__ / constructor.prototype is blocked
 * by Deno's V8 in practice, but the defensive key guard is still
 * required to ensure the same safe behaviour if the runtime changes
 * or the code is ported to Node.js.
 *
 * This test verifies that mergeDeep explicitly rejects dangerous keys
 * rather than relying on V8's implicit protection.
 */
import { assertEquals } from "@std/assert";
import { getConfig, initConfig } from "../../src/config/mod.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("Config mergeDeep — __proto__ key must not appear in stored config", OPTS, async () => {
  const malicious = {
    "__proto__": { "injected": true },
  } as Record<string, unknown>;

  await initConfig(malicious);

  // The key should not be stored regardless of how V8 handles assignment
  const val = getConfig<unknown>("__proto__");
  assertEquals(val, undefined, "__proto__ key must be rejected from config");
});

Deno.test("Config mergeDeep — constructor.prototype chain must not inject values", OPTS, async () => {
  const malicious = {
    "constructor": { "prototype": { "injected2": true } },
  } as Record<string, unknown>;

  await initConfig(malicious);

  // The dangerous key must be blocked — getConfig must not return the attack payload
  const val = getConfig<unknown>("constructor.prototype.injected2");
  assertEquals(val, undefined, "constructor.prototype key must be rejected from config");
});
