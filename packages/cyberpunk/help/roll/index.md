+ROLL

Roll dice or make a skill check.

Uses STAT + skill + 1d10 with wound, cyberware, and cyberpsychosis
modifiers applied automatically. Natural 10 adds a crit bonus;
natural 1 triggers a fumble penalty.

SYNTAX
  +roll <expression>

EXPRESSIONS
  <stat>+<skill>             Stat + skill + 1d10.
  <stat>+<skill> vs <DV>     Roll against a difficulty value.
  <stat>+<skill>+<mod>       Add a flat modifier.
  <NdX>                      Roll N dice of X sides.
EXAMPLES
  +roll ref+handgun              Roll REF + Handgun.
  +roll cool+persuasion vs 15    Roll vs DV 15.
  +roll 3d6                      Roll 3d6 for damage.

SEE ALSO: +help roll/luck, +help facedown
