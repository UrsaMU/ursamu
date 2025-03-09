# Simple UrSamu Game Example

This is a minimal example of how to use UrSamu as a library to create a custom game.

## Getting Started

### Prerequisites

- [Deno](https://deno.land/) (v1.37.0 or higher)

### Running the Game

To run the game, navigate to the root of the UrSamu repository and run:

```bash
deno run -A examples/simple-game/game.ts
```

### Connecting to the Game

Once the game is running, you can connect to it via:

- **Telnet**: Connect to `localhost:4200` using a telnet client
- **Web Client**: Open a web browser and navigate to `http://localhost:4201`

## Features

This example game includes:

- A custom configuration
- A custom plugin
- A custom command (`hello`)
- A custom connect screen

### Custom Command: `hello`

The game includes a custom `hello` command that allows players to greet each other:

- `hello` - Greets the player
- `hello <player>` - Greets the specified player

## Project Structure

```
simple-game/
├── commands/
│   └── hello.ts       # Custom hello command
├── text/
│   └── connect.txt    # Custom connect screen
├── game.ts            # Main game file
└── README.md          # This file
```

## Extending the Game

To extend this example game, you can:

1. Add more custom commands in the `commands/` directory
2. Add more custom text files in the `text/` directory
3. Modify the configuration in `game.ts`
4. Add more plugins in `game.ts`

## License

This project is licensed under the MIT License - see the LICENSE file in the root directory for details. 