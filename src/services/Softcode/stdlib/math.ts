import { register } from "./registry.ts";
import type { EvalContext } from "../context.ts";

// ── helpers ───────────────────────────────────────────────────────────────

function num(s: string): number { return parseFloat(s) || 0; }
function int(s: string): number { return parseInt(s, 10) || 0; }
function fmt(n: number): string {
  if (!isFinite(n)) return isNaN(n) ? "NaN" : (n > 0 ? "Inf" : "-Inf");
  // Strip trailing zeros after decimal point to match TinyMUX output style.
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toPrecision(15)));
}
function stub(_a: string[], _ctx: EvalContext): Promise<string> {
  return Promise.resolve("#-1 NOT IMPLEMENTED");
}

// ── arithmetic ────────────────────────────────────────────────────────────

register("add",  async (a) => fmt(a.reduce((s, x) => s + num(x), 0)));
register("sub",  async (a) => fmt(num(a[0]) - num(a[1])));
register("mul",  async (a) => fmt(a.reduce((s, x) => s * num(x), 1)));
register("div",  async (a) => {
  const d = num(a[1]);
  if (d === 0) return "#-1 DIVISION BY ZERO";
  return fmt(num(a[0]) / d);
});
register("fdiv", async (a) => {
  const d = num(a[1]);
  if (d === 0) return "#-1 DIVISION BY ZERO";
  return fmt(num(a[0]) / d);
});
register("floordiv", async (a) => {
  const d = num(a[1]);
  if (d === 0) return "#-1 DIVISION BY ZERO";
  return fmt(Math.floor(num(a[0]) / d));
});
register("mod",  async (a) => {
  const d = num(a[1]);
  if (d === 0) return "#-1 DIVISION BY ZERO";
  return fmt(num(a[0]) % d);
});
register("remainder", async (a) => {
  const d = num(a[1]);
  if (d === 0) return "#-1 DIVISION BY ZERO";
  return fmt(num(a[0]) % d);
});
register("fmod", async (a) => {
  const d = num(a[1]);
  if (d === 0) return "#-1 DIVISION BY ZERO";
  return fmt(num(a[0]) % d);
});
register("abs",  async (a) => fmt(Math.abs(num(a[0]))));
register("iabs", async (a) => fmt(Math.abs(int(a[0]))));
register("iadd", async (a) => fmt(a.reduce((s, x) => s + int(x), 0)));
register("isub", async (a) => fmt(int(a[0]) - int(a[1])));
register("imul", async (a) => fmt(a.reduce((s, x) => s * int(x), 1)));
register("idiv", async (a) => {
  const d = int(a[1]);
  if (d === 0) return "#-1 DIVISION BY ZERO";
  return fmt(Math.trunc(int(a[0]) / d));
});
register("max",  async (a) => fmt(Math.max(...a.map(num))));
register("min",  async (a) => fmt(Math.min(...a.map(num))));
register("round",async (a) => {
  const precision = a[1] !== undefined ? int(a[1]) : 0;
  const factor = Math.pow(10, precision);
  return fmt(Math.round(num(a[0]) * factor) / factor);
});
register("ceil",  async (a) => fmt(Math.ceil(num(a[0]))));
register("floor", async (a) => fmt(Math.floor(num(a[0]))));
register("trunc", async (a) => fmt(Math.trunc(num(a[0]))));
register("sqrt",  async (a) => { const v = num(a[0]); return v < 0 ? "#-1 ARGUMENT OUT OF RANGE" : fmt(Math.sqrt(v)); });
register("power", async (a) => fmt(Math.pow(num(a[0]), num(a[1]))));
register("exp",   async (a) => fmt(Math.exp(num(a[0]))));
register("ln",    async (a) => { const v = num(a[0]); return v <= 0 ? "#-1 ARGUMENT OUT OF RANGE" : fmt(Math.log(v)); });
register("log",   async (a) => { const v = num(a[0]); return v <= 0 ? "#-1 ARGUMENT OUT OF RANGE" : fmt(Math.log10(v)); });
register("e",     async () => fmt(Math.E));
register("pi",    async () => fmt(Math.PI));
register("inc",   async (a) => fmt(num(a[0]) + 1));
register("dec",   async (a) => fmt(num(a[0]) - 1));
register("sign",  async (a) => fmt(Math.sign(num(a[0]))));
register("isign", async (a) => fmt(Math.sign(int(a[0]))));

// ── trig ──────────────────────────────────────────────────────────────────

register("sin",  async (a) => fmt(Math.sin(num(a[0]))));
register("cos",  async (a) => fmt(Math.cos(num(a[0]))));
register("tan",  async (a) => fmt(Math.tan(num(a[0]))));
register("asin", async (a) => fmt(Math.asin(num(a[0]))));
register("acos", async (a) => fmt(Math.acos(num(a[0]))));
register("atan", async (a) => fmt(Math.atan(num(a[0]))));
register("atan2",async (a) => fmt(Math.atan2(num(a[0]), num(a[1]))));

// ── random ────────────────────────────────────────────────────────────────

register("rand",  async (a) => {
  const n = int(a[0]);
  if (n <= 0) return "#-1 ARGUMENT MUST BE POSITIVE INTEGER";
  return fmt(Math.floor(Math.random() * n));
});

