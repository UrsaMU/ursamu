SOFTCODE LOGIC FUNCTIONS

See also: softcode/index, softcode/registers, softcode/math

NOTE ON EAGER EVALUATION: All function arguments are evaluated before
the function is called. This means both branches of if()/ifelse() are
always evaluated. For side-effect-free expressions this does not matter,
but recursive user functions should be aware that all branches run.

-------------------------------------------------------------------------------
BOOLEAN
-------------------------------------------------------------------------------

t(<val>)
  Returns 1 if val is "true" (non-empty and non-zero), else 0.
  > [t(hello)] → 1   [t(0)] → 0   [t()] → 0

not(<val>)
  Returns 1 if val is false, 0 if val is true.
  > [not(0)] → 1   [not(1)] → 0

and(<v1>,<v2>[,...])
  Returns 1 if ALL arguments are true.
  > [and(1,1,1)] → 1   [and(1,0,1)] → 0

or(<v1>,<v2>[,...])
  Returns 1 if ANY argument is true.
  > [or(0,0,1)] → 1   [or(0,0,0)] → 0

xor(<v1>,<v2>)
  Returns 1 if exactly one of the two arguments is true.
  > [xor(1,0)] → 1   [xor(1,1)] → 0

andbool(<v1>,<v2>[,...])  Alias for and().
orbool(<v1>,<v2>[,...])   Alias for or().

cand(<v1>,<v2>[,...])
  Short-circuit AND. Functionally equivalent to and() (all args are
  pre-evaluated by the softcode engine).

cor(<v1>,<v2>[,...])
  Short-circuit OR. Functionally equivalent to or().

candbool(<v1>,<v2>[,...])  Alias for cand().
corbool(<v1>,<v2>[,...])   Alias for cor().

-------------------------------------------------------------------------------
FLAG TESTS
-------------------------------------------------------------------------------

andflags(<obj>,<flags>)
  Returns 1 if <obj> has ALL of the specified flags.
  <flags> is a string of flag codes (e.g. "Wc" = wizard AND connected).
  > [andflags(me,Wc)] → 1  (if you are wizard and connected)

orflags(<obj>,<flags>)
  Returns 1 if <obj> has ANY of the specified flags.
  > [orflags(me,Wa)] → 1  (if wizard OR admin)

-------------------------------------------------------------------------------
CONDITIONALS
-------------------------------------------------------------------------------

if(<cond>,<true>[,<false>])
  Returns <true> if cond is non-empty and non-zero, otherwise <false>
  (or empty if no false branch given).
  NOTE: Both branches are evaluated before if() is called.
  > [if(1,yes,no)] → yes
  > [if(0,yes,no)] → no
  > [if([gt(score,5)],Pass,Fail)]

ifelse(<cond>,<true>,<false>)
  Equivalent to if() with a required false branch.
  > [ifelse([member(apples oranges,orange)],found,not found)] → not found

switch(<val>,<t1>,<r1>[,<t2>,<r2>,...][,<default>])
  Compares <val> against t1, t2, ... using glob matching.
  Returns the corresponding result for the first match, or <default>.
  Numeric operators <N and >N are also supported as patterns.
  > [switch(3,1,one,2,two,3,three,other)] → three
  > [switch(7,<5,small,>10,big,medium)] → medium

case(<val>,<t1>,<r1>[,<t2>,<r2>,...][,<default>])
  Like switch() but uses exact case-insensitive string comparison.
  > [case(hello,hi,nope,hello,yes)] → yes

-------------------------------------------------------------------------------
EVALUATION
-------------------------------------------------------------------------------

s(<str>) / eval(<str>) / subeval(<str>)
  Evaluates <str> as softcode in the current context.
  Useful to dynamically construct and run expressions.
  > [setq(0,[add(1,2)])][s([r(0)])] → 3
  > [eval([cat(%,N)])] → Alice  (builds %N then evaluates it)

objeval(<obj>,<str>)
  Evaluates <str> as softcode in the context of <obj>.
  %! inside the expression will be #<obj>.
  > [objeval(#5,[name(me)])] → name of object #5

zfun(<attr>[,<args>...])
  Calls <attr> on the zone master object of the executor.
  Returns #-1 NO ZONE if the executor has no zone.

-------------------------------------------------------------------------------
MISCELLANEOUS
-------------------------------------------------------------------------------

null(<arg>[,...])
  Accepts any number of arguments, always returns empty string.
  Use to evaluate args for side effects (e.g. setq) without producing output.
  > [null([setq(0,foo)][setq(1,bar)])] → (empty, but %q0 and %q1 are set)

lit(<str>)
  Returns str without evaluating it. Mostly a no-op since args are
  pre-evaluated; useful to document intent.

@@(<anything>)
  Inline comment — always returns empty string regardless of arguments.
  > [@@(This is a comment)][add(1,2)] → 3
