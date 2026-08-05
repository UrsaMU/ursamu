---
layout: layout.vto
title: Softcode Guide
description: Pure TinyMUX softcode on UrsaMU — expressions, substitutions, action commands, $-patterns, UDFs, and worked examples.
---

# Softcode Guide

This guide is **only** about TinyMUX-style softcode: the
expression language builders use in-game with `&ATTR`,
`think`, `@trigger`, `$commands`, and `^monitors`.

It does **not** cover TypeScript. For TS attributes and
sandbox scripts, see
[Attribute Scripts](/guides/attribute-scripts/) and the
[Scripting Guide](/guides/scripting/). For the full
function inventory and parity notes, see
[MUSH Compatibility](/mush_compatibility/).

---

## What softcode is

Softcode is a string expression language. You store it on
object attributes. When the engine evaluates it, it expands
substitutions (`%N`, `%#`, …), runs functions inside
`[brackets]`, and can fire action commands (`@pemit`,
`@switch`, …).

```
think [add(2,3)]
→ 5

think [name(me)] greets [name(%#)]
→ Alice greets Alice
```

UrsaMU’s evaluator targets **TinyMUX 2.x** behavior (~250
stdlib functions, standard subs, action queue commands).

### Softcode vs TypeScript attributes

| | Softcode | TypeScript attribute |
|--|----------|----------------------|
| Opt-in | `&ATTR/softcode` or auto-detect | default when not softcode |
| Language | MUX expressions | TS/JS in a Web Worker |
| Test with | `think [expr]` | write + `@trigger` |
| Timeout | 100ms wall clock | sandbox limits |

---

## Your first softcode

### 1. Live eval with `think`

```
think [add(2,3)]
think [strlen(hello)]
think [ifelse(gt(5,2),yes,no)]
think [center(Hi,20,=)]
```

Only you see the result. Use this as your REPL.

### 2. Store softcode on an attribute

```
&GREET/softcode me=Hello, [name(%#)]!
@trigger me/GREET
```

The `/softcode` switch marks the attribute so every future
eval uses the softcode engine (not TypeScript).

### Auto-detect

If you omit `/softcode`, UrsaMU still treats the value as
softcode when it clearly looks like MUX code:

- value starts with `[` or `@`, or
- contains MUX substitution / function syntax and no
  TypeScript keywords

Prefer an explicit `/softcode` on anything you care about.

```
&GREET/softcode me=[name(%#)] waves.
```

---

## Expression model

### Function calls

Functions run inside square brackets:

```
[func(arg1,arg2,...)]
```

Nest freely:

```
[add(mul(2,3),4)]
→ 10

[ifelse(eq(words(a b),2),ok,bad)]
→ ok
```

### Literal text and brackets

Outside `[…]`, text is returned as-is (after substitutions).

`[` and `]` are **function delimiters**. To emit literal
brackets in output:

```
think [chr(91)]hello[chr(93)]
→ [hello]

think [lit([not a function])]
→ [not a function]
```

Or use the demo’s escaped form where supported:
`%[ … %]` for non-eval bracket text in some contexts.

`@@` is a softcode comment (no output).

```
@@ this is ignored
&NOTE me=@@ builder note only
```

### Truth values

Softcode is stringly-typed. Empty string and `0` are false;
anything else is true.

```
[t(hello)]   → 1
[t(0)]       → 0
[not(0)]     → 1
[and(1,1)]   → 1
[or(0,1)]    → 1
```

---

## Substitutions

Expanded before / during evaluation.

| Sub | Meaning |
|-----|---------|
| `%#` | Enactor dbref (`#42`) |
| `%!` | Executor dbref (object running the code) |
| `%@` | Caller dbref, or `#-1` |
| `%N` / `%n` | Enactor name / lowercase name |
| `%L` | Enactor location dbref |
| `%0`–`%9` | Positional args (from `$`/`^`/`u()`/`@trigger`) |
| `%+` | Number of args (where supported) |
| `%q0`–`%qz` | Register values (see Registers) |
| `%VA`–`%VZ` | Executor attrs `VA`…`VZ` |
| `%s` `%S` `%o` `%O` `%p` `%P` `%a` `%A` | Pronouns from enactor `SEX` |
| `%r` | Newline |
| `%t` | Tab |
| `%b` | Space |
| `%%` | Literal `%` |
| `##` | Current `@dolist` / `iter()` item |
| `#@` | Current `@dolist` / `iter()` index |
| `%ch` `%cr` `%cg` … `%cn` | ANSI color / bold / reset |
| `%c<#RRGGBB>` | Truecolor (where client supports it) |

Pronouns read the enactor’s `SEX` attribute (`male` /
`female` / `plural` / default neutral).

```
think %N (%#) is in %L
think %ch%crRed%cn then normal
```

---

## Action commands

These run as commands (often from attributes or queues),
not as pure expression returns.

