---
dark: true
---
See also: +help staff (overview)

+BATCHBUILD

  Save and run zone build scripts (admin+ only).

SYNTAX
  @batchbuild/save <zone>=<filename>
  @batchbuild/run <filename>
  @batchbuild/list

  Files live under builds/. Lines are commands; # comments.

EXAMPLES
  @batchbuild/save Market District=market
  @batchbuild/run market
  @batchbuild/list

SEE ALSO: +help zone/zone, +help rooms/dig
