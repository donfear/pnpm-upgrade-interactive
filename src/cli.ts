#!/usr/bin/env node

import { Command } from 'commander'
import chalk from 'chalk'
import { readFileSync } from 'fs'
import { join } from 'path'
import { PnpmUpgradeInteractive } from './index'

const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'))

const program = new Command()

program
  .name('pnpm-aupgrade-interactive')
  .description('Interactive upgrade tool for pnpm packages')
  .version(packageJson.version)
  .option('-d, --dir <directory>', 'specify directory to run in', process.cwd())
  .option('-e, --exclude <patterns>', 'exclude paths matching regex patterns (comma-separated)', '')
  .option('-p, --peer', 'include peer dependencies in upgrade process')
  .option('-o, --optional', 'include optional dependencies in upgrade process')
  .action(async (options) => {
    console.log(chalk.bold.blue(`🚀 pnpm-upgrade-interactive v${packageJson.version}\n`))

    const excludePatterns = options.exclude
      ? options.exclude
          .split(',')
          .map((p: string) => p.trim())
          .filter(Boolean)
      : []

    // Commander.js: boolean flags are undefined if not provided, true if provided
    // Both flags default to false (opt-in)
    const includePeerDeps = options.peer === true
    const includeOptionalDeps = options.optional === true

    const upgrader = new PnpmUpgradeInteractive({
      cwd: options.dir,
      excludePatterns,
      includePeerDeps,
      includeOptionalDeps,
    })
    await upgrader.run()
  })

// Handle uncaught errors gracefully
process.on('uncaughtException', (error) => {
  console.error(chalk.red('Uncaught Exception:'), error.message)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  console.error(chalk.red('Unhandled Rejection:'), reason)
  process.exit(1)
})

// Handle Ctrl+C gracefully
let sigintReceived = false
process.on('SIGINT', () => {
  if (sigintReceived) {
    // Force exit on second Ctrl+C
    console.log(chalk.red('\n\nForce exiting...'))
    process.exit(1)
  } else {
    sigintReceived = true
    console.log(chalk.yellow('\n\nOperation cancelled by user. Press Ctrl+C again to force exit.'))
    process.exit(0)
  }
})

// Also handle SIGTERM
process.on('SIGTERM', () => {
  console.log(chalk.yellow('\n\nOperation cancelled.'))
  process.exit(0)
})

program.parse()
