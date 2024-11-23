---
category: Administration
---
# @CGDATA Command

The @CGDATA command is an administrative command used to manage character generation data. It allows staff to view and modify the data used during character creation.

## Syntax
`@cgdata/list` - List all character generation data categories
`@cgdata <category>` - View data for a specific category
`@cgdata/add <category>/<entry>=<value>` - Add new data
`@cgdata/del <category>/<entry>` - Remove data

## Examples
```
@cgdata/list
@cgdata merits
@cgdata/add backgrounds/resources=Resources represent your character's material resources
@cgdata/del flaws/illiterate
```

## Options
* /list - Show all data categories
* /add - Add new data entry
* /del - Remove an existing entry

Note: This command requires staff privileges to use.

See also:
- help chargen (Character generation process)
- help stats (Setting character statistics)
