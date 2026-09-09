---
aliases: [eq, @eq]
---
+EQ

Set equipment mechanical fields, display text, and templates.

SYNTAX
  @eq/<field> <item>=<value>     Set one field.
  @eq/clear <item>               Wipe mechanical eq fields.
  @eq/copy <item>=<template>     Save item as template.
  @eq/give <item>=<template>     Apply template to item.
  @eq/new <template>=<name>      Spawn item from template.
  @eq/template [<name>]          List or show templates.

EXAMPLES
  @eq/damage klaive=4
  @eq/copy klaive=silver-klaive
  @eq/new silver-klaive=my klaive

SEE ALSO: +help wear, +help wield, +help attack
