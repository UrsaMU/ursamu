+OOCTAG

Set or view your personal OOC tag prefix.

SYNTAX
  +ooctag [<literal>]
  +ooctag reset

The literal is the full tag string (colors allowed). With
no argument, shows the effective tag. reset/clear restores
the default %cr<OOC>%cn prefix. Used by the ooc command
when &OOCFORMAT is not set.

EXAMPLES
  +ooctag
  +ooctag [%cyOOC%cn]
  +ooctag reset

SEE ALSO: ooc
