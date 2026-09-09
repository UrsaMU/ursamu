DESC -- Set Descriptions (Plane-Aware)

  Set the description of any object you can edit. Without a switch
  the default description is written. With a switch, you set the
  description shown to viewers IN that reality plane (e.g.
  /penumbra is what Garou in the Umbra see).

SYNTAX
  @desc <target>=<value>
  @desc/<plane> <target>=<value>
  @desc[/<plane>] <target>=          (clear -- empty value)

TARGETS
  me, here, or any name you can edit.

SWITCHES
  /<plane>   Lower-case slug of a reality plane:
             penumbra, deep-umbra, near-umbra, astral, shadowlands

EXAMPLES
  @desc here=A still pool that mirrors the moon...
  @desc/penumbra here=The pool is a portal of liquid silver...
  @desc me=A tall figure in a worn leather jacket.
  @desc/penumbra me=A wolf-shape woven of moonlight.
  @desc/penumbra Strongbox=          (clears penumbra desc)

NOTES
  Descriptions are limited to 4096 characters. The plane key is
  free-form kebab-case -- any matching state.reality value is shown.

SEE ALSO: +help look, +help stepside, +help wod20th
