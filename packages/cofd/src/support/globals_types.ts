// Minimal PartialTheme shape used by CoFD layout overlay.
// Kept local so the package does not depend on an unpublished
// @ursamu/globals peer at JSR publish time.

export interface GlobalsThemeTokens {
  sep: string;
  title: string;
  section: string;
  hint?: string;
  smaj?: string;
  smin?: string;
}

export type PartialTheme = {
  headerfmt?: string;
  dividerfmt?: string;
  footerfmt?: string;
  tokens?: Partial<GlobalsThemeTokens>;
  colors?: {
    border?: string;
    header?: string;
    label?: string;
    accent?: string;
  };
};
