sheet traits  -- Settable trait categories for +sheet/set.

Identity      concept, virtue, vice
Template      template (mortal, changeling)
Attributes    9 CoFD attributes, 1-5
Skills        24 CoFD skills, 0-5
Specialties   specialty/<skill>=<name>[: <description>]
Merits        by merit key. Instanced merits (Language, Contacts,
              Status, Allies, Mentor, etc.) take a qualifier:
                +sheet/set language(spanish)=1
                +sheet/set contacts(police)=2
              Multiple qualifiers under the same merit stack as
              separate purchases.
Morality      clarity or integrity
Power Stat    wyrd
Energy        glamour
Custom        seeming, kith, court, needle, thread
Other         willpower, size (staff-only; 1-10)

Resetting:
  +sheet/set <trait>=  (empty value) resets the trait to its template
  default. For attributes the default is 1; for skills it is 0.
  Specialty reset wipes all specialties on the named skill.

See also: sheet, sheet specialties, sheet willpower, sheet size
