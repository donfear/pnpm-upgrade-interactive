# pnpm-upgrade-interactive

A handy interactive tool for upgrading your dependencies. It works like `yarn upgrade-interactive` but for pnpm projects ❤️.

![Interactive Upgrade Demo](docs/demo/interactive-upgrade.gif)

## What it does

Ever found yourself staring at a wall of outdated packages, wondering which ones to upgrade? This tool helps you:

- **Scans your entire project** - finds all package.json files in your workspace
- **Checks for updates** - compares your current versions against the latest available
- **Lets you pick what to upgrade** - interactive interface to select exactly what you want
- **Does the heavy lifting** - updates your package.json files and runs pnpm install for you

## Features

- 🔍 **Smart scanning** - finds packages across monorepos and workspaces
- 📊 **Clear version comparison** - shows you exactly what's available to upgrade
- ✅ **Interactive selection** - use arrow keys to pick which packages to upgrade
- 🚀 **Safe upgrades** - choose between minor updates or major version jumps
- ⚡ **Batch processing** - upgrades multiple packages at once

## Installation

### Install globally with pnpm
```bash
pnpm add -g pnpm-upgrade-interactive
```

### Or use with npx (no installation needed)
```bash
npx pnpm-upgrade-interactive
```

### Alternative: npm
```bash
npm install -g pnpm-upgrade-interactive
```

## Usage

Just run it in your project directory:

```bash
pnpm-upgrade-interactive
```

The tool will scan your entire workspace (including monorepos), find outdated packages, and let you choose which ones to upgrade interactively.

### Command line options

- `-d, --dir <directory>`: Run in a specific directory (default: current directory)
- `-e, --exclude <patterns>`: Skip directories matching these regex patterns

Examples:
```bash
# Skip example and test directories
pnpm-upgrade-interactive --exclude "example,test"

# Skip specific paths with regex
pnpm-upgrade-interactive -e "example/.*,.*\.test\..*"

# Run in a different directory
pnpm-upgrade-interactive --dir ../my-other-project
```

### How it works

1. **Scans your project** - Finds all package.json files recursively
2. **Checks for updates** - Queries npm registry for latest versions
3. **Shows you options** - Interactive UI lets you pick what to upgrade
4. **Updates safely** - Modifies package.json and runs pnpm install

## Interactive Interface

When you run the tool, you'll see a list of outdated packages with three options for each:

- **● Current** - Keep your current version
- **○ Range** - Upgrade within your current range (e.g., ^4.1.0 → ^4.2.0)
- **○ Latest** - Jump to the latest version (could be a major update)

## License

MIT
