/**
 * Shared bridge graduation helper (import-plugin + tests).
 */

export function patchBridgeSource(
  src: string,
  opts: {
    routeName: string;
    label: string;
    order: number;
    keepEmbed: boolean;
    pluginId?: string;
  },
): { text: string; changed: boolean; note: string } {
  const id = opts.pluginId ?? opts.routeName;
  let text = src;

  const hasPageCall = /registerStaffPage/.test(text) ||
    /softRegisterStaffPage/.test(text);

  if (new RegExp(`route:\\s*["']${opts.routeName}["']`).test(text)) {
    if (!opts.keepEmbed && /embed:\s*["'][^"']+["']/.test(text)) {
      text = text.replace(/,?\s*embed:\s*["'][^"']*["']/g, "");
      text = text.replace(/,\s*,/g, ",").replace(/\{\s*,/g, "{");
      return {
        text,
        changed: true,
        note: "removed embed (route already set)",
      };
    }
    return { text, changed: false, note: "bridge already graduated" };
  }

  if (hasPageCall || /embed:\s*["']/.test(text)) {
    let changed = false;
    if (/id:\s*["'][^"']+["']/.test(text)) {
      text = text.replace(
        /(id:\s*["'][^"']+["']\s*,)/,
        `$1\n      route: "${opts.routeName}",`,
      );
      changed = true;
    } else if (/label:\s*["'][^"']+["']/.test(text)) {
      text = text.replace(
        /(label:\s*["'][^"']+["']\s*,)/,
        `$1\n      route: "${opts.routeName}",`,
      );
      changed = true;
    }

    if (!opts.keepEmbed) {
      const before = text;
      text = text.replace(/,?\s*embed:\s*["'][^"']*["']/g, "");
      if (text !== before) changed = true;
    }

    if (
      /route:\s*["']/.test(text) &&
      !new RegExp(`route:\\s*["']${opts.routeName}["']`).test(text)
    ) {
      text = text.replace(
        /route:\s*["'][^"']*["']/,
        `route: "${opts.routeName}"`,
      );
      changed = true;
    }

    text = text.replace(/,\s*,/g, ",").replace(/\{\s*,/g, "{");

    if (changed) {
      return {
        text,
        changed: true,
        note: opts.keepEmbed
          ? "set route (kept embed fallback)"
          : "set route, removed embed",
      };
    }
  }

  if (/registerStaffNav/.test(text)) {
    if (/route:\s*["'][^"']+["']/.test(text)) {
      text = text.replace(
        /route:\s*["'][^"']+["']/,
        `route: "${opts.routeName}"`,
      );
      return {
        text,
        changed: true,
        note: "updated registerStaffNav route",
      };
    }
  }

  const appendix = `

// --- graduated by web:import-plugin ---
// Prefer host route over embed:
// registerStaffPage({
//   id: "${id}",
//   label: "${opts.label}",
//   route: "${opts.routeName}",
//   order: ${opts.order},
// });
`;
  if (!text.includes("graduated by web:import-plugin")) {
    return {
      text: text.trimEnd() + appendix,
      changed: true,
      note: "appended graduation comment (no auto pattern matched)",
    };
  }
  return { text, changed: false, note: "no bridge changes" };
}
