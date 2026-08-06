+VAMPIRE  -- Vampire: The Requiem 2e overlay (chargen).

Kindred chargen: Clan, Covenant, Mask, Dirge, Touchstone,
10 Merit dots, 3 Discipline dots (≥2 in-clan). Blood Potency
1, Humanity 7, Vitae pool from BP.

CHARGEN
  +cg/set template=vampire
  +cg/list clans|covenants|disciplines|masks
  +cg/set clan=<name>  covenant=<name>
  +cg/set touchstone=<text>   bloodline=<text> (opt)
  +cg/set mask=<arch>  dirge=<arch>
  Stage 7: +cg/set <discipline>=<dots>

SHEET
  Mask/Dirge replace Virtue/Vice labels. Clan, Covenant,
  Touchstone (and Bloodline if set) appear in the header.
  Disciplines render under DISCIPLINES.

SEE ALSO: help cg, help sheet, help templates, help info
