// ─── Ingestion Pipeline Schemas ───────────────────────────────────────────────

export type IngestionPhase =
  | "queued"
  | "extracting"
  | "analyzing"
  | "reviewing"
  | "committed"
  | "failed";

// ─── A single chunk of text extracted from a source file ─────────────────────

export interface ITextChunk {
  sourceFile: string;
  section?: string; // heading or chapter name if detectable
  text: string;
  chunkIndex: number;
}

// ─── Structured data extracted from one or more chunks ───────────────────────

export interface IChunkExtraction {
  chunkIndex: number;
  sourceFile: string;
  section?: string;
  gameName?: string;
  stats?: string[];
  categories?: string[];
  statsByCategory?: Record<string, string[]>;
  moveThresholds?: { fullSuccess?: number; partialSuccess?: number };
  hardMoves?: string[];
  softMoves?: string[];
  coreRulesExcerpt?: string;
  adjudicationHint?: string;
  missConsequenceHint?: string;
  tone?: string;
  confidence: "high" | "uncertain";
  notes?: string; // agent working notes
}

// ─── Draft game system assembled from all extractions ────────────────────────

export interface IGameSystemDraft {
  gameName: string;
  version: string;
  stats: string[];
  categories: string[];
  statsByCategory: Record<string, string[]>;
  moveThresholds: { fullSuccess: number; partialSuccess: number };
  hardMoves: string[];
  softMoves: string[];
  coreRulesPrompt: string;
  adjudicationHint: string;
  missConsequenceHint: string;
  tone: string;
}

// ─── An item the AI flagged as uncertain or conflicted ───────────────────────

export interface IUncertainItem {
  id: string;
  field: string; // e.g. "moveThresholds.partialSuccess"
  foundValues: string[]; // conflicting values found across books
  sources: string[]; // which files each value came from
  gmSuggestion: string; // AI recommendation with reasoning
  resolved: boolean;
  resolvedValue?: unknown;
}

// ─── A message in the admin setup conversation ───────────────────────────────

export interface IIngestionExchange {
  role: "gm" | "admin";
  adminId?: string;
  adminName?: string;
  message: string;
  timestamp: string; // ISO string — KV-safe
}

// ─── The full ingestion job record ───────────────────────────────────────────

export interface IIngestionJob {
  id: string;
  files: string[];
  phase: IngestionPhase;
  draft?: IGameSystemDraft;
  extractions?: IChunkExtraction[];
  uncertainItems: IUncertainItem[];
  exchanges: IIngestionExchange[];
  adminIds: string[];
  startedAt: string; // ISO string
  updatedAt: string; // ISO string
  error?: string;
  committedSystemId?: string;
}
