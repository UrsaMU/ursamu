# UrsaMU

### The Next-Generation MU* Engine

![ursamu header](ursamu_github_banner.png)

UrsaMU is a modern, high-performance MUSH-like server built with **TypeScript**
and **Deno**.

---

## ⚡ Quick Start: The "DX" Experience

The easiest way to create and manage an UrsaMU project is using `dx` (if
installed) or `deno run`.

> [!TIP]
> **No install required!** You can run the CLI directly from JSR.

### Creates a new Project

```bash
dx jsr:@ursamu/ursamu init
```

_Or without `dx`:_

```bash
deno run -A jsr:@ursamu/ursamu init
```

### Manage Plugins

You can also manage plugins smoothly without installing a global binary:

```bash
# List plugins
dx jsr:@ursamu/ursamu plugin list

# Install a plugin
dx jsr:@ursamu/ursamu plugin install https://github.com/my/plugin
```

---

## 📋 Prerequisites

You must have **Deno** installed on your system.

### Mac & Linux

```bash
curl -fsSL https://deno.land/install.sh | sh
```

### Windows (PowerShell)

```powershell
irm https://deno.land/install.ps1 | iex
```

---

## ✨ Features

- 🚀 **High Performance**: Powered by Deno and Deno KV for modern, efficient
  execution.
- 🧩 **Modular Architecture**: Microservices-based design with independent
  processes.
- 🔌 **Extensible**: Powerful plugin system to build your unique MU* experience.
- 🌐 **Modern Networking**: Native WebSocket support and REST APIs.
- 🛡️ **Built-in Systems**: Integrated mail, bulletin boards, and channel
  management.
- 🛠️ **Developer Friendly**: Built with TypeScript, ensuring type safety and
  great IDE support.

---

## 🏛 Architecture

UrsaMU is designed to be resilient and modular:

- **Main Server**: Handles game logic, persistence, and the modern web stack
  (HTTP/WebSockets).
- **Telnet Server**: A lightweight, independent process that proxies classic
  connections to the main server via WebSockets.
- **Deno KV**: Provides low-latency, transactional storage for all game data.

---

## 🛠 Command Line Interface

Manage your game directly from the terminal:

```bash
# Show configuration
deno task config

# Install the CLI tool
deno task install-cli
```

---

## 📚 Resources

Documentation is hosted on GitHub Pages:

- 📖 [Official Documentation](https://ursamu.github.io/ursamu/)
- 📦 [API Reference](https://ursamu.github.io/ursamu/api/)
- 🐙 [UrsaMU GitHub](https://github.com/ursamu/ursamu)

---

## 📜 License

UrsaMU is licensed under the **MIT License**.

---

> [!TIP]
> Pull requests are welcome! For major changes, please open an issue first to
> discuss your ideas.
