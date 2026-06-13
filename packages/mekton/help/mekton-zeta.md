# Mekton Zeta

Mekton Zeta chargen, gear, personal combat, and AI GM bridge for UrsaMU.
Uses the Interlock System (STAT + SKILL + 1D10 vs. Difficulty Number).

---

## Character Generation

    +chargen                    View chargen status / checklist
    +chargen/start              Begin chargen (create a draft character)
    +chargen/next               Show guided instructions for your next creation step
    +chargen/method <m>         Set stat method: random, concept, cinematic
    +chargen/stat <s>=<v>       Set a primary stat (concept/cinematic only)
    +chargen/roll               Roll all stats randomly

    +chargen/skill <name>=<lv>  Set a skill level
    +chargen/skills [<filter>]  Show skills + point budget; "catalog" = full list

    +chargen/lifepath           View lifepath
    +chargen/roll-lifepath      Auto-roll all basic lifepath charts (A1–I)
    +chargen/lifepath/set <f>=<v>  Manually set an appearance field

    +chargen/type <rookie|professional>   Set character type
    +chargen/list <templates|careers>    List templates or careers/professions
    +chargen/template <name>             Apply a rookie template
    +chargen/career <profession>         Add a career term (+2 years)
    +chargen/career/skills <t>=<s1>,...  Choose 5 skills for a career term
    +chargen/career/remove               Remove last career term

    +chargen/submit             Submit character for staff review

## Staff Commands (Admin+)

    +chargen/pending            List submitted characters
    +chargen/view <player>      View another player's chargen record
    +chargen/approve <player>   Approve and lock a character
    +chargen/reject <player>=<note>  Return for revision with note

---

## Dice & Rolls

    +roll <stat>+<skill>[/<difficulty>]  Roll an Interlock check

Difficulty levels: easy(10), average(15), difficult(20), very difficult(25),
nearly impossible(30). Roll 10 = Critical Success (chain). Roll 1 = Critical Failure.

---

## Sheet

    +sheet [<player>]           Display full character sheet

---

## Gear

    +gear                       List your equipment and weight
    +gear/catalog [<category>]  Browse gear (melee/handgun/smg/rifle/armor/tool)
    +gear/buy <name>            Purchase from catalog (deducts cash)
    +gear/add <name>=<wt>,<cost>  Add custom item
    +gear/remove <name>         Remove item from inventory
    +encumbrance                Show load vs EV and effective MA

---

## Combat

    +attack <target>=<weapon>           Full attack roll (auto-rolls both sides)
    +attack/manual <target>=<hits>/<loc>  Apply hits directly (admin override)
    +damage <location>=<hits>           Apply damage to yourself
    +damage <player>/<location>=<hits>  Apply damage to another (admin)
    +heal <location>                    Roll First Aid on your own location
    +heal <player>=<location>           Roll First Aid on another player
    +stun                               Check or clear stun status
    +luck                               Show remaining Luck points
    +luck/spend <amount>                Spend Luck to add to your last roll

Hit locations: Head, Torso, Right Arm (rArm), Left Arm (lArm), Right Leg (rLeg), Left Leg (lLeg)

---

## Stats

ATT / BOD / CL / EMP / INT / LUCK / MA / REF / TECH / EDU — range 2–10, average 6.

Derived: Head/Torso/Limb HP from BOD. Stability = floor(CL × 2.5).
Skill Points = INT + EDU + 10.
