# pnpm-upgrade-interactive

A powerful interactive CLI tool for upgrading pnpm dependencies with ease. Inspired by `yarn upgrade-interactive`, this tool makes dependency management a breeze for pnpm projects. Perfect for monorepos, workspaces, and batch upgrades ❤️

![Interactive Upgrade Demo](docs/demo/interactive-upgrade.gif)

## What it does

Ever found yourself staring at a wall of outdated packages, wondering which ones to upgrade? This tool helps you:

- **Scans your entire project** - finds all package.json files in your workspace
- **Checks for updates** - compares your current versions against the latest available
- **Lets you pick what to upgrade** - interactive interface to select exactly what you want
- **Does the heavy lifting** - updates your package.json files and runs pnpm install for you

## Why choose pnpm-upgrade-interactive?

If you're using pnpm and miss the convenience of `yarn upgrade-interactive`, this tool is perfect for you!

- **🚀 Fast & Efficient** - Batch upgrade multiple packages at once
- **🔒 Safe Updates** - Choose between minor updates or major version jumps
- **🏢 Monorepo Friendly** - Works seamlessly with workspaces
- **📦 Registry Aware** - Checks npm registry for latest versions
- **🎯 Selective Upgrades** - Pick exactly which packages to upgrade
- **⚡ Zero Config** - Works out of the box with sensible defaults

## Installation

### With npx (no installation needed)

```bash
npx pnpm-upgrade-interactive
```

### Install globally with pnpm

```bash
pnpm add -g pnpm-upgrade-interactive
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
- `-e, --exclude <patterns>`: Skip directories matching these regex patterns (comma-separated)
- `--include-peer-deps`: Include peer dependencies in upgrade process (default: false)
- `--include-optional-deps`: Include optional dependencies in upgrade process (default: false)
- `--minor`: Show minor updates in range column instead of patch updates (default: false)

**Note:** By default, the tool only processes `dependencies` and `devDependencies`. Both `peerDependencies` and `optionalDependencies` are excluded by default and must be explicitly included with their respective flags.

**Update Detection:** By default, the tool shows patch updates in the range column (e.g., `^5.9.2` → `5.9.3`). Use `--minor` to show minor updates in the range column instead (e.g., `^5.9.2` → `5.10.0`).

Examples:

```bash
# Basic usage - scans only dependencies and devDependencies
pnpm-upgrade-interactive

# Include peer dependencies in the upgrade process
pnpm-upgrade-interactive --include-peer-deps

# Include optional dependencies
pnpm-upgrade-interactive --include-optional-deps

# Include both peer and optional dependencies
pnpm-upgrade-interactive --include-peer-deps --include-optional-deps

# Show minor updates in range column instead of patch updates (e.g., 5.9.2 → 5.10.0 instead of 5.9.3)
pnpm-upgrade-interactive --minor

# Skip example and test directories
pnpm-upgrade-interactive --exclude "example,test"

# Skip specific paths with regex
pnpm-upgrade-interactive -e "example/.*,.*\.test\..*"

# Run in a different directory
pnpm-upgrade-interactive --dir ../my-other-project

# Combine multiple options
pnpm-upgrade-interactive --dir ./packages --include-peer-deps --exclude "test,dist"
```

### How it works

1. **Scans your project** - Finds all package.json files recursively (respects exclude patterns)
2. **Collects dependencies** - Gathers dependencies based on your options (dependencies, devDependencies, and optionally peerDependencies/optionalDependencies)
3. **Checks for updates** - Queries npm registry for latest versions
4. **Shows you options** - Interactive UI lets you pick what to upgrade (minor updates or latest versions)
5. **Updates safely** - Modifies package.json files and runs `pnpm install` to update lockfile

## License

MIT