| Command | Purpose |
|---------|---------|
| `@switch <expr>=<case>,<action>[,…]` | Branch on value / wildcards |
| `@if <expr>=<true>[,<false>]` | Conditional action |
| `@dolist <list>=<action>` | Iterate; `##` item, `#@` index |
| `@while <expr>=<action>` | Loop while true (timeout enforced) |
| `@break` | Leave current `@dolist` / `@while` |
| `@trigger <obj>/<attr>[=<args>]` | Fire an attribute |
| `@wait <seconds>=<action>` | Delay an action |
| `@ps` | List pending `@wait` jobs |
| `@drain <obj>` | Cancel waits on an object |
| `@notify <obj>[/<sem>][=<n>]` | Signal a semaphore |
| `@pemit <player>=<msg>` | Private message |
| `@remit <room>=<msg>` | Message everyone in a room |
| `@emit <msg>` | Message current room |
| `@function <name>=…` | Global UDF (see below) |

### `@switch` patterns

```
@switch [get(me/COLOR)]=red,@pemit %#=Warm,blue,@pemit %#=Cool,@pemit %#=Other
@switch [add(2,5)]=<5,small,>5,big,mid
```

Patterns support `*`, `?`, and numeric `<n` / `>n`.

### `@dolist`

```
@dolist one two three=@pemit %#=Item ## (#@)
```

### Chaining with `;`

Multiple actions in one attribute:

```
&BOOT_MSG/softcode me=@pemit %#=Welcome!; @pemit %#=Type +help
```

---

## Essential functions

