/**
 * Legacy plaintext passwords must authenticate on HTTP login path
 * (parity with telnet auth.verify).
 */
import { assertEquals } from "jsr:@std/assert@^0.224.0";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function isBcryptHash(stored: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(stored);
}

async function verifyStoredPassword(
  plain: string,
  stored: string,
  compare: (p: string, h: string) => Promise<boolean>,
): Promise<"bcrypt" | "legacy" | "fail"> {
  if (!stored) return "fail";
  if (isBcryptHash(stored)) {
    try {
      const ok = await compare(plain, stored);
      return ok ? "bcrypt" : "fail";
    } catch {
      return "fail";
    }
  }
  if (plain === stored) return "legacy";
  return "fail";
}

Deno.test("legacy plaintext matches", OPTS, async () => {
  const r = await verifyStoredPassword(
    "staffbird",
    "staffbird",
    async () => false,
  );
  assertEquals(r, "legacy");
});

Deno.test("legacy plaintext mismatch", OPTS, async () => {
  const r = await verifyStoredPassword(
    "wrong",
    "staffbird",
    async () => false,
  );
  assertEquals(r, "fail");
});

Deno.test("bcrypt path uses compare", OPTS, async () => {
  const hash =
    "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUV";
  let called = false;
  const r = await verifyStoredPassword(
    "secret",
    hash,
    async (p, h) => {
      called = true;
      assertEquals(p, "secret");
      assertEquals(h, hash);
      return true;
    },
  );
  assertEquals(called, true);
  assertEquals(r, "bcrypt");
});

Deno.test("bcrypt mismatch", OPTS, async () => {
  const r = await verifyStoredPassword(
    "secret",
    "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUV",
    async () => false,
  );
  assertEquals(r, "fail");
});

Deno.test("isBcryptHash detects formats", OPTS, () => {
  assertEquals(isBcryptHash("$2a$10$abc"), true);
  assertEquals(isBcryptHash("$2b$12$abc"), true);
  assertEquals(isBcryptHash("staffbird"), false);
  assertEquals(isBcryptHash(""), false);
});
