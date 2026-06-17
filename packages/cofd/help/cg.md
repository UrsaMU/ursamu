+cg  -- Interactive six-stage character generation. Each stage
        validates point budgets before advancing.

SYNTAX
  +cg                       View current stage and progress.
  +cg/set <trait>=<value>   Set a trait or option.
  +cg/list [<topic>]        Show available options for a field.
  +cg/back                  Return to previous stage.
  +cg/reset                 Start over with a blank Mortal sheet.
  +cg/submit                Validate current stage and advance.

STAGES
  1. Identity     Concept, Virtue, Vice.
  2. Template     Mortal, Changeling: The Lost.
  3. Specifics    Seeming, Kith, Court, Needle, Thread.
  4. Attributes   Distribute {5, 4, 3} extra dots above 1.
  5. Skills       Distribute {11, 9, 7} dots.
  6. Powers       Mortal 0, Changeling 3.

After stage-6 /submit the sheet finalizes; edit via +sheet/set.

SEE ALSO: help cg/examples, help sheet, help roll
