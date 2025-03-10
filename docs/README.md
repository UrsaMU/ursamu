# UrsaMU Documentation

This directory contains the documentation for UrsaMU, structured to be built as a static site using [Lume](https://lume.land/), a static site generator for Deno.

## Building the Documentation

### Prerequisites

- [Deno](https://deno.land/) version 1.32.0 or higher

### Installation

No additional installation is needed as Lume runs directly with Deno.

### Local Development

To serve the documentation locally:

```bash
# Navigate to the docs directory
cd docs

# Start the local server
deno task serve
```

This will start a local server at http://localhost:3000/ where you can preview the documentation.

### Building the Static Site

To build the static site:

```bash
# Navigate to the docs directory
cd docs

# Build the site
deno task build
```

This will create a `_site` directory with the built static site.

## Documentation Structure

- `index.md`: Main landing page
- `guides/`: User guides and tutorials
- `api/`: API reference documentation
- `configuration/`: Configuration guides
- `plugins/`: Plugin documentation
- `development/`: Development guides

## Contributing to the Documentation

1. Fork the repository
2. Create a new branch for your changes
3. Make your changes to the documentation
4. Submit a pull request

Please ensure your documentation follows the existing style and structure.

## License

The documentation is licensed under the same [MIT License](../LICENSE) as the UrsaMU project. 