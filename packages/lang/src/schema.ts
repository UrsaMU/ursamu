export interface LangDef {
  schema: 1;
  name: string;
  mode: "phoneme" | "markov";
  onsets: string[];
  nuclei: string[];
  codas: string[];
  syllablePatterns: string[];
  wordLenWeights: number[];
  capitalize?: "first" | "all" | "none";
  accentSubs?: Record<string, string>;
  description?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const PATTERN_RE = /^[CV]+$/;

export function validateLangDef(raw: unknown, fileLabel: string): ValidationResult {
  const errors: string[] = [];
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, errors: [`${fileLabel}: not an object`] };
  }
  const r = raw as Record<string, unknown>;

  if (r.schema !== 1) errors.push(`${fileLabel}: schema must be 1`);
  if (typeof r.name !== "string" || !r.name.trim()) errors.push(`${fileLabel}: name required`);
  if (r.mode !== "phoneme" && r.mode !== "markov") errors.push(`${fileLabel}: mode must be "phoneme" or "markov"`);
  if (r.mode === "markov") errors.push(`${fileLabel}: markov mode not implemented in v1`);

  for (const k of ["onsets", "nuclei", "codas", "syllablePatterns"] as const) {
    if (!Array.isArray(r[k]) || (r[k] as unknown[]).some((x) => typeof x !== "string")) {
      errors.push(`${fileLabel}: ${k} must be string[]`);
    }
  }
  if (Array.isArray(r.nuclei) && (r.nuclei as string[]).length === 0) {
    errors.push(`${fileLabel}: nuclei must be non-empty`);
  }
  if (Array.isArray(r.syllablePatterns)) {
    for (const p of r.syllablePatterns as string[]) {
      if (typeof p !== "string" || !PATTERN_RE.test(p)) {
        errors.push(`${fileLabel}: invalid syllable pattern "${p}" (use C and V only)`);
      }
    }
  }
  if (!Array.isArray(r.wordLenWeights) || (r.wordLenWeights as unknown[]).some((x) => typeof x !== "number" || (x as number) < 0)) {
    errors.push(`${fileLabel}: wordLenWeights must be non-negative number[]`);
  } else if ((r.wordLenWeights as number[]).reduce((a, b) => a + b, 0) <= 0) {
    errors.push(`${fileLabel}: wordLenWeights sum must be > 0`);
  }
  if (r.capitalize !== undefined && !["first", "all", "none"].includes(r.capitalize as string)) {
    errors.push(`${fileLabel}: capitalize must be first|all|none`);
  }

  return { ok: errors.length === 0, errors };
}
