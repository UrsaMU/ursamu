---
layout: layout.vto
title: Customization Guide
description: Learn how to customize your UrsaMU server
nav:
  - text: Themes
    url: "#themes"
  - text: Commands
    url: "#commands"
  - text: Game Mechanics
    url: "#game-mechanics"
  - text: Integration
    url: "#integration"
  - text: Plugins
    url: "#plugins"
  - text: Web Interface
    url: "#web-interface"
---

# Customization Guide

This guide covers how to customize your UrsaMU server to create a unique
experience for your players.

## Themes

### Visual Themes

UrsaMU supports customizable visual themes for the web interface:

1. Create a new theme directory in `themes/`
2. Create CSS files for your theme
3. Configure your theme in `config.json`:
   ```json
   "theme": {
     "name": "your-theme-name",
     "options": {
       "primaryColor": "#3498db",
       "secondaryColor": "#2ecc71"
     }
   }
   ```

### Text Formatting

You can customize text formatting with ANSI color codes:

- `%r` - Red
- `%g` - Green
- `%b` - Blue
- `%c` - Cyan
- `%m` - Magenta
- `%y` - Yellow
- `%w` - White
- `%x` - Reset to default

Example: `%rThis text is red%x and this is normal.`

## Commands

### Creating Custom Commands

You can create custom commands using the command API:

```typescript
game.commands.add({
  name: "mycmd",
  pattern: /^mycmd\s+(.+)$/i,
  flags: "connected",
  exec: (match, context) => {
    const arg = match[1];
    context.send(`You used mycmd with argument: ${arg}`);
  },
});
```

### Modifying Existing Commands

You can override existing commands by registering a new command with the same
name:

```typescript
game.commands.add({
  name: "look",
  pattern: /^(?:look|l)(?:\s+(.+))?$/i,
  flags: "connected",
  exec: (match, context) => {
    // Your custom look implementation
  },
});
```

## Game Mechanics

### Custom Attributes

You can define custom attributes for objects and characters:

```typescript
game.attributes.define({
  name: "strength",
  defaultValue: 10,
  min: 1,
  max: 20,
  flags: ["character", "numeric"],
});
```

### Custom Functions

Create custom functions for use in your game:

```typescript
game.functions.add({
  name: "add",
  args: ["num1", "num2"],
  exec: (args, context) => {
    return Number(args.num1) + Number(args.num2);
  },
});
```

### Custom Flags

Define custom flags for objects:

```typescript
game.flags.define({
  name: "invisible",
  description: "Object is invisible to normal players",
  defaultValue: false,
});
```

## Integration

### External APIs

UrsaMU can integrate with external APIs:

```typescript
game.hooks.on("command:weather", async (context) => {
  const weather = await fetch("https://api.weather.com/...");
  const data = await weather.json();
  context.send(`Current weather: ${data.description}`);
});
```

### Database Integration

Connect to external databases:

```typescript
const db = new Database({
  type: "postgres",
  host: "localhost",
  port: 5432,
  username: "user",
  password: "password",
  database: "mydb",
});

game.hooks.on("startup", () => {
  db.connect();
});
```

## Plugins

### Installing Plugins

To install a plugin:

1. Download the plugin to the `plugins/` directory
2. Add the plugin to your configuration:
   ```json
   "plugins": [
     "my-plugin"
   ]
   ```
3. Restart your server

### Creating Plugins

Create your own plugins to extend UrsaMU:

1. Create a new directory in `plugins/`
2. Create a `plugin.json` file:
   ```json
   {
     "name": "my-plugin",
     "version": "1.0.0",
     "description": "My custom plugin",
     "main": "index.ts"
   }
   ```
3. Create an `index.ts` file with your plugin code
4. See the [Plugin Development](../plugins/index.md) section for more details

## Web Interface

### Customizing the Web Client

The web client can be customized by modifying the templates:

1. Copy the default templates from `templates/` to `custom-templates/`
2. Modify the templates as needed
3. Configure UrsaMU to use your custom templates:
   ```json
   "templates": {
     "directory": "custom-templates"
   }
   ```

### Custom CSS

Add custom CSS to the web interface:

1. Create a `custom.css` file in `public/css/`
2. Add your custom styles
3. Configure UrsaMU to include your CSS:
   ```json
   "webClient": {
     "customCSS": ["custom.css"]
   }
   ```

### Custom JavaScript

Add custom JavaScript to the web interface:

1. Create a `custom.js` file in `public/js/`
2. Add your custom scripts
3. Configure UrsaMU to include your JavaScript:
   ```json
   "webClient": {
     "customJS": ["custom.js"]
   }
   ```
