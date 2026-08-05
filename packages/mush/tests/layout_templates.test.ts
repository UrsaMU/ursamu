/**
 * game.layout template expansion for header/divider/footer.
 */
import {
  assertEquals,
  assertStringIncludes,
} from "@std/assert";
import {
  applyLayoutFromConfig,
  clearLayoutTemplates,
  divider,
  expandLayoutTemplate,
  header,
  footer,
  markdownToAnsi,
} from "../src/format/handlers.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("expandLayoutTemplate: simple center", OPTS, () => {
  const out = expandLayoutTemplate(
    "[center(%ch%cy%0%cn,%1,%cg=%cn)]",
    ["HELP", "40", "="],
  );
  assertStringIncludes(out, "%cy");
  assertStringIncludes(out, "HELP");
  assertStringIncludes(out, "%cg=%cn");
  assertEquals(out.includes("%cr"), false);
});

Deno.test(
  "expandLayoutTemplate: nested if/words/neq (COR divider)",
  OPTS,
  () => {
    const tpl =
      "[if(neq(words(%0),0), center(%ch%cy%b%0%b%cn,%1,%cg-%cn),)]";
    const withTitle = expandLayoutTemplate(tpl, [
      "Players",
      "40",
      "-",
    ]);
    assertStringIncludes(withTitle, "Players");
    assertStringIncludes(withTitle, "%cg-%cn");
    assertEquals(withTitle.includes("%cr"), false);

    const empty = expandLayoutTemplate(tpl, ["", "40", "-"]);
    assertEquals(empty, "");
  },
);

Deno.test(
  "expandLayoutTemplate: if(words(%0),...) shorthand",
  OPTS,
  () => {
    const tpl =
      "[if(words(%0),center(%ch%cy%0%cn,%1,%cg-%cn),repeat(%cg-%cn,%1))]";
    const titled = expandLayoutTemplate(tpl, ["SUB", "20", "-"]);
    assertStringIncludes(titled, "SUB");
    const bare = expandLayoutTemplate(tpl, ["", "10", "-"]);
    assertStringIncludes(bare, "%cg-%cn");
    assertEquals(bare.includes("SUB"), false);
  },
);

Deno.test("divider/header honor applied config", OPTS, () => {
  try {
    applyLayoutFromConfig({
      header: "[center(%ch%cy%b%0%b%cn,%1,%cg=%cn)]",
      divider:
        "[if(neq(words(%0),0), center(%ch%cy%b%0%b%cn,%1,%cg-%cn),)]",
      footer: "[repeat(%cg=%cn,%1)]",
    });
    const d = divider("Players", "-", 40);
    assertStringIncludes(d, "Players");
    assertStringIncludes(d, "%cg");
    assertEquals(d.includes("%cr"), false);

    const blank = divider("", "-", 40);
    assertEquals(blank, "");

    const h = header("HELP SYSTEM", "=", 40);
    assertStringIncludes(h, "HELP SYSTEM");
    assertStringIncludes(h, "%cg=%cn");

    const f = footer("", "=", 10);
    assertEquals(f.includes("%cg=%cn"), true);
  } finally {
    clearLayoutTemplates();
  }
});

Deno.test(
  "applyLayoutFromConfig(undefined) does not wipe boot templates",
  OPTS,
  () => {
    try {
      applyLayoutFromConfig({
        header: "[center(%ch%cy%0%cn,%1,%cg=%cn)]",
        footer: "[repeat(%cg=%cn,%1)]",
      });
      // Host re-apply with dual-core getConfig() → undefined
      applyLayoutFromConfig(undefined);
      applyLayoutFromConfig(null);
      assertStringIncludes(header("T", "=", 20), "%cg=%cn");
      assertStringIncludes(footer("", "=", 10), "%cg=%cn");
    } finally {
      clearLayoutTemplates();
    }
  },
);

Deno.test("expandLayoutTemplate: words counts tokens", OPTS, () => {
  assertEquals(expandLayoutTemplate("[words(%0)]", ["a b c"]), "3");
  assertEquals(expandLayoutTemplate("[words(%0)]", [""]), "0");
  assertEquals(expandLayoutTemplate("[words(%0)]", ["  x  "]), "1");
});