// ── comparison ────────────────────────────────────────────────────────────

register("eq",  async (a) => num(a[0]) === num(a[1]) ? "1" : "0");
register("neq", async (a) => num(a[0]) !== num(a[1]) ? "1" : "0");
register("lt",  async (a) => num(a[0]) <   num(a[1]) ? "1" : "0");
register("lte", async (a) => num(a[0]) <=  num(a[1]) ? "1" : "0");
register("gt",  async (a) => num(a[0]) >   num(a[1]) ? "1" : "0");
register("gte", async (a) => num(a[0]) >=  num(a[1]) ? "1" : "0");
register("comp",async (a) => {
  const l = num(a[0]), r = num(a[1]);
  return l < r ? "-1" : l > r ? "1" : "0";
});

// ── type checks ───────────────────────────────────────────────────────────

register("isnum",  async (a) => isNaN(parseFloat(a[0])) || a[0].trim() === "" ? "0" : "1");
register("isint",  async (a) => /^-?\d+$/.test(a[0].trim()) ? "1" : "0");
register("israt",  async (a) => /^-?\d+(\.\d+)?$/.test(a[0].trim()) ? "1" : "0");
register("isinf",  async (a) => !isFinite(num(a[0])) && !isNaN(num(a[0])) ? "1" : "0");
register("isword", async (a) => /^\S+$/.test(a[0]) ? "1" : "0");

// ── bitwise ───────────────────────────────────────────────────────────────

register("band",  async (a) => fmt(int(a[0]) & int(a[1])));
register("bor",   async (a) => fmt(int(a[0]) | int(a[1])));
register("bxor",  async (a) => fmt(int(a[0]) ^ int(a[1])));
register("bnand", async (a) => fmt(~(int(a[0]) & int(a[1]))));
register("shl",   async (a) => fmt(int(a[0]) << int(a[1])));
register("shr",   async (a) => fmt(int(a[0]) >> int(a[1])));

// ── base conversion ───────────────────────────────────────────────────────

register("baseconv", async (a) => {
  const from = int(a[1]);
  const to   = int(a[2]);
  if (from < 2 || from > 36 || to < 2 || to > 36) return "#-1 BASE OUT OF RANGE";
  const n = parseInt(a[0], from);
  if (isNaN(n)) return "#-1 INVALID NUMBER";
  return n.toString(to).toUpperCase();
});

// ── distance ─────────────────────────────────────────────────────────────

register("dist2d", async (a) => {
  const dx = num(a[0]) - num(a[2]);
  const dy = num(a[1]) - num(a[3]);
  return fmt(Math.sqrt(dx*dx + dy*dy));
});
register("dist3d", async (a) => {
  const dx = num(a[0]) - num(a[3]);
  const dy = num(a[1]) - num(a[4]);
  const dz = num(a[2]) - num(a[5]);
  return fmt(Math.sqrt(dx*dx + dy*dy + dz*dz));
});

// ── vector ────────────────────────────────────────────────────────────────

register("vadd",  async (a) => { const [x1,y1,z1] = a[0].split(" ").map(num); const [x2,y2,z2] = a[1].split(" ").map(num); return [fmt(x1+x2),fmt(y1+y2),fmt((z1||0)+(z2||0))].join(" "); });
register("vsub",  async (a) => { const [x1,y1,z1] = a[0].split(" ").map(num); const [x2,y2,z2] = a[1].split(" ").map(num); return [fmt(x1-x2),fmt(y1-y2),fmt((z1||0)-(z2||0))].join(" "); });
register("vmul",  async (a) => { const s = num(a[1]); return a[0].split(" ").map(x => fmt(num(x)*s)).join(" "); });
register("vmag",  async (a) => { const v = a[0].split(" ").map(num); return fmt(Math.sqrt(v.reduce((s,x) => s+x*x, 0))); });
register("vdim",  async (a) => fmt(a[0].trim().split(/\s+/).length));
register("vdot",  async (a) => { const u2 = a[0].split(" ").map(num); const v = a[1].split(" ").map(num); return fmt(u2.reduce((s,x,i) => s + x*(v[i]||0), 0)); });
register("vunit", async (a) => { const v = a[0].split(" ").map(num); const m = Math.sqrt(v.reduce((s,x) => s+x*x, 0)); return m === 0 ? a[0] : v.map(x => fmt(x/m)).join(" "); });
register("vcross",async (a) => {
  const [x1,y1,z1] = a[0].split(" ").map(num);
  const [x2,y2,z2] = a[1].split(" ").map(num);
  return [fmt(y1*z2-z1*y2), fmt(z1*x2-x1*z2), fmt(x1*y2-y1*x2)].join(" ");
});

// ── stubs for TinyMUX-only features ──────────────────────────────────────

register("successes",  stub);
register("distribute", stub);
register("bittype",    async () => "0");
register("roman",      async (a) => {
  // Basic Roman numeral conversion
  const n = int(a[0]);
  if (n <= 0 || n > 3999) return "#-1 OUT OF RANGE";
  const vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
  const syms = ["M","CM","D","CD","C","XC","L","XL","X","IX","V","IV","I"];
  let result = "", rem = n;
  for (let i = 0; i < vals.length; i++) {
    while (rem >= vals[i]) { result += syms[i]; rem -= vals[i]; }
  }
  return result;
});
