# PRD: Ursamu Script Engine

## 1. Executive Summary

The **Script Engine** is a distributed micro-VM execution layer for Ursamu. This
document outlines the total depreciation of the legacy procedural parser in
favor of **Declarative Logic Nodes** powered by Firecracker-based Deno
Sandboxes. This architecture transforms game objects into autonomous logic units
capable of intercepting world intents and managing state through a modern,
beginner-friendly TypeScript SDK.

## 2. Core Philosophy

- **Total Depreciation:** The legacy string-evaluation and square-bracket
  function parser is completely removed.
- **Declarative > Imperative:** Users define the _state_ and _rules_ of an
  object; the engine handles the execution lifecycle.
- **Systemic Interaction:** Leveraging a hybrid **ECS (Entity Component
  System)** and **AOP (Aspect-Oriented Programming)** model, objects can modify
  the "laws of physics" in their environment.
- **Safety via Isolation:** Hardware-level sandboxing ensures user scripts
  cannot crash the host process or access unauthorized data.
- **Approachability:** A functional API that provides the power of professional
  software development to beginners without the overhead of complex boilerplate.

## 3. Technical Architecture

### 3.1. Sandbox Execution (The Runner)

- **Engine:** `@deno/sandbox` utilizing Firecracker micro-VMs.
- **Lifecycle Management:** Scripts are "Hibernated" (stored in DB) and
  "Awakened" (booted in a VM) only when an intent or pulse requires resolution.
- **Warm-Pooling:** Maintenance of a standby pool of pre-initialized VMs to
  ensure intent resolution remains under 200ms.
- **Resource Throttling:** Strict per-node limits on CPU cycles, memory
  allocation, and execution time.

### 3.2. The SDK (The `u` Global)

Every script runs within a pre-injected global namespace `u`:

- **`u.me` / `u.here` / `u.target`:** Reactive proxies for database entities.
- **`u.state`:** A persistent, reactive state store. Changes to `u.state`
  properties are automatically mirrored to the underlying `IDBObj` attributes.
- **`u.ui`:** A declarative UI library for generating structured JSON layouts
  (panels, buttons, inputs) for the web client.
- **`u.config`:** Access to server-defined constants and intent configurations.

### 3.3. Intent Interception (AOP Layer)

The engine supports **Intent Interceptors**, allowing objects to act as
middleware for game actions:

- **`intercept(intent)`:** A function that can modify, redirect, or cancel
  actions (e.g., `MOVE`, `SAY`, `COMBAT`) before they reach their target.
- **Priority Logic:** Interceptors are processed based on configurable
  priorities defined in the system config.

## 4. Configuration-Driven Intents

To ensure the engine is flexible and modifiable without core code changes, all
**Intents** are managed via `config.json`:

- **Registry:** A central list of valid intent types (e.g., `SAY`, `MOVE`,
  `LOOK`, `GET`).
- **Configurable Parameters:**
- `enabled`: Toggle specific systemic behaviors globally.
- `interceptionOrder`: Define if interceptors run in FIFO or LIFO order.
- `priority`: Default weights for intent resolution.

- **Dynamic Aliasing:** Map user commands to specific intent types via
  configuration.

## 5. Key Functional Requirements

### 5.1. Engine Integration

- Implement the `SCRIPT_NODE` flag. Objects with this flag are processed
  exclusively by the Script Engine.
- Bypass the legacy `parser.ts` entirely. All command processing is routed
  through the Intent Registry and Sandbox Runner.

### 5.2. Client-Side Experience

- **Declarative Hydration:** The web client renders `u.ui` JSON trees into
  native React components.
- **Optimistic UI:** The client-side SDK predicts intent outcomes for instant
  feedback, reconciling with the server-side result upon completion.

### 5.3. Developer Tooling

- **`@trace`**: Real-time piping of sandbox `stdout`/`stderr` to the player's
  terminal.
- **`@check`**: Static analysis of script attributes within a sandbox to provide
  immediate syntax feedback.

## 6. Implementation Roadmap

| Phase       | Focus                | Deliverables                                                                    |
| ----------- | -------------------- | ------------------------------------------------------------------------------- |
| **Phase 1** | **Infrastructure**   | Deno Sandbox integration and VM pooling logic.                                  |
| **Phase 2** | **SDK & State**      | The `u` namespace, reactive `u.state` proxies, and attribute mirroring.         |
| **Phase 3** | **Intent Registry**  | Config-driven intent system and AOP interception logic.                         |
| **Phase 4** | **Client Hydration** | React component rendering for declarative UI trees.                             |
| **Phase 5** | **Legacy Removal**   | Full removal of legacy parser and migration of core commands to the new engine. |

## 7. Competitive Edge

By moving beyond the imperative "hook" model used by servers like Evennia, the
**Ursamu Script Engine** treats the game world as a reactive middleware stack.
This allows for emergent gameplay where the "laws" of a room can change
dynamically through object composition and intent interception, providing a
systemic depth and security profile that is unique in the MUD/MUSH space.
