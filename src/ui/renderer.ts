import chalk from 'chalk'
import { PackageSelectionState } from '../types'
import { VersionUtils } from './utils'

export class UIRenderer {
  renderPackageLine(state: PackageSelectionState, index: number, isCurrentRow: boolean): string {
    const prefix = isCurrentRow ? chalk.green('❯ ') : '  '

    // Package name with special formatting for scoped packages (@author/package)
    let packageName
    if (state.name.startsWith('@')) {
      const parts = state.name.split('/')
      if (parts.length >= 2) {
        const author = parts[0] // @author
        const packagePart = parts.slice(1).join('/') // package name

        if (isCurrentRow) {
          packageName = chalk.white.bold(author) + chalk.cyan('/' + packagePart)
        } else {
          packageName = chalk.white.bold(author) + chalk.white('/' + packagePart)
        }
      } else {
        packageName = isCurrentRow ? chalk.cyan(state.name) : chalk.white(state.name)
      }
    } else {
      packageName = isCurrentRow ? chalk.cyan(state.name) : chalk.white(state.name)
    }

    // Determine which dot should be filled (only one per package)
    const isCurrentSelected = state.selectedOption === 'none'
    const isRangeSelected = state.selectedOption === 'range'
    const isLatestSelected = state.selectedOption === 'latest'

    // Current version dot and version (show original specifier with prefix)
    const currentDot = isCurrentSelected ? chalk.green('●') : chalk.gray('○')
    const currentVersion = chalk.white(state.currentVersionSpecifier)

    // Range version dot and version
    let rangeDot = ''
    let rangeVersionText = ''
    let rangeDashes = ''
    if (state.hasRangeUpdate) {
      rangeDot = isRangeSelected ? chalk.green('●') : chalk.gray('○')
      const rangeVersionWithPrefix = VersionUtils.applyVersionPrefix(
        state.currentVersionSpecifier,
        state.rangeVersion
      )
      rangeVersionText = chalk.yellow(rangeVersionWithPrefix)
      rangeDashes = ''
    } else {
      rangeDot = chalk.gray('○')
      rangeVersionText = ''
      rangeDashes = chalk.gray('─')
    }

    // Latest version dot and version
    let latestDot = ''
    let latestVersionText = ''
    let latestDashes = ''
    if (state.hasMajorUpdate) {
      latestDot = isLatestSelected ? chalk.green('●') : chalk.gray('○')
      const latestVersionWithPrefix = VersionUtils.applyVersionPrefix(
        state.currentVersionSpecifier,
        state.latestVersion
      )
      latestVersionText = chalk.red(latestVersionWithPrefix)
      latestDashes = ''
    } else {
      latestDot = chalk.gray('○')
      latestVersionText = ''
      latestDashes = chalk.gray('─')
    }

    // Fixed column widths for perfect alignment
    const packageNameWidth = 38 // Total package column width minus prefix (2 chars)
    const currentColumnWidth = 16 // Increased to accommodate ^ and ~ prefixes
    const rangeColumnWidth = 16 // Increased to accommodate ^ and ~ prefixes
    const latestColumnWidth = 16 // Increased to accommodate ^ and ~ prefixes

    // Package name with fixed width and dashes
    const nameLength = state.name.length
    const namePadding = Math.max(0, packageNameWidth - nameLength - 1) // -1 for space after package name
    const nameDashes = '-'.repeat(namePadding)
    const dashColor = isCurrentRow ? chalk.white : chalk.gray
    const packageNameSection = `${packageName} ${dashColor(nameDashes)}`

    // Current version section with fixed width
    const currentSection = `${currentDot} ${currentVersion}`
    const currentSectionLength = VersionUtils.getVisualLength(currentSection) + 1 // +1 for space before dashes
    const currentPadding = Math.max(0, currentColumnWidth - currentSectionLength)
    const currentWithPadding = currentSection + ' ' + dashColor('-').repeat(currentPadding)

    // Range version section with fixed width
    let rangeSection = ''
    if (state.hasRangeUpdate) {
      rangeSection = `${rangeDot} ${rangeVersionText}`
      const rangeSectionLength = VersionUtils.getVisualLength(rangeSection) + 1 // +1 for space before dashes
      const rangePadding = Math.max(0, rangeColumnWidth - rangeSectionLength)
      rangeSection += ' ' + dashColor('-').repeat(rangePadding)
    } else {
      // Empty slot - just spaces to maintain column width
      rangeSection = ' '.repeat(rangeColumnWidth)
    }

    // Latest version section with fixed width
    let latestSection = ''
    if (state.hasMajorUpdate) {
      latestSection = `${latestDot} ${latestVersionText}`
      const latestSectionLength = VersionUtils.getVisualLength(latestSection) + 1 // +1 for space before dashes
      const latestPadding = Math.max(0, latestColumnWidth - latestSectionLength)
      latestSection += ' ' + dashColor('-').repeat(latestPadding)
    } else {
      // Empty slot - just spaces to maintain column width
      latestSection = ' '.repeat(latestColumnWidth)
    }

    // Build line with fixed column widths
    const line = `${prefix}${packageNameSection}   ${currentWithPadding}   ${rangeSection}   ${latestSection}`

    return line
  }

