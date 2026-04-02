SOFTCODE FUNCTIONS

UrsaMU uses TinyMUX 2.x-compatible softcode. Functions are called inside
square brackets: [funcname(arg1,arg2,...)]. Substitutions begin with %:
%N (your name), %# (your dbref), %0-%9 (arguments), %q0-%qz (registers).

FUNCTION CATEGORIES

  help softcode/math        Arithmetic, trig, comparison, bitwise, vector
  help softcode/string      String manipulation, formatting, pattern matching
  help softcode/list        List operations, iteration, set math
  help softcode/logic       Boolean logic, conditionals, control flow
  help softcode/registers   setq/setr/r, localize — named register slots
  help softcode/object      Object identity, attributes, location, search
  help softcode/output      pemit, remit, oemit, emit, trigger
  help softcode/time        secs, timefmt, digittime, etimefmt
  help softcode/server      mudname, version, stats, connection info
  help softcode/subs        All % substitution codes

QUICK REFERENCE

  Eval block:     [add(1,2)]        → 3
  Substitution:   %N says hello.    → Alice says hello.
  Register:       [setq(0,foo)][r(0)] → foo
  User function:  [u(me/MYFUNC,arg)] → result of MYFUNC with %0=arg
  Iteration:      [iter(a b c,##!)]  → a! b! c!

See also: softcode/subs, @trigger, @function
