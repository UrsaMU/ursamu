WOD20TH LOOK AND FORMAT

How sheet, look, who, and +finger output is styled on this game.

PIPELINE
  Page chrome (headers, dividers, footers) and look/who/+finger
  columns are rendered by the shared @ursamu/globals (sgp) engine.
  The wod20th plugin layers a theme overlay on top of sgp so all
  +sheet, look, and dashboard output shares one consistent look.

THEME
  Borders red (%cr), titles bold gold (%ch%cy), accents cyan (%cc).
  Short-desc and idle columns on look are disabled by overlay.

PREVIEW
  Header:  ====< Character Sheet for: Wolfsbane >=================
  Divider: -----< Attributes >--------------------------------------
  Footer:  =============================================================

SEE ALSO: +help wod20th, +help sheet
