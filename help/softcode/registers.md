SOFTCODE REGISTERS

Registers are named temporary variables within a single softcode evaluation.
They are referenced with %q0–%q9 and %qa–%qz (36 slots total).

Unlike attributes, registers are LOCAL to the current evaluation chain.
ulocal() and localize() create an isolated register scope.

See also: softcode/subs, softcode/object (u/ulocal), softcode/logic (null)

-------------------------------------------------------------------------------
SETTING REGISTERS
-------------------------------------------------------------------------------

setq(<reg>,<val>[,<reg2>,<val2>...])
  Sets register(s) and returns empty string.
  <reg> is 0–9 or a–z.
  > [setq(0,hello)][r(0)] → hello
  > [setq(0,a,1,b,2,c)][r(0)][r(1)][r(2)] → abc

setr(<reg>,<val>)
  Sets register <reg> to <val> and RETURNS <val>.
  > [setr(0,hello)] → hello

-------------------------------------------------------------------------------
READING REGISTERS
-------------------------------------------------------------------------------

r(<reg>)
  Returns the value of register <reg>.
  > [setq(0,world)][r(0)] → world

%q<reg>  (substitution form)
  Substitution syntax for reading a register.
  > [setq(0,world)]%q0 → world

-------------------------------------------------------------------------------
ISOLATION
-------------------------------------------------------------------------------

localize(<expr>)
  Evaluates <expr>, then restores all registers to their values from
  before localize() was called. Register changes inside are discarded.

  Use this to compute intermediate values without polluting the
  caller's register state.

  > [setq(0,outer)][localize([setq(0,inner)][r(0)])][r(0)]
    → inner (localize returns the inner result)  then outer
    Wait — actual output: innerqouter

  More clearly:
  > [setq(0,A)][localize([setq(0,B)][r(0)])][r(0)]
    → B (localize returns the inner expr result)
       A (r(0) after localize restored the register)
    Full output: BA

-------------------------------------------------------------------------------
EXAMPLES
-------------------------------------------------------------------------------

Accumulate a sum across an iter:
  [setq(0,0)][iter(1 2 3 4 5,[null([setq(0,[add(%q0,##)])])])]%q0
  → 15

Store a conditional result:
  [setq(0,[ifelse([gte(%0,18)],adult,minor)])][r(0)] is [r(0)]

Multi-register computation:
  [setq(0,[add(%0,%1)])]
  [setq(1,[mul(%q0,2)])]
  [setq(2,[sub(%q1,1)])]
  %q0 %q1 %q2
