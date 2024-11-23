# UrsaMU: The Modern MUSH-Like Server

![UrsaMU](ursamu_github_banner.png)

## Welcome to UrsaMU!

UrsaMU is an innovative, TypeScript-based server, echoing the classic MUSH
(Multi-User Shared Hallucination) experience with a modern twist. Designed for
flexibility and extendability, it's an ideal platform for creating immersive,
text-based virtual worlds.

## Core Features

- **Multi-Protocol Support**: Connect via Telnet or Web interface
- **Advanced Character System**:
  - Customizable attributes and stats
  - Character generation system
  - Flexible flag system
  - Detailed character descriptions and profiles
- **Rich Communication Tools**:
  - Channel system for group conversations
  - Private messaging/page system
  - Pose and emote commands
  - Mail system for offline communication
  - Bulletin Board System (BBS)
- **Building System**:
  - Room creation and management
  - Exit linking
  - Object creation
  - Lock system for security
- **Help System**:
  - Comprehensive documentation
  - Topic-based help files
  - Command reference
- **Plugin Architecture**:
  - Modular design for easy extensions
  - World of Darkness (WoD) plugin included:
    - Character sheets
    - Dice rolling system
    - Damage and healing mechanics
    - Stats management
- **Additional Features**:
  - Wiki system for world documentation
  - Robust authentication system
  - Command parser with middleware support
  - Attribute-based permissions
  - Customizable startup/shutdown scripts

## What's a MUSH?

MUSH, a text-driven, multi-user environment, is rooted in the legacy of MUDs
(Multi-User Dungeons) - the early ancestors of today's MMORPGs. These platforms
are renowned for their customizability, serving as fertile grounds for
role-playing adventures and vibrant social hubs.

## Getting Started with UrsaMU

Embark on your UrsaMU journey with these simple setup instructions.

### Prerequisites

- Node.js (NVM recommended for installation)

### Installation & Running UrsaMU

Clone and Install:

```bash
git clone https://github.com/ursamu/ursamu.git
cd ursamu
npm i -g pm2 ts-node
npm i
```

### Starting the Server:

Production Mode:

```bash
npm run start  # Launch UrsaMU in production mode
```

Development Mode:

```bash
npm run dev  # Launch UrsaMU in development mode
```

Stopping the Server:

```bash
npm run stop  # Gracefully stop UrsaMU
```

### Contributing

Your contributions are what make UrsaMU better! Feel free to fork, send pull
requests, or open issues for discussion on enhancements or bug fixes. For
significant changes, we recommend opening an issue first to discuss your ideas.

## License

UrsaMU is open-sourced under the MIT License. Embrace the freedom to use,
modify, and distribute it as you see fit.

---

Happy MUSHing with UrsaMU! 🌟
