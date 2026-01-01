# UrsaMU Developer Guide

## System Architecture

UrsaMU consists of three main components:

1. **Hub (Core Engine)**: Headless WebSocket/HTTP server. Handles game logic and
   database.
2. **Telnet Sidecar**: Connects to the Hub via WebSocket and exposes a Telnet
   interface for legacy clients.
3. **Web Client (Deno Fresh)**: A modern web interface connecting natively to
   the Hub's WebSocket.

## Running the Stack

To run the full system, you will need three terminal instances (or a process
manager).

### 1. Start the Hub (Core)

The Hub manages the database and game state.

```bash
deno task server
# Runs on localhost:4202 (WS) and localhost:4203 (HTTP/WS)
```

### 2. Start the Telnet Sidecar (Optional)

If you want to support existing MUD clients.

```bash
deno task telnet
# connects to Hub and listens on configured Telnet port (default 4201)
```

### 3. Start the Web Client

The modern frontend.

```bash
cd src/web-client
deno task start
# Runs on http://localhost:8000
```

## WebSocket API Structure

The Hub communicates via a JSON stream over WebSocket.

**Endpoint**: `ws://localhost:4202` (or `4203` for native upgrades)

### Message Format

Expected JSON format for both sending and receiving:

```json
{
  "msg": "Command or Message Content",
  "data": {
    "cid": "Character ID (for Authentication)",
    "connected": true,
    ...other_metadata
  }
}
```

### Authentication Flow

1. **Login** via REST API: `POST http://localhost:4202/api/v1/auth/` with
   `{ username, password }`.
2. **Receive Token** (JWT).
3. **Decode Token** to get `id`.
4. **Connect WebSocket**.
5. **Send Auth Packet**:
   ```json
   {
     "msg": "connect",
     "data": { "cid": "USER_ID_FROM_TOKEN" }
   }
   ```

### Terminal Rendering

The `msg` field often contains pre-formatted text (which may include HTML
entities or custom markup depending on the presenter used). The Web Client
should treat it as HTML or ANSI-parsed text.
