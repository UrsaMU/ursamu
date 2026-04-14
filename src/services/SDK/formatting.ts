/**
 * @module services/SDK/formatting
 *
 * sprintf and template formatting utilities shared between the native SDK
 * (SDK/index.ts) and the sandbox worker (Sandbox/worker.ts).
 */

// ── Internal helpers ──────────────────────────────────────────────────────────

export const _padStr = (s: string, width: number, align: string, fill = " "): string => {
  const pad = Math.max(0, width - s.length);
  if (align === "right")  return fill.repeat(pad) + s;
  if (align === "center") {
    const left = Math.floor(pad / 2);
    return fill.repeat(left) + s + fill.repeat(pad - left);
  }
  return s + fill.repeat(pad);
};

export const _getRawVal = (raw: unknown, idx: number): string => {
  if (Array.isArray(raw)) return idx < raw.length ? String(raw[idx]) : "";
  if (raw && typeof raw === "object" && "value" in raw) {
    const v = (raw as { value: unknown }).value;
    return Array.isArray(v) ? (idx < v.length ? String(v[idx]) : "") : String(v);
  }
  return raw != null ? String(raw) : "";
};

export const _getRawAlign = (raw: unknown): string => {
  if (raw && typeof raw === "object" && !Array.isArray(raw) && "align" in raw)
    return String((raw as { align: unknown }).align);
  return "left";
};

// ── Public API ────────────────────────────────────────────────────────────────

export const sprintf = (fmt: string, ...args: unknown[]): string => {
  let i = 0;
  return fmt.replace(
    /%([+\- ]?)(\d*)(?:\.(\d+))?([sdifebotxX%])/g,
    (_: string, flag: string, width: string, prec: string, spec: string) => {
      if (spec === "%") return "%";
      const arg = args[i++];
      let s: string;
      switch (spec) {
        case "s": s = String(arg ?? ""); break;
        case "d": case "i": s = String(Math.trunc(Number(arg))); break;
        case "f": s = prec !== undefined ? Number(arg).toFixed(Number(prec)) : String(Number(arg)); break;
        case "e": s = prec !== undefined ? Number(arg).toExponential(Number(prec)) : Number(arg).toExponential(); break;
        case "b": s = Number(arg).toString(2); break;
        case "o": s = Number(arg).toString(8); break;
        case "x": s = Number(arg).toString(16); break;
        case "X": s = Number(arg).toString(16).toUpperCase(); break;
        case "t": s = String(Boolean(arg)); break;
        default:  s = String(arg ?? "");
      }
      const w = Number(width);
      return w > s.length
        ? flag === "-" ? s + " ".repeat(w - s.length) : " ".repeat(w - s.length) + s
        : s;
    }
  );
};

export const templateFn = (
  str: string,
  data?: Record<string, string | string[] | { value: string | string[]; align?: "left" | "right" | "center" }>
): string => {
  if (!data) return str;
  let maxRows = 1;
  for (const v of Object.values(data)) {
    if (Array.isArray(v)) maxRows = Math.max(maxRows, v.length);
    else if (v && typeof v === "object" && "value" in v && Array.isArray(v.value))
      maxRows = Math.max(maxRows, v.value.length);
  }
  const processRow = (rowIdx: number) =>
    str.replace(
      /\[([A-Z])\1*\]|\[([a-z])\2*\]|([a-z])\3+/g,
      (match: string, ucKey: string, lcBracketed: string, lcNoBracket: string) => {
        if (ucKey)       return "[" + _padStr(_getRawVal(data[ucKey], rowIdx), match.length - 2, _getRawAlign(data[ucKey])) + "]";
        if (lcBracketed) return _padStr(_getRawVal(data[lcBracketed], rowIdx), match.length, _getRawAlign(data[lcBracketed]));
        return _padStr(_getRawVal(data[lcNoBracket], rowIdx), match.length, _getRawAlign(data[lcNoBracket]));
      }
    );
  const rows: string[] = [];
  for (let i = 0; i < maxRows; i++) rows.push(processRow(i));
  return rows.join("\n");
};