  renderInterface(
    states: PackageSelectionState[],
    currentRow: number,
    scrollOffset: number,
    maxVisibleItems: number,
    isInitialRender: boolean
  ): string[] {
    const output: string[] = []

    if (isInitialRender) {
      // Initial full render
      output.push('  ' + chalk.bold.magenta('🚀 pnpm-upgrade-interactive'))
      output.push('')
      output.push(
        '  ' +
          chalk.bold.white('↑/↓ ') +
          chalk.gray('Move') +
          '  ' +
          chalk.bold.white('←/→ ') +
          chalk.gray('Select versions') +
          '  ' +
          chalk.bold.white('M ') +
          chalk.gray('Select all minor') +
          '  ' +
          chalk.bold.white('L ') +
          chalk.gray('Select all updates') +
          '  ' +
          chalk.bold.white('U ') +
          chalk.gray('Unselect all')
      )

      // Show status line with item range
      const totalItems = states.length
      const startItem = scrollOffset + 1
      const endItem = Math.min(scrollOffset + maxVisibleItems, totalItems)
      const statusLine =
        totalItems > maxVisibleItems
          ? chalk.gray(
              `Showing ${chalk.gray(startItem)}-${chalk.gray(endItem)} of ${chalk.gray(totalItems)} packages`
            ) +
            '  ' +
            chalk.gray('Enter ') +
            chalk.gray('Confirm') +
            '  ' +
            chalk.gray('Esc ') +
            chalk.gray('Cancel')
          : chalk.gray(`Showing all ${chalk.gray(totalItems)} packages`) +
            '  ' +
            chalk.gray('Enter ') +
            chalk.gray('Confirm') +
            '  ' +
            chalk.gray('Esc ') +
            chalk.gray('Cancel')
      output.push('  ' + statusLine)
      output.push('')

      // Render only visible packages
      for (let i = scrollOffset; i < Math.min(scrollOffset + maxVisibleItems, states.length); i++) {
        const line = this.renderPackageLine(states[i], i, i === currentRow)
        output.push(line)
      }
    } else {
      // Incremental render - return lines for cursor positioning and updates
      output.push('  ' + chalk.bold.magenta('🚀 pnpm-upgrade-interactive'))
      output.push('')
      output.push(
        '  ' +
          chalk.bold.white('↑/↓ ') +
          chalk.gray('Move') +
          '  ' +
          chalk.bold.white('←/→ ') +
          chalk.gray('Select versions') +
          '  ' +
          chalk.bold.white('M ') +
          chalk.gray('Select all minor') +
          '  ' +
          chalk.bold.white('L ') +
          chalk.gray('Select all updates') +
          '  ' +
          chalk.bold.white('U ') +
          chalk.gray('Unselect all')
      )

      // Show status line with item range
      const totalItems = states.length
      const startItem = scrollOffset + 1
      const endItem = Math.min(scrollOffset + maxVisibleItems, totalItems)
      const statusLine =
        totalItems > maxVisibleItems
          ? chalk.gray(
              `Showing ${chalk.gray(startItem)}-${chalk.gray(endItem)} of ${chalk.gray(totalItems)} packages`
            ) +
            '  ' +
            chalk.gray('Enter ') +
            chalk.gray('Confirm') +
            '  ' +
            chalk.gray('Esc ') +
            chalk.gray('Cancel')
          : chalk.gray(`Showing all ${chalk.gray(totalItems)} packages`) +
            '  ' +
            chalk.gray('Enter ') +
            chalk.gray('Confirm') +
            '  ' +
            chalk.gray('Esc ') +
            chalk.gray('Cancel')
      output.push('  ' + statusLine)
      output.push('')

      // Render only visible packages
      for (let i = scrollOffset; i < Math.min(scrollOffset + maxVisibleItems, states.length); i++) {
        const line = this.renderPackageLine(states[i], i, i === currentRow)
        output.push(line)
      }
    }

    return output
  }

  renderPackagesTable(packages: any[]): string {
    if (packages.length === 0) {
      return chalk.green('✅ All packages are up to date!')
    }

    const outdatedPackages = packages.filter((p) => p.isOutdated)

    if (outdatedPackages.length === 0) {
      return chalk.green('✅ All packages are up to date!')
    }

    // Just show a simple message, the interactive interface will handle the display
    return chalk.bold.blue('🚀 pnpm-upgrade-interactive\n')
  }

  renderConfirmation(choices: any[]): string {
    if (choices.length === 0) {
      return chalk.yellow('No packages selected for upgrade.')
    }

    // Group choices by package name to show unique packages
    const packagesByName = new Map<string, any[]>()
    choices.forEach((choice) => {
      if (!packagesByName.has(choice.name)) {
        packagesByName.set(choice.name, [])
      }
      packagesByName.get(choice.name)!.push(choice)
    })

    let output = chalk.bold(`\n🚀 Ready to upgrade ${packagesByName.size} package(s):\n`)
    packagesByName.forEach((packageChoices, packageName) => {
      // Use the first choice for display (they should all have the same target version for the same package)
      const choice = packageChoices[0]
      const upgradeTypeColor = choice.upgradeType === 'range' ? chalk.yellow : chalk.red
      const instancesText =
        packageChoices.length > 1 ? chalk.gray(` (${packageChoices.length} instances)`) : ''
      output += `  • ${chalk.cyan(packageName)} → ${upgradeTypeColor(choice.targetVersion)} ${chalk.gray(`(${choice.upgradeType})`)}${instancesText}\n`
    })

    output += chalk.gray('Press Enter/Y to proceed, N to go back to selection, ESC to cancel\n')

    return output
  }
}
