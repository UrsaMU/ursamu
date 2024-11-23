---
category: Communication
---
# Bulletin Board System (BBS)

The bulletin board system allows users to read and post messages in organized topic boards. This help file explains how to use the BBS system effectively.

## Basic Commands

### Viewing Boards
`bbread` - Lists all available bulletin boards
```
==============================================================================
           Board Name                    Last Post                 # of Posts
==============================================================================
 1    (-) General                       2019-01-01 12:00                    5
 2    (-) Announcements                 2019-01-01 12:00                   20
 3     *  Staff                         2019-01-01 12:00                    0
==============================================================================
'*' = restricted     '-' = Read Only     '(-)' - Read Only, but you can write
==============================================================================
```

Legend:
- `*` indicates a restricted board (requires special access)
- `-` indicates a read-only board
- `(-)` indicates a read-only board that you have permission to write on

## Administrative Commands

These commands are restricted to users with admin privileges:

### Board Management
- `bboard/create <name>=<description>` - Creates a new bulletin board
- `bboard/delete <name>` - Deletes an existing board
- `bboard/name <old name>=<new name>` - Renames a board
- `bboard/desc <name>=<description>` - Changes a board's description

## Notes
- Board numbers can be used instead of names in most commands
- Some boards may have restricted access based on your character's flags
- Administrators can manage boards and their permissions
