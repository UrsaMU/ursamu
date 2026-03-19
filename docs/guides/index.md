---
layout: layout.vto
title: Guides
description: User guides and tutorials for UrsaMU
nav:
  - text: Installation Guide
    url: "./installation.md"
  - text: User Guide
    url: "./user-guide.md"
  - text: Admin Guide
    url: "./admin-guide.md"
  - text: Scripting
    url: "./scripting.md"
  - text: MUSH Compatibility
    url: "../mush_compatibility.md"
  - text: Lock Expressions
    url: "./lock-expressions.md"
  - text: Password Reset
    url: "./password-reset.md"
  - text: Wiki
    url: "./wiki.md"
  - text: Writing Help Files
    url: "./help-authoring.md"
  - text: Scenes
    url: "./scenes.md"
  - text: Production Deployment
    url: "./deployment.md"
  - text: Customization
    url: "./customization.md"
---

# UrsaMU Guides

This section contains comprehensive guides and tutorials to help you get started
with UrsaMU, whether you're installing it for the first time, learning how to
use it as a player, or administering your own server.

## Installation Guide

Learn how to install and set up UrsaMU on your system:

- [Prerequisites](./installation.md#prerequisites)
- [Installation Methods](./installation.md#installation-methods)
- [Configuration](./installation.md#configuration)
- [Running the Server](./installation.md#running-the-server)

## User Guide

Learn how to use UrsaMU as a player:

- [Getting Started](./user-guide.md#getting-started)
- [Basic Commands](./user-guide.md#basic-commands)
- [Character Creation](./user-guide.md#character-creation)
- [Communication](./user-guide.md#communication)

## Admin Guide

Learn how to administer an UrsaMU server:

- [User Management](./admin-guide.md#user-management)
- [Server Configuration](./admin-guide.md#server-configuration)
- [Backup and Restore](./admin-guide.md#backup-and-restore)
- [Troubleshooting](./admin-guide.md#troubleshooting)

## Scripting Guide

Write TypeScript/JS scripts that run in the sandboxed SDK:

- [How scripting works](./scripting.md#how-scripting-works)
- [The SDK (`u`)](./scripting.md#the-sdk-u)
- [Writing a script](./scripting.md#writing-a-script)
- [Testing scripts](./scripting.md#testing-scripts)

## MUSH Compatibility

Coming from PennMUSH, TinyMUSH, or MUX2? See what works today and what's planned:

- [What works today](../mush_compatibility/#what-works-today)
- [What's different](../mush_compatibility/#whats-different-from-traditional-mush)
- [Planned enhancements](../mush_compatibility/#planned-enhancements)
- [Connecting with MU* clients](../mush_compatibility/#connecting-with-a-traditional-mu-client)

## Production Deployment

Get UrsaMU running reliably in production:

- [Environment variables](./deployment.md#environment-variables)
- [Daemon mode](./deployment.md#daemon-mode)
- [systemd service](./deployment.md#systemd)
- [Nginx + TLS](./deployment.md#nginx-and-tls)
- [Firewall & log rotation](./deployment.md#firewall)

## Scenes

Create, write in, and export collaborative roleplay logs:

- [Creating a scene](./scenes.md#creating-a-scene)
- [Writing poses](./scenes.md#writing-poses)
- [Private scenes & invitations](./scenes.md#private-scenes)
- [Exporting a scene](./scenes.md#exporting-a-scene)
- [Full API reference](./scenes.md#api-reference)

## Wiki

Build and manage your game wiki with file-based Markdown:

- [Directory structure](./wiki.md#directory-structure)
- [Frontmatter](./wiki.md#frontmatter)
- [In-game commands](./wiki.md#in-game-commands)
- [REST API](./wiki.md#rest-api)
- [Hooks](./wiki.md#hooks)

## Writing Help Files

Create and organize in-game help files for your players:

- [Directory structure](./help-authoring.md#directory-structure)
- [File naming conventions](./help-authoring.md#file-naming)
- [Markdown support & tables](./help-authoring.md#markdown-support)
- [How players access help](./help-authoring.md#how-players-access-help)

## Password Reset

How admins generate reset tokens and players consume them:

- [Admin steps](./password-reset.md#admin-steps)
- [Player steps & API](./password-reset.md#player-steps)
- [Error responses](./password-reset.md#error-responses)

## Lock Expressions

Control access to commands, exits, and objects with lock expressions:

- [Flag checks](./lock-expressions.md#flag-checks)
- [Boolean operators](./lock-expressions.md#boolean-operators)
- [Attribute checks](./lock-expressions.md#attribute-checks)
- [Using locks in scripts](./lock-expressions.md#using-locks-in-scripts)

## Customization

Learn how to customize your UrsaMU server:

- [Themes](./customization.md#themes)
- [Commands](./customization.md#commands)
- [Game Mechanics](./customization.md#game-mechanics)
- [Integration](./customization.md#integration)
