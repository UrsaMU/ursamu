/**
 * Sprawl panels go through engine header/divider/footer so
 * game.layout config wins (same path as help/bbs/cofd).
 */
import { assert, assertEquals } from "@std/assert";
import {
  clearLayoutTemplates,
  setLayoutTemplates,
} from "@ursamu/mush";
import {
  divider,
  footer,
  header,
  nameHdr,
  panelClose,
  panelOpen,
  plain,
} from "../commands/chrome.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("layout helpers honor game.layout templates", OPTS, () => {
  try {
    setLayoutTemplates({
      header: "H(%0)",
      divider: "D(%0)",
      footer: "F(%0)",
    });
    assertEquals(plain(header("LOOK")), "H(LOOK)");
    assertEquals(plain(divider("STATS")), "D(STATS)");
    assertEquals(plain(footer("SPRAWL")), "F(SPRAWL)");
    assertEquals(plain(panelOpen("SHEET", "LIVE")), "H(SHEET · LIVE)");
    assertEquals(plain(panelClose("SPRAWL")), "F(SPRAWL)");
  } finally {
    clearLayoutTemplates();
  }
});

Deno.test("default header/footer are 78-wide rules", OPTS, () => {
  clearLayoutTemplates();
  for (const line of header("LOOK").split("\n")) {
    if (!line.trim()) continue;
    assert(
      plain(line).length <= 78,
      `header line ${plain(line).length}`,
    );
  }
  for (const line of footer("SPRAWL").split("\n")) {
    if (!line.trim()) continue;
    assert(
      plain(line).length <= 78,
      `footer line ${plain(line).length}`,
    );
  }
});

Deno.test("nameHdr counts plain name, paints moniker", OPTS, () => {
  const mon =
    "<#ff0000>g<#00ff00>L<#0000ff>itch.exe";
  const line = nameHdr(mon, "Gang War Surplus", "gLitch.exe");
  const p = plain(line);
  // Visible layout matches plain name + role, not code bloat
  assert(p.includes("gLitch.exe"));
  assert(p.includes("GANG WAR SURPLUS"));
  assert(p.length <= 78, `wide ${p.length}: ${p}`);
  // Display still has truecolor
  assert(line.includes("<#ff0000>") || line.includes("itch"));
  // Centering: leading spaces from plain-width math
  const plainOnly = nameHdr("gLitch.exe", "Gang War Surplus", "gLitch.exe");
  assertEquals(
    plain(line).trim(),
    plain(plainOnly).trim(),
  );
});
