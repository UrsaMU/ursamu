// ─── EXPLOIT: Persona ANSI Escape Code Injection ─────────────────────────────
//
// VULNERABILITY: social/persona.ts createPersona() strips non-ASCII characters
//   (regex /[^\x20-\x7E]/g) but ANSI escape sequences (\x1b[31m etc.) are
//   within the 0x00-0x7E range and pass through unchecked.
//
// EXPLOIT: A player sets a persona name containing terminal color codes.
//   When displayed to an admin in-game (via +gm/persona), the escape codes
//   corrupt terminal output or hide subsequent text (e.g., \x1b[2J clears screen).
//
// Red phase: these tests FAIL before the fix (exploit succeeds).
// Green phase: these tests PASS after the fix (escape codes are stripped).

import {
  assertEquals,
  assertNotMatch,
  assertStringIncludes,
} from "@std/assert";
import { createPersona } from "../../social/persona.ts";
import { gmPersonas } from "../../social/persona.ts";

// Cleanup helper
async function cleanPersonas(playerId: string): Promise<void> {
  const all = await gmPersonas.query(
    { playerId } as Parameters<typeof gmPersonas.query>[0],
  );
  for (const p of all as Array<{ id: string }>) {
    await gmPersonas.delete(
      { id: p.id } as Parameters<typeof gmPersonas.delete>[0],
    ).catch(() => {});
  }
}

const UID = `persona-sec-${Date.now()}`;

Deno.test({
  name: "SECURITY: persona name must strip ANSI escape codes",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await cleanPersonas(UID);
    // ESC[31m = red color, ESC[0m = reset — valid ASCII range but dangerous
    const maliciousName = "Player\x1b[31mREDTEXT\x1b[0m";
    const persona = await createPersona(UID, maliciousName);

    // The stored name must contain NO ESC character (\x1b = 0x1b)
    assertEquals(
      persona.name.includes("\x1b"),
      false,
      `BUG: ANSI escape code survived sanitization in persona name: ${
        JSON.stringify(persona.name)
      }`,
    );
    // Should still contain the visible text without escape codes
    assertStringIncludes(persona.name, "Player");
    await cleanPersonas(UID);
  },
});

Deno.test("SECURITY: persona name must strip terminal control characters", async () => {
  await cleanPersonas(UID);
  // \x07 = BEL (bell), \x08 = backspace, \x0d = carriage return
  const controlName = "Evil\x07Bell\x08Back\x0dReturn";
  const persona = await createPersona(UID, controlName);

  assertNotMatch(
    persona.name,
    // deno-lint-ignore no-control-regex
    /[\x00-\x1f]/,
    `BUG: control character survived in persona name: ${
      JSON.stringify(persona.name)
    }`,
  );
  await cleanPersonas(UID);
});

Deno.test("SECURITY: persona name must strip screen-clearing sequences", async () => {
  await cleanPersonas(UID);
  // ESC[2J clears the entire terminal screen
  const clearScreen = "GoodName\x1b[2J";
  const persona = await createPersona(UID, clearScreen);

  assertEquals(
    persona.name.includes("\x1b"),
    false,
    `BUG: screen-clear escape code in persona name: ${
      JSON.stringify(persona.name)
    }`,
  );
  assertStringIncludes(persona.name, "GoodName");
  await cleanPersonas(UID);
});

Deno.test("SECURITY: persona name must reject pure-escape-code input", async () => {
  await cleanPersonas(UID);
  // A name that is ONLY ANSI codes should result in an empty/rejected name
  let threw = false;
  try {
    await createPersona(UID, "\x1b[31m\x1b[0m");
  } catch {
    threw = true;
  }
  assertEquals(
    threw,
    true,
    "BUG: persona with only escape codes was accepted (should throw — empty after strip)",
  );
  await cleanPersonas(UID);
});
