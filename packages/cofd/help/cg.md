+cg  -- Interactive character generation. Each stage
        validates point budgets before advancing.
SYNTAX
  +cg                       View current stage and progress.
  +cg/set <trait>=<value>   Set a trait or option.
  +cg/list [<topic>]        Show available options for a field.
  +cg/back                  Return to previous stage.
  +cg/reset                 You: wipe sheet + draft, restart.
  +cg/wipe <p>[=reason]     Staff: full wipe of a character bit.
  +cg/submit                Validate current stage and advance.
STAGES
  1. Identity     Concept, Virtue/Vice (or Mask/Dirge).
  2. Template     Mortal, Changeling, Vampire.
  3. Specifics    Splat fields (clan/covenant, seeming…).
  4. Attributes   Distribute {5, 4, 3} extra dots above 1.
  5. Skills       Distribute {11, 9, 7} dots.
  6. Merits       Mortal/Changeling 7, Vampire 10.
  7. Powers       Changeling Contracts; Vampire Disciplines.
AFTER FINAL /SUBMIT
  Staff reviews with +sheet <you>, then +approve or
  +deny=<reason>. Until approved, edit via +cg.
SEE ALSO: help sheet, help approve, help deny, help cg/wipe,
  help templates, help changeling, help vampire