Not exhaustive — see
[MUSH Compatibility](/mush_compatibility/#supported-functions-250-total)
for the full catalog. Favorites:

### Math

```
[add(2,3,4)]     [sub(10,3)]    [mul(3,4)]
[div(10,3)]      [mod(10,3)]    [abs(-7)]
[max(1,5,3)]     [min(1,5,3)]   [power(2,10)]
[eq(3,3)]        [gt(5,2)]      [lt(2,5)]
[rand(100)]      [isnum(42)]
```

### String

```
[strlen(hello)]           [upcase(hi)] / [ucstr(hi)]
[lowcase(HI)] / [lcstr]   [capstr(fOO)]
[left(abcdef,3)]          [right(abcdef,3)]
[mid(abcdef,2,3)]         [trim(  z  )]
[cat(a,b,c)] → a b c      [strcat(a,b,c)] → abc
[before(a:b,:),]          [after(a:b,:)]
[edit(a-b-c,-,/)]         [repeat(*,5)]
[space(3)]                [reverse(abc)]
[center(Hi,10,=)]         [ljust(Hi,10,.)]  [rjust(Hi,10,.)]
[ansi(hr,ERROR)]          [stripansi(...)]
```

### List

```
[words(a b c)]            [first(a b c)]  [rest(a b c)]
[last(a b c)]             [extract(a b c,2)]
[member(a b c,b)]         [lnum(1,5)]
[sort(b a c)]             [revwords(a b c)]
[setunion(a b,b c)]       [setinter(a b,b c)]
[grab(foo bar,b*)]        [match(foo bar,b*)]
[iter(1 2 3,mul(##,##))]  [parse(...)]  (alias of iter)
```

### Logic

```
[if(1,yes)]               [ifelse(0,yes,no)]
[switch(cat,dog,woof,cat,meow,other)]
[case(b,a,alpha,b,beta,other)]
[and(1,1)]  [or(0,1)]  [not(0)]  [xor(1,0)]
[lit(raw text)]           [null(whatever)]
```

`if(cond,then)` returns empty when false. Use `ifelse` for
an else branch. `switch()` is the **function**; `@switch`
is the **command**.

### Object / world

```
[name(me)]       [dbref(me)]      [type(me)]
[flags(me)]      [hasflag(me,wizard)]
[loc(me)]        [where(me)]      [home(me)]
[lcon(here)]     [lexits(here)]   [lwho()]
[pmatch(Alice)]  [nearby(me,obj)]
[money(me)]      [idle(me)]       [conn(me)]
[mudname()]      [version()]      [secs()] [time()]
```

### Attributes from softcode

```
[get(obj/ATTR)]           [v(ATTR)]          (on executor)
[default(obj/ATTR,fb)]    [hasattr(obj,ATTR)]
[lattr(obj,GLOB*)]        [xget(obj,ATTR)]
```

Set attributes with the usual `&` command (including from
inside action lists):

```
&COUNTER/softcode Demo=0
&COUNTER Demo=[add([get(Demo/COUNTER)],1)]
```

### User calls

```
[u(obj/ATTR,arg0,arg1,…)]      call attr; args → %0 %1 …
[ulocal(obj/ATTR,…)]           like u(), registers restored
[map(obj/ATTR,list)]           call attr per list word
[filter(obj/ATTR,list)]        keep words where attr → true
[fold(obj/ATTR,list,acc)]      reduce
```

### Output functions

```
[pemit(%#,Hello)]   [remit(here,Boom)]
[emit(Hi room)]     [oemit(%#,others see this)]
[trigger(obj/ATTR,args)]
```

Prefer `@pemit` / `@emit` as commands in action attributes;
functions are useful inside expressions.

### Registers

```
[setq(0,hello)][r(0)]     setq returns empty; r/getq reads
[setr(1,world)]           set and return value
[localize([setq(0,x)]…)]  snapshot/restore registers
```

Also: `%q0` … `%qz` after `setq`.

```
think [setq(0,10)][setq(1,20)][add(%q0,%q1)]
→ 30
```

---

## `$`-commands (input patterns)

Attributes whose values start with `$` register a command
pattern on that object:

```
&CMD_GREET/softcode ball=$greet *:@pemit %#=Hello, %0!
```

When a player types `greet Alice`, matching objects run the
action. Captures fill `%0`–`%9`.

**Search order:** objects in the same room, master room,
and the player’s zone master (`@zone`).

```
&CMD_LOOKIN/softcode box=$look in me:@pemit %#=[get(me/INSIDE-DESC)]
```

---

## `^`-monitors (listen patterns)

Attributes starting with `^` fire when room text matches.
The object needs the **MONITOR** flag.

```
@set listener=MONITOR
&HEARD/softcode listener=^*hello*:@pemit %#=I heard a hello from %N.
```

Captures map to `%0`–`%9` like `$` patterns.

---

## User-defined functions

### On an object (`u()`)

```
&DOUBLE/softcode me=[mul(%0,2)]
think [u(me/DOUBLE,21)]
→ 42

&FACT/softcode me=[ifelse(lte(%0,1),1,mul(%0,u(me/FACT,dec(%0))))]
think [u(me/FACT,5)]
→ 120
```

### Global (`@function`)

```
@function double=[mul(%0,2)]
think [double(21)]
→ 42

@function/list
@function/remove double
```

Globals are shared; keep names unique and document them.

---

## Format attributes

Display slots can be softcode templates on the object
(priority over plugin handlers):

`NAMEFORMAT`, `DESCFORMAT`, `CONFORMAT`, `EXITFORMAT`,
`WHOFORMAT`, `WHOROWFORMAT`, `PSFORMAT`, `PSROWFORMAT`

Plugins may add more uppercase slots. In templates, `%0` is
the default rendering payload for that slot.

```
&WHOFORMAT/softcode #0=[center(Who,78,=)]%r%0
```

---

## Tags (`@tag` / `@ltag`)

Named dbrefs for softcode (Rhost-style):

```
@tag citygate=here
think [tag(citygate)]
think [name(#citygate)]

@ltag home=here
think [ltag(home)]
```

`#tagname` works anywhere an object ref is accepted
(personal `@ltag` shadows global `@tag`).

---

## Worked examples

### Private greeting attribute

```
&HI/softcode me=@pemit %#=%chHi%cn, %N. You are %# in [name(%L)].
@trigger me/HI
```

### Room speech reaction

```
@create Echo
@set Echo=MONITOR
@tel Echo=here
&LISTEN/softcode Echo=^*said*:@pemit %#=Echo heard %N.
```

### Simple `$` command object

```
@create Greeter
@tel Greeter=here
&CMD/softcode Greeter=$hello *:@pemit %#=Hello, %0! — from [name(me)]
```

Type: `hello Bob`

### Queue delay

```
&LATER/softcode me=@wait 3=@pemit %#=Three seconds later.
@trigger me/LATER
```

### Parent inheritance

Softcode attrs resolve up `data.parent` like other
attributes. Put shared `$` commands or UDFs on a parent
prototype and `@parent` children to it.

---

## Limits and safety

- Softcode eval has a **100ms** wall-clock timeout.
- `@while` / long `@dolist` work is capped; prefer finite
  lists.
- `sql()`, some terminal probes, etc. are stubs — see
  [compatibility stubs](/mush_compatibility/#tinymux-compatibility-stubs).
- Do not put secrets in publicly readable attributes.
- `think` is private; `@emit` / `@remit` are not.

---

## Installer demo

A full walkthrough object lives in the repo:

[`docs/softcode-demo.mush`](https://github.com/UrsaMU/ursamu/blob/main/docs/softcode-demo.mush)

Paste sections in-game (or load via your preferred
installer flow), then:

```
@trigger Demo/DEMO_RUN
```

Covers subs, strings, math, logic, lists, iter/map/filter,
objects, registers, UDFs, format helpers, and attr get/set.

---

## Quick reference

```
think [expr]                     live eval (you only)
&ATTR/softcode obj=<code>        store softcode
@trigger obj/ATTR[=args]         run attribute
$pattern:action                  command on object
^pattern:action                  room listen (MONITOR)
[u(obj/ATTR,args)]               call softcode attr
@function name=[code]            global UDF
@switch / @if / @dolist / @wait  flow + queue
@pemit %#=msg                    private output
```

---

## See also

- [MUSH Compatibility](/mush_compatibility/) — full function
  tables, stubs, format slots, tags
- [Command Reference](/guides/commands/) — builder/admin verbs
- [Lock Expressions](/guides/lock-expressions/) — lockfuncs
- [Attribute Scripts](/guides/attribute-scripts/) —
  TypeScript on attributes (not softcode)
- [Scripting Guide](/guides/scripting/) — file-based TS
  sandbox commands
