---
layout: layout.vto
description: Providing default config values and reading them at runtime
---

# Plugin Configuration

## Overview

Plugins can declare default configuration values via the `config` property on
`IPlugin`. These defaults are deep-merged into the global config at startup, so
game operators can override any value in `config/config.json` without touching
plugin code.
---

## Declaring Defaults

Add a `config` property to your `IPlugin` object. Nest your values under
`plugins.<plugin-name>` to avoid collisions with core config keys:

```typescript
import type { IPlugin } from "../../@types/IPlugin.ts";

const myPlugin: IPlugin = {
  name: "my-plugin",
  version: "1.0.0",

  config: {
    plugins: {
      "my-plugin": {
        maxItems:       50,
        welcomeMessage: "Welcome to my plugin!",
        enabled:        true,
      },
    },
  },

  init: async () => {
    return true;
  },
};

export default myPlugin;
```
---

## Reading Config

Import `getConfig` from the Config service:

```typescript
import { getConfig } from "../../services/Config/mod.ts";

// Read a single value with a fallback
const max     = getConfig<number>("plugins.my-plugin.maxItems")  ?? 50;
const enabled = getConfig<boolean>("plugins.my-plugin.enabled")  ?? true;
const msg     = getConfig<string>("plugins.my-plugin.welcomeMessage") ?? "";
```

`getConfig<T>(key)` traverses the merged config using dot-notation and returns
`undefined` if the key does not exist. Always supply a fallback.
---

## User Overrides

Operators drop their overrides into `config/config.json`. The plugin's declared
defaults are the baseline; anything in the file wins:

```json
{
  "server": { "telnet": 4201 },
  "plugins": {
    "my-plugin": {
      "maxItems": 100,
      "welcomeMessage": "Greetings, adventurer!"
    }
  }
}
```
---

## Sensitive Values

Never store secrets (tokens, API keys, passwords) in `config/config.json` or
in the plugin's default `config` object — that file is typically committed to
source control. Use environment variables instead:

```typescript
init: async () => {
  const apiKey = Deno.env.get("MY_PLUGIN_API_KEY");
  if (!apiKey) {
    console.error("[my-plugin] MY_PLUGIN_API_KEY is not set — plugin disabled.");
    return false;
  }
  // use apiKey ...
  return true;
},
```
---

## Full Example

A configurable rate-limiter plugin that reads its window and limit from config:

```typescript
// src/plugins/ratelimit/index.ts
import type { IPlugin } from "../../@types/IPlugin.ts";
import { getConfig } from "../../services/Config/mod.ts";
import "./commands.ts";

const rateLimitPlugin: IPlugin = {
  name: "ratelimit",
  version: "1.0.0",
  description: "Configurable per-player command rate limiter",

  // Declare defaults — operators can override in config/config.json
  config: {
    plugins: {
      ratelimit: {
        windowMs:  10_000,   // 10-second window
        maxCmds:   20,       // max commands per window
        warnAt:    15,       // warn player at this threshold
      },
    },
  },

  init: async () => {
    const window  = getConfig<number>("plugins.ratelimit.windowMs") ?? 10_000;
    const max     = getConfig<number>("plugins.ratelimit.maxCmds")  ?? 20;
    const warnAt  = getConfig<number>("plugins.ratelimit.warnAt")   ?? 15;

    console.log(`[ratelimit] window=${window}ms max=${max} warnAt=${warnAt}`);
    return true;
  },

  remove: async () => {
    console.log("[ratelimit] removed");
  },
};

export default rateLimitPlugin;
```
