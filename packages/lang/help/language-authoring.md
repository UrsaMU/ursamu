+LANGUAGE-AUTHORING

Author guide for staff who want to add a new language to the game.
Languages are JSON files in the configured `languagesDir` (default
`data/languages/`).

MINIMAL FILE

  {
    "schema": 1,
    "name": "exampleish",
    "mode": "phoneme",
    "onsets": ["k", "t", "s"],
    "nuclei": ["a", "i", "o"],
    "codas": [""],
    "syllablePatterns": ["CV"],
    "wordLenWeights": [0, 1, 2, 1]
  }

FIELDS

  schema              Must be 1.
  name                Lowercase identifier shown in +language/list.
  mode                "phoneme" only in v1.
  onsets / nuclei /   String arrays of phoneme chunks. `nuclei` must
    codas             be non-empty. Empty string "" in `codas` allows
                      open syllables.
  syllablePatterns    Strings of C and V only ("CV", "CVC", "CCV").
                      Repeat to weight: ["CV", "CV", "CVC"].
  wordLenWeights      Index = syllable count, value = weight. Sum > 0.
                      Index 0 should usually be 0.
  capitalize          "first" (default), "all", or "none".
  accentSubs          Substring substitutions applied to pass-through
                      words at the "passing" and "proficient" tiers.
  description         One-line summary for +language/list.

INSTALL

  1. Save the file as <languagesDir>/<name>.json.
  2. Run +language/reload (wizard only).
  3. Verify with +language/list.

VALIDATION

  +language/reload reports validation errors inline. Fix and reload.

SEE ALSO: +help language
