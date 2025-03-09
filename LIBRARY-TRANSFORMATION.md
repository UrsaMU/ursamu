# UrSamu Library Transformation

This document summarizes the changes made to transform UrSamu from a standalone application into a library that developers can use to build their own MU* games with minimal effort.

## Key Changes

### 1. Restructured Entry Points

- **Updated `src/index.ts`**: Reorganized exports to provide a cleaner, more organized API
- **Created `mod.ts`**: Added a root-level module entry point for easier importing
- **Refactored `src/main.ts`**: Made the main initialization function more flexible and configurable

### 2. Enhanced Configuration Options

- Added options to control various aspects of initialization:
  - Loading default commands
  - Loading default text files
  - Auto-creating default rooms
  - Auto-creating default channels
  - Specifying custom command paths
  - Specifying custom text file paths

### 3. Improved API

- The `mu()` function now returns an object with references to important components:
  - Server instance
  - Configuration utilities
  - Plugin utilities
  - Database access
  - Broadcast function
  - Flag utilities

### 4. Documentation

- **Created `README-LIB.md`**: Comprehensive documentation for using UrSamu as a library
- **Updated `README.md`**: Added information about the library functionality
- **Created template file**: Added `src/template.ts` as a starting point for new projects

### 5. Example Project

- Created a simple example game in `examples/simple-game/` that demonstrates:
  - Custom configuration
  - Custom plugins
  - Custom commands
  - Custom text files

## How to Use

Developers can now use UrSamu in their projects by:

1. Importing the library:
   ```typescript
   import { mu } from "https://github.com/lcanady/ursamu/mod.ts";
   ```

2. Initializing with custom configuration:
   ```typescript
   const engine = await mu(myConfig, myPlugins, options);
   ```

3. Using the returned engine object to interact with the system:
   ```typescript
   console.log(`${engine.config.get("game.name")} started successfully!`);
   ```

## Benefits

This transformation provides several benefits:

1. **Easier Customization**: Developers can easily customize the game without modifying the core codebase
2. **Better Separation of Concerns**: Clear separation between core functionality and game-specific code
3. **Improved Developer Experience**: Simplified API and comprehensive documentation
4. **Reduced Duplication**: Developers can reuse core functionality while focusing on their unique features

## Future Improvements

Potential future improvements to the library:

1. **Plugin Marketplace**: Create a central repository for sharing plugins
2. **Command Framework Enhancements**: Make it even easier to create custom commands
3. **Web Client Customization**: Provide more options for customizing the web client
4. **Database Abstraction**: Make it easier to use different database backends
5. **Testing Utilities**: Add tools for testing custom commands and plugins 