---
layout: layout.vto
description: Learn how to contribute to the UrsaMU project
nav:
  - text: Code of Conduct
    url: "#code-of-conduct"
  - text: Getting Started
    url: "#getting-started"
  - text: Development Process
    url: "#development-process"
  - text: Pull Requests
    url: "#pull-requests"
  - text: Coding Standards
    url: "#coding-standards"
  - text: Documentation
    url: "#documentation"
---

# Contributing to UrsaMU

Thank you for your interest in contributing to UrsaMU! This guide will help you get started with contributing to the project.

## Code of Conduct

UrsaMU has adopted a Code of Conduct that we expect project participants to adhere to. Please read [the full text](./code-of-conduct.md) so that you can understand what actions will and will not be tolerated.

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- [Deno](https://deno.land/) (version 1.37.0 or higher)
- [Git](https://git-scm.com/)
- A code editor (we recommend [VS Code](https://code.visualstudio.com/) with the Deno extension)

### Setting Up Your Development Environment

1. Fork the [UrsaMU repository](https://github.com/lcanady/ursamu) on GitHub
2. Clone your fork to your local machine:
   ```bash
   git clone https://github.com/YOUR_USERNAME/ursamu.git
   cd ursamu
   ```
3. Add the original repository as a remote:
   ```bash
   git remote add upstream https://github.com/lcanady/ursamu.git
   ```
4. Install dependencies:
   ```bash
   deno task setup
   ```

## Development Process

### Branching Strategy

- `main` - The main development branch
- `release/*` - Release branches
- `feature/*` - Feature branches
- `bugfix/*` - Bug fix branches

Always create a new branch for your changes:

```bash
git checkout -b feature/your-feature-name
```

### Development Workflow

1. Make sure your branch is up to date with the latest changes:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```
2. Make your changes
3. Run tests to ensure your changes don't break anything:
   ```bash
   deno task test
   ```
4. Commit your changes with a descriptive commit message:
   ```bash
   git commit -m "Add feature: your feature description"
   ```
5. Push your changes to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

## Pull Requests

When you're ready to submit your changes, create a pull request:

1. Go to your fork on GitHub
2. Select your branch
3. Click "Pull Request"
4. Fill out the pull request template with details about your changes
5. Submit the pull request

### Pull Request Guidelines

- Keep pull requests focused on a single feature or bug fix
- Make sure all tests pass
- Update documentation as needed
- Follow the coding standards
- Be responsive to feedback and questions

## Coding Standards

UrsaMU follows a set of coding standards to maintain consistency across the codebase:

- Use TypeScript for all code
- Follow the [Deno Style Guide](https://deno.land/manual/contributing/style_guide)
- Use meaningful variable and function names
- Write comments for complex logic
- Include JSDoc comments for public APIs
- Write tests for new features and bug fixes

## Documentation

Documentation is a crucial part of UrsaMU. When contributing, please:

- Update the documentation for any changes to APIs or features
- Use clear, concise language
- Include examples where appropriate
- Follow the [documentation guidelines](./documentation-guidelines.md)

### Building Documentation

To build and preview the documentation locally:

```bash
deno task docs
```

This will start a local server where you can preview the documentation.

## Getting Help

If you need help with contributing to UrsaMU, you can:

- Join the [UrsaMU Discord server](#)
- Open an issue on GitHub
- Reach out to the maintainers

Thank you for contributing to UrsaMU! Your efforts help make the project better for everyone. 