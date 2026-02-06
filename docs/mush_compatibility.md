# UrsaMU MUSH Compatibility Status

To meet the goal of supporting everything a real MUSH (PennMUSH, TinyMUX)
supports during the connection flow, the following features are currently
missing or require enhancement:

## Missing Features

### 1. Connection Banner & Welcome Screen

- **Real MUSH**: Before authentication, a text file (`welcome.txt` or similar)
  is displayed immediately upon port connection.
- **UrsaMU**: Displays a welcome text from the database (seeded by
  `text/welcome.md`), but lacks support for pre-auth banner customization via
  traditional MUSH flags.

### 2. Message of the Day (MOTD)

- **Real MUSH**: Displays `motd.txt` and `wizmotd.txt` post-authentication.
- **UrsaMU**: Currently has no dedicated MOTD system that auto-triggers after
  login.

### 3. Connection Statistics

- **Real MUSH**: Shows "Last connect was from [IP] on [Date]", "There have been
  [X] failed login attempts", and "The time is now [Time]".
- **UrsaMU**: Partially tracks `lastCommand`, but doesn't display connection
  history or IP stats on login.

### 4. Mail & News Notifications

- **Real MUSH**: Automatically notifies the player: "You have 3 unread Mail
  messages" or "There are 5 new News items since your last visit."
- **UrsaMU**: Mail and News systems are in progress but lack automated login
  notifications.

### 5. Automatic Commands (Forced `look`)

- **Real MUSH**: Automatically executes a `look` command for the player.
- **UrsaMU**: **[TBD]** Working on adding `u.execute("look")` to the
  `connect.ts` script.

### 6. Attribute-based Hooks (`@Aconnect`)

- **Real MUSH**: Runs the `@Aconnect` attribute on the player and the Master
  Room.
- **UrsaMU**: Has basic `aconnect` hook support, but it needs better exposure to
  the scripting SDK to allow scripts to trigger complex login workflows.

### 7. Terminal & Screen Settings

- **Real MUSH**: Detects terminal type, screen width, and pager settings.
- **UrsaMU**: Basic Telnet support exists, but auto-detection and persistent
  screen settings are missing.

---

**Next Step**: Implementing `u.execute("look")` in the `connect.ts` system
script.
