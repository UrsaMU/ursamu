SOFTCODE SUBSTITUTIONS

Substitutions are % codes expanded before (or during) softcode evaluation.
They inject dynamic values — the executor's name, arguments, registers, etc.

See also: softcode/index, softcode/registers, softcode/logic

-------------------------------------------------------------------------------
IDENTITY SUBSTITUTIONS
-------------------------------------------------------------------------------

%#   Dbref of the executor (the object whose attribute is running).
     > %# → #1

%!   Dbref of the object that owns the currently running attribute.
     Usually the same as %# unless the attribute was inherited.
     > %! → #1

%@   Dbref of the object that triggered the current evaluation.
     Set when an attribute is called via u() or trigger().
     > %@ → #5  (the object that called u(me/ATTR))

%N   Name of the executor (same as name(%#)).
     > %N → Alice

%n   Lowercase version of %N.
     > %n → alice

%L   Name of the executor's location (the room name).
     > %L → The Great Hall

-------------------------------------------------------------------------------
PRONOUN SUBSTITUTIONS
-------------------------------------------------------------------------------

These expand to the appropriate pronoun for the executor's sex/gender.
Set the executor's SEX attribute to "male", "female", or leave unset (neutral).

%s / %S   Subjective pronoun.  he / she / it  (capitalized: He / She / It)
%o / %O   Objective pronoun.   him / her / it  (Him / Her / It)
%p / %P   Possessive pronoun.  his / her / its  (His / Her / Its)
%a / %A   Absolute possessive. his / hers / its  (His / Hers / Its)

  > &SEX me=female
  > %S waves. %P sword gleams. → She waves. Her sword gleams.

-------------------------------------------------------------------------------
ARGUMENT SUBSTITUTIONS
-------------------------------------------------------------------------------

Positional arguments passed to the currently running attribute.

%0 – %9   Arguments 0 through 9 (passed from u(), trigger(), or @command).
%+        All arguments joined with spaces (%0 %1 %2 ...).

When used in a $command pattern match, %0–%9 are the regex capture groups
in order.

When called via u(obj/attr, arg0, arg1, ...):
  %0 = arg0, %1 = arg1, etc.

When triggered via @trigger obj/attr = arg0, arg1, ...:
  %0 = arg0, %1 = arg1, etc.

  > &DOUBLE me=[mul(%0,2)]
  > [u(me/DOUBLE,5)] → 10

%l   The last argument (alias: %M in some MUSH variants).
     In UrsaMU, %l returns the last whitespace-delimited word of %+.

-------------------------------------------------------------------------------
REGISTER SUBSTITUTIONS
-------------------------------------------------------------------------------

%q0 – %q9   Registers 0–9 (set with setq() or setr()).
%qa – %qz   Registers a–z (26 additional slots).

  > [setq(0,hello)]%q0 → hello
  > [setq(a,world)]%qa → world

See softcode/registers for full documentation.

-------------------------------------------------------------------------------
ITER SUBSTITUTIONS
-------------------------------------------------------------------------------

Inside iter(), map(), or while() bodies:

##    Current item value (the element being processed).
#@    Current iteration index (0-based).
#$    Separator (the output delimiter — not the input delimiter).

  > [iter(a b c,## at #@)] → a at 0 b at 1 c at 2

Nested iter uses %i0, %i1, etc. to refer to outer loop items:
  %i    Innermost loop's current item (same as ##).
  %i0   Outermost active iter's current item.
  %i1   Next level out (if triple-nested), etc.

  > [iter(1 2,[iter(a b,%i0-##)])] → 1-a 1-b 2-a 2-b

-------------------------------------------------------------------------------
V-ATTRIBUTE SUBSTITUTIONS
-------------------------------------------------------------------------------

%VA – %VZ   Values of attributes V_A through V_Z on the executor.
            These are convenience substitutions for frequently used attrs.

  > &V_A me=42
  > %VA → 42

Equivalent to [v(V_A)], [v(V_B)], etc.

-------------------------------------------------------------------------------
FORMATTING SUBSTITUTIONS
-------------------------------------------------------------------------------

%r   Newline (carriage return + line feed).
%R   Same as %r.

%t   Tab character.
%b   Space character (useful inside expressions where a bare space would
     be ambiguous).

%%   Literal percent sign.

%[   Left bracket [ (useful when the bracket would otherwise open a
     function call).
%]   Right bracket ] (matching close).

  > [setq(0,5)]The result is %q0.%rDone. →
    The result is 5.
    Done.

  > 50%% done → 50% done

-------------------------------------------------------------------------------
ANSI / COLOR SUBSTITUTIONS
-------------------------------------------------------------------------------

These codes produce terminal color output. Always end a colored sequence
with %cn to reset to default.

  %ch   Bold (bright)
  %cu   Underline
  %cf   Flashing (blink)
  %ci   Inverse (reverse video)
  %cn   Normal / reset (REQUIRED after any color code)

Foreground colors:
  %cr   Red         %cR   Bright red
  %cg   Green       %cG   Bright green
  %cy   Yellow      %cY   Bright yellow
  %cb   Blue        %cB   Bright blue
  %cm   Magenta     %cM   Bright magenta
  %cc   Cyan        %cC   Bright cyan
  %cw   White       %cW   Bright white
  %cx   Black       %cX   Bright black (dark gray)

Background colors (lowercase = dark, uppercase = bright):
  %[cr  Background red     %[cR  Background bright red
  %[cg  Background green   ... etc.

  NOTE: The %[c_ background codes are extended UrsaMU syntax.
        For maximum MUX compatibility, prefer xterm 256-color codes below.

Xterm 256-color:
  %xr   Red               %xg   Green
  %xy   Yellow            %xb   Blue
  %xm   Magenta           %xc   Cyan
  %xw   White             %xx   Black (dark)
  %xh   High intensity modifier (combine with color)
  %xn   Normal / reset (alias for %cn)

  > %ch%crRed bold text%cn → Red bold text (rendered in bold red)
  > %xg%xhBright green%xn → Bright green text

  NOTE: Color rendering depends on the client's terminal capabilities.
  Standard MUX clients and most telnet terminals support 16 colors.
  256-color and true-color require client support.

-------------------------------------------------------------------------------
MXP SUBSTITUTIONS (OPTIONAL)
-------------------------------------------------------------------------------

UrsaMU supports MXP (MUD Extension Protocol) if negotiated with the client.

%mxp[tag]text[/tag]   Wraps text in an MXP element.
  > %mxp[send href="look here"]look here[/send]

Not all clients support MXP. MXP codes are stripped for non-MXP clients.

-------------------------------------------------------------------------------
PLUGIN-REGISTERED SUBSTITUTIONS
-------------------------------------------------------------------------------

Plugins can register custom substitution codes via registerSoftcodeSub():

  import { registerSoftcodeSub } from "jsr:@ursamu/ursamu";

  registerSoftcodeSub("myplugin_ver", async (ctx) => "1.0.0");

The code is referenced as a function-style substitution or looked up during
% expansion. Consult the plugin's own documentation for its codes.

-------------------------------------------------------------------------------
SUBSTITUTION ORDER
-------------------------------------------------------------------------------

When UrsaMU evaluates softcode:
  1. Function calls [func(args)] are recursively evaluated, inner-first.
  2. % substitutions are expanded after function arguments are evaluated.
  3. The result is returned as a string.

This means substitutions INSIDE function arguments are expanded before the
function receives them:
  > [strlen(%N)] → 5  (if name is Alice)

And substitutions in the OUTPUT of a function are NOT re-evaluated unless
you use eval() or s() explicitly:
  > [get(me/ATTR)] → %N  (literal, not expanded)
  > [eval([get(me/ATTR)])] → Alice  (explicitly re-evaluated)

-------------------------------------------------------------------------------
COMMON PATTERNS
-------------------------------------------------------------------------------

Greeting with pronouns:
  [name(me)] raises %p hand in greeting.

Nested register + arg:
  [setq(0,[add(%0,%1)])]The sum is %q0.

Formatted output:
  %ch%cwName%cn%t%cg[name(%#)]%cn

Newline-separated list:
  [iter(%0,[name(##)],%r)]