Deno.test(
  "expandLayoutTemplate: spaces around %0 via %b are kept",
  OPTS,
  () => {
    // Design feature: %b pads the title so fillers do not crowd the
    // label. Spaces must survive arg-split (no aggressive trim).
    const tpl = "[center(%ch%cy%b%0%b%cn,%1,%cg-%cn)]";
    const out = expandLayoutTemplate(tpl, ["Players", "40", "-"]);
    const plain = out
      .replace(/%c[a-zA-Z]/g, "")
      .replace(/%[nrtbR]/g, "");
    assertStringIncludes(plain, " Players ");
    assertEquals(plain.includes("Players"), true);

    // Spaces at the edges of the title arg (after %b expand)
    const edge = expandLayoutTemplate(
      "[center(%b%0%b,%1,=)]",
      ["X", "20", "="],
    );
    const edgePlain = edge
      .replace(/%c[a-zA-Z]/g, "")
      .replace(/%[nrtbR]/g, "");
    assertStringIncludes(edgePlain, " X ");
  },
);

Deno.test(
  "COR config header/divider keep title padding",
  OPTS,
  () => {
    try {
      applyLayoutFromConfig({
        header: "[center(%ch%cy%b%0%b%cn,%1,%cg=%cn)]",
        divider:
          "[if(neq(words(%0),0), center(%ch%cy%b%0%b%cn,%1,%cg-%cn),)]",
        footer: "[repeat(%cg=%cn,%1)]",
      });
      const plain = (s: string) =>
        s.replace(/%c[a-zA-Z]/g, "").replace(/%[nrtbR]/g, "");
      assertStringIncludes(plain(header("HELP", "=", 40)), " HELP ");
      assertStringIncludes(
        plain(divider("Players", "-", 40)),
        " Players ",
      );
    } finally {
      clearLayoutTemplates();
    }
  },
);

Deno.test(
  "header keeps multi-word titles with (#dbref) suffix",
  OPTS,
  () => {
    // look appends (#id) for editors. expandBareCalls must not treat
    // the last word + (#id) as a softcode function call.
    try {
      applyLayoutFromConfig({
        header: "[center(%ch%cy%b%0%b%cn,%1,%cg=%cn)]",
        divider:
          "[if(neq(words(%0),0), center(%ch%cy%b%0%b%cn,%1,%cg-%cn),)]",
        footer: "[repeat(%cg=%cn,%1)]",
      });
      const plain = (s: string) =>
        s
          .replace(/%c[a-zA-Z]/g, "")
          .replace(/%[nrtbR]/g, "")
          .replace(/<#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})>/g, "");
      const h = plain(header("Foo Bar Baz(#1)", "=", 78));
      assertStringIncludes(h, "Foo Bar Baz(#1)");
      assertEquals(h.includes("Foo Bar  "), false);
      const h2 = plain(header("OOC Lounge(#7)", "=", 78));
      assertStringIncludes(h2, "OOC Lounge(#7)");
    } finally {
      clearLayoutTemplates();
    }
  },
);

Deno.test(
  "header center keeps = fill with gradient moniker title",
  OPTS,
  () => {
    // Court layout: single-line center with %cg=%cn fill. Truecolor
    // monikers must not inflate visLen or the = padding disappears.
    try {
      applyLayoutFromConfig({
        header: "[center(%ch%cy%b%0%b%cn,%1,%cg=%cn)]",
      });
      const g =
        "<#ff0000>D<#ff4400>i<#ff8800>a<#ffcc00>b" +
        "<#ffff00>l<#ccff00>e<#88ff00>r<#44ff00>i" +
        "<#00ff00>e%cn";
      const title = `Character Sheet for: ${g}`;
      const h = header(title, "=", 78);
      const plain = h
        .replace(/%c[a-zA-Z]/g, "")
        .replace(/%[nrtbR]/g, "")
        .replace(/<#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})>/g, "");
      assertStringIncludes(plain, "Diablerie");
      assertStringIncludes(plain, "=");
      // Full width rule: equals on both sides of title
      assertEquals(plain.startsWith("="), true);
      assertEquals(plain.trimEnd().endsWith("="), true);
      assertEquals(plain.length >= 70, true);
    } finally {
      clearLayoutTemplates();
    }
  },
);

Deno.test("markdownToAnsi: config softcode templates", OPTS, () => {
  try {
    applyLayoutFromConfig({
      markdown: {
        h1: "%ch%cu%0%cn",
        h2: "%ch%cy%0%cn",
        bold: "%ch%cr%0%cn",
        wikilink: "%ch%cb[[%0]]%cn",
      },
    });

    const md = "# Title\n\n## Subtitle\n\nThis is **bold** text and [[Lore]].";
    const ansi = markdownToAnsi(md);

    assertStringIncludes(ansi, "%ch%cuTitle%cn");
    assertStringIncludes(ansi, "%ch%cySubtitle%cn");
    assertStringIncludes(ansi, "%ch%crbold%cn");
    assertStringIncludes(ansi, "%ch%cb[[Lore]]%cn");
  } finally {
    clearLayoutTemplates();
  }
});
