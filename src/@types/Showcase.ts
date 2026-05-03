/**
 * @module @types/Showcase
 * TypeScript types for the plugin showcase JSON format.
 * Showcase files live at src/plugins/<name>/showcases/<key>.json (in-tree)
 * or showcases/<key>.json (standalone plugin).
 */

export interface ShowcaseStepSub    { sub: string }
export interface ShowcaseStepNote   { note: string }
export interface ShowcaseStepReset  { reset: true }
export interface ShowcaseStepEmit   { emit: string; label?: string }
export interface ShowcaseStepExpect { expect: string; label?: string }

export interface ShowcaseStepCmd {
  cmd:     string;
  label?:  string;
  as?:     "player" | "admin" | "wizard";
  store?:  string;
  output?: string[];
}

export interface ShowcaseStepEval {
  eval:    string;
  label?:  string;
  store?:  string;
  output?: string[];
}

export type ShowcaseStep =
  | ShowcaseStepSub
  | ShowcaseStepNote
  | ShowcaseStepReset
  | ShowcaseStepEmit
  | ShowcaseStepExpect
  | ShowcaseStepCmd
  | ShowcaseStepEval;

export interface ShowcaseFile {
  key:     string;
  label:   string;
  plugin?: string;
  vars?:   Record<string, string>;
  steps:   ShowcaseStep[];
}
