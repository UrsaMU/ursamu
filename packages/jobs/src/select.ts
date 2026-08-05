/**
 * +jobs/select runner — eval AST from select-parse.
 */
import type { IJob } from "./types.ts";
import {
  isOpenJob,
  isOverdue,
  matchesMine,
  parseDue,
} from "./filter.ts";
import { getEscalation, isNew } from "./format.ts";
import {
  parseExpr,
  tokenize,
  type SelectAst,
} from "./select-parse.ts";

const MAX_LEN = 512;

export interface SelectResult {
  jobs: IJob[];
  error?: string;
}

export function runSelect(
  jobs: IJob[],
  expr: string,
  meId: string,
  now = Date.now(),
): SelectResult {
  const raw = expr.trim();
  if (!raw) return { jobs: [], error: "empty expression" };
  if (raw.length > MAX_LEN) {
    return { jobs: [], error: "expression too long" };
  }
  try {
    let sort = "jobnum";
    let body = raw;
    const sortM = body.match(/\bsort\s*=\s*(-?[a-z]+)\s*$/i);
    if (sortM) {
      sort = sortM[1].toLowerCase();
      body = body.slice(0, sortM.index).trim();
    }
    const toks = tokenize(body);
    const ast = parseExpr(toks);
    if (toks.i < toks.list.length) {
      return { jobs: [], error: "trailing tokens" };
    }
    let out = jobs.filter((j) => evalAst(ast, j, meId, now));
    out = applySort(out, sort);
    return { jobs: out };
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : String(e);
    return { jobs: [], error: m };
  }
}

function evalAst(
  a: SelectAst,
  j: IJob,
  meId: string,
  now: number,
): boolean {
  switch (a.k) {
    case "not":
      return !evalAst(a.x, j, meId, now);
    case "and":
      return evalAst(a.a, j, meId, now) &&
        evalAst(a.b, j, meId, now);
    case "or":
      return evalAst(a.a, j, meId, now) ||
        evalAst(a.b, j, meId, now);
    case "atom":
      return evalAtom(a.name, a.op, a.val, j, meId, now);
  }
}

function evalAtom(
  name: string,
  op: string | undefined,
  val: string | undefined,
  j: IJob,
  meId: string,
  now: number,
): boolean {
  const open = isOpenJob(j);
  switch (name) {
    case "all":
    case "viewing":
    case "monitor":
      return open;
    case "new":
      return open && isNew(j);
    case "mine":
      return open && matchesMine(j, meId);
    case "overdue":
      return isOverdue(j, now);
    case "published":
      return j.published !== false;
    case "public":
    case "myjobs":
      return j.published !== false && !j.staffOnly;
    case "tagged":
      return (j.tags?.length ?? 0) > 0;
    case "summary":
      return !!(j.summary && j.summary.trim());
    case "hidden":
      return !!j.staffOnly;
    case "who":
      return matchWho(j, val ?? "");
    case "source":
    case "from":
      return matchFrom(j, val ?? "");
    case "pri":
    case "esc":
      return matchEsc(j, (val ?? "").toLowerCase());
    case "status":
    case "progress":
      return matchStatus(j, (val ?? "").toLowerCase());
    case "bucket":
      return (j.bucket || j.category || "").toUpperCase() ===
        (val ?? "").toUpperCase();
    case "search":
      return matchSearch(j, val ?? "");
    case "due":
      return matchDue(j, op ?? "<=", val ?? "", now);
    default:
      throw new Error(`unknown criterion: ${name}`);
  }
}

function matchWho(j: IJob, val: string): boolean {
  if (!val || val.toLowerCase() === "none") return !j.assignedTo;
  const q = val.toLowerCase();
  return (j.assigneeName || "").toLowerCase().includes(q) ||
    j.assignedTo === val;
}

function matchFrom(j: IJob, val: string): boolean {
  const q = val.toLowerCase();
  return j.submitterName.toLowerCase().includes(q) ||
    j.submittedBy === val;
}

function matchEsc(j: IJob, col: string): boolean {
  if (j.esc) return j.esc === col;
  const e = getEscalation(j);
  if (col === "red") return e.color.includes("%cr");
  if (col === "yellow") return e.color.includes("%cy");
  if (col === "green") {
    return e.color.includes("%cg") || e.label === "NEW" ||
      e.label === "";
  }
  return false;
}

function matchStatus(j: IJob, st: string): boolean {
  if (
    st === "open" || st === "closed" || st === "new" ||
    st === "cancelled" || st === "resolved"
  ) {
    return j.status === st;
  }
  return (j.progress ?? "").toLowerCase() === st;
}

function matchSearch(j: IJob, q: string): boolean {
  if (!q) return false;
  const blob = [
    j.title,
    j.description,
    j.summary ?? "",
    ...j.comments.map((c) => c.text),
  ].join("\n").toLowerCase();
  return blob.includes(q.toLowerCase());
}

function matchDue(
  j: IJob,
  op: string,
  val: string,
  now: number,
): boolean {
  const bound = parseDue(val, now);
  if (bound == null) return false;
  const d = j.dueAt;
  if (d == null) return op === ">=" || op === ">";
  if (op === "<=" || op === "<") return d <= bound;
  if (op === ">=" || op === ">") return d >= bound;
  if (op === "=" || op === "==") return d === bound;
  return false;
}

function applySort(jobs: IJob[], sort: string): IJob[] {
  const rev = sort.startsWith("-");
  const key = rev ? sort.slice(1) : sort;
  const arr = [...jobs];
  const cmp = (a: IJob, b: IJob): number => {
    if (key === "bucket") {
      return (a.bucket || "").localeCompare(b.bucket || "") ||
        a.number - b.number;
    }
    if (key === "date") return a.updatedAt - b.updatedAt;
    if (key === "due") {
      return (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity);
    }
    if (key === "pri") {
      const r = (j: IJob) =>
        j.esc === "red" ? 0 : j.esc === "yellow" ? 1 : 2;
      return r(a) - r(b) || a.number - b.number;
    }
    return a.number - b.number;
  };
  arr.sort((a, b) => (rev ? -cmp(a, b) : cmp(a, b)));
  return arr;
}
