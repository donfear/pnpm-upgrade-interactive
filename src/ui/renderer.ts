import chalk from 'chalk'
import { PackageSelectionState, RenderableItem } from '../types'
import { VersionUtils } from './utils'

export class UIRenderer {
  /**
   * Remove ANSI color codes from a string for length calculation
   */
  private stripAnsi(str: string): string {
    return str.replace(/\u001b\[[0-9;]*m/g, '')
  }

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

  renderSectionHeader(title: string, sectionType: 'main' | 'peer' | 'optional'): string {
    const colorFn =
      sectionType === 'main' ? chalk.cyan : sectionType === 'peer' ? chalk.magenta : chalk.yellow
    return '  ' + colorFn.bold(title)
  }

  renderSpacer(): string {
    return ''
  }

  renderInterface(
    states: PackageSelectionState[],
    currentRow: number,
    scrollOffset: number,
    maxVisibleItems: number,
    isInitialRender: boolean,
    renderableItems?: RenderableItem[],
    dependencyTypeLabel?: string
  ): string[] {
    const output: string[] = []

    // Header section (same for initial and incremental render)
    output.push('  ' + chalk.bold.magenta('🚀 pnpm-upgrade-interactive'))
    output.push('')

    // Show dependency type if provided
    if (dependencyTypeLabel) {
      output.push('  ' + chalk.bold.cyan(dependencyTypeLabel))
      output.push('')
    }
    output.push(
      '  ' +
        chalk.bold.white('↑/↓ ') +
        chalk.gray('Move') +
        '  ' +
        chalk.bold.white('←/→ ') +
        chalk.gray('Select versions') +
        '  ' +
        chalk.bold.white('I ') +
        chalk.gray('Info') +
        '  ' +
        chalk.bold.white('M ') +
        chalk.gray('Select all minor') +
        '  ' +
        chalk.bold.white('L ') +
        chalk.gray('Select all')
    )
    output.push('  ' + chalk.bold.white('U ') + chalk.gray('Unselect all'))

    // Show status line with item range
    const totalPackages = states.length
    const totalVisualItems = renderableItems?.length ?? totalPackages
    const startItem = scrollOffset + 1
    const endItem = Math.min(scrollOffset + maxVisibleItems, totalVisualItems)
    const statusLine =
      totalVisualItems > maxVisibleItems
        ? chalk.gray(
            `Showing ${chalk.gray(startItem)}-${chalk.gray(endItem)} of ${chalk.gray(totalPackages)} packages`
          ) +
          '  ' +
          chalk.gray('Enter ') +
          chalk.gray('Confirm') +
          '  ' +
          chalk.gray('Esc ') +
          chalk.gray('Cancel')
        : chalk.gray(`Showing all ${chalk.gray(totalPackages)} packages`) +
          '  ' +
          chalk.gray('Enter ') +
          chalk.gray('Confirm') +
          '  ' +
          chalk.gray('Esc ') +
          chalk.gray('Cancel')
    output.push('  ' + statusLine)
    output.push('')

    // Render visible items
    if (renderableItems && renderableItems.length > 0) {
      // Use renderable items for grouped display
      for (
        let i = scrollOffset;
        i < Math.min(scrollOffset + maxVisibleItems, renderableItems.length);
        i++
      ) {
        const item = renderableItems[i]
        if (item.type === 'header') {
          output.push(this.renderSectionHeader(item.title, item.sectionType))
        } else if (item.type === 'spacer') {
          output.push(this.renderSpacer())
        } else if (item.type === 'package') {
          const line = this.renderPackageLine(
            item.state,
            item.originalIndex,
            item.originalIndex === currentRow
          )
          output.push(line)
        }
      }
    } else {
      // Fallback to flat rendering (legacy mode)
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

  /**
   * Format a number for display (e.g., 1000000 -> "1M", 1000 -> "1K")
   */
  private formatNumber(num: number | undefined): string {
    if (!num) return 'N/A'
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
    return num.toString()
  }

  /**
   * Wrap text to fit within max width
   */
  private wrapText(text: string, maxWidth: number): string[] {
    if (text.length <= maxWidth) {
      return [text]
    }
    const lines: string[] = []
    let current = ''
    const words = text.split(' ')

    for (const word of words) {
      if ((current + ' ' + word).length > maxWidth) {
        if (current) lines.push(current)
        current = word
      } else {
        current = current ? current + ' ' + word : word
      }
    }
    if (current) lines.push(current)
    return lines
  }

  /**
   * Render a loading state for the info modal
   */
  renderPackageInfoLoading(
    state: PackageSelectionState,
    terminalWidth: number = 80,
    terminalHeight: number = 24
  ): string[] {
    const modalWidth = Math.min(terminalWidth - 6, 120)
    const padding = Math.floor((terminalWidth - modalWidth) / 2)
    const lines: string[] = []

    // Top padding to center vertically
    const topPadding = Math.max(1, Math.floor((terminalHeight - 10) / 2))
    for (let i = 0; i < topPadding; i++) {
      lines.push('')
    }

    // Modal border
    lines.push(' '.repeat(padding) + chalk.gray('╭' + '─'.repeat(modalWidth - 2) + '╮'))

    // Loading message
    const loadingMsg = '⏳ Loading package info...'
    const msgPadding = modalWidth - 4 - this.stripAnsi(loadingMsg).length
    lines.push(
      ' '.repeat(padding) +
        chalk.gray('│') +
        ' ' +
        chalk.cyan(loadingMsg) +
        ' '.repeat(Math.max(0, msgPadding)) +
        chalk.gray('│')
    )

    // Package name
    const nameMsg = `${state.name}`
    const namePadding = modalWidth - 4 - nameMsg.length
    lines.push(
      ' '.repeat(padding) +
        chalk.gray('│') +
        ' ' +
        chalk.white(nameMsg) +
        ' '.repeat(Math.max(0, namePadding)) +
        chalk.gray('│')
    )

    lines.push(' '.repeat(padding) + chalk.gray('╰' + '─'.repeat(modalWidth - 2) + '╯'))

    return lines
  }

  /**
   * Render a full-screen modal overlay showing package information
   * Similar to Turbo's help menu - centered with disabled background
   */
  renderPackageInfoModal(
    state: PackageSelectionState,
    terminalWidth: number = 80,
    terminalHeight: number = 24
  ): string[] {
    const modalWidth = Math.min(terminalWidth - 6, 120) // Leave margins
    const padding = Math.floor((terminalWidth - modalWidth) / 2)
    const lines: string[] = []

    // Top padding to center vertically
    const topPadding = Math.max(1, Math.floor((terminalHeight - 20) / 2))
    for (let i = 0; i < topPadding; i++) {
      lines.push('')
    }

    // Modal border and header
    lines.push(' '.repeat(padding) + chalk.gray('╭' + '─'.repeat(modalWidth - 2) + '╮'))

    // Title with package name
    const title = ` ℹ️  ${state.name}`
    const titleLength = this.stripAnsi(title).length
    const titlePadding = Math.max(0, modalWidth - 2 - titleLength)
    lines.push(
      ' '.repeat(padding) +
        chalk.gray('│') +
        chalk.cyan.bold(title) +
        ' '.repeat(titlePadding) +
        chalk.gray('│')
    )

    // License and author line
    const authorLicense = `${state.author || 'Unknown'} • ${state.license || 'MIT'}`
    const authorLength = authorLicense.length
    const authorPadding = Math.max(0, modalWidth - 3 - authorLength)
    lines.push(
      ' '.repeat(padding) +
        chalk.gray('│') +
        ' ' +
        chalk.gray(authorLicense) +
        ' '.repeat(authorPadding) +
        chalk.gray('│')
    )

    lines.push(' '.repeat(padding) + chalk.gray('├' + '─'.repeat(modalWidth - 2) + '┤'))

    // Current and target versions
    const currentVersion = chalk.yellow(state.currentVersionSpecifier)
    const targetVersion = chalk.green(
      state.selectedOption === 'range' ? state.rangeVersion : state.latestVersion
    )
    const versionText = `Current: ${currentVersion} → Target: ${targetVersion}`
    const versionLength = this.stripAnsi(versionText).length
    const versionPadding = Math.max(0, modalWidth - 3 - versionLength)
    lines.push(
      ' '.repeat(padding) +
        chalk.gray('│') +
        ' ' +
        versionText +
        ' '.repeat(versionPadding) +
        chalk.gray('│')
    )

    // Weekly downloads
    if (state.weeklyDownloads !== undefined) {
      const downloadsText = `📊 ${this.formatNumber(state.weeklyDownloads)} downloads/week`
      const downloadsLength = this.stripAnsi(downloadsText).length
      const downloadsPadding = Math.max(0, modalWidth - 3 - downloadsLength)
      lines.push(
        ' '.repeat(padding) +
          chalk.gray('│') +
          ' ' +
          chalk.blue(downloadsText) +
          ' '.repeat(downloadsPadding) +
          chalk.gray('│')
      )
    }

    // Description
    if (state.description) {
      lines.push(' '.repeat(padding) + chalk.gray('├' + '─'.repeat(modalWidth - 2) + '┤'))
      const descriptionLines = this.wrapText(state.description, modalWidth - 4)
      for (const descLine of descriptionLines) {
        const descLength = descLine.length
        const descPadding = Math.max(0, modalWidth - 3 - descLength)
        lines.push(
          ' '.repeat(padding) +
            chalk.gray('│') +
            ' ' +
            chalk.white(descLine) +
            ' '.repeat(descPadding) +
            chalk.gray('│')
        )
      }
    }

    // Changelog/Releases section (moved to middle)
    if (state.repository) {
      lines.push(' '.repeat(padding) + chalk.gray('├' + '─'.repeat(modalWidth - 2) + '┤'))
      const repoLabel = 'Changelog:'
      const repoUrl = state.repository.substring(0, modalWidth - 20)
      const repoText = `  ${repoLabel} ${chalk.blue.underline(repoUrl)}`
      const repoLength = this.stripAnsi(repoText).length
      const repoPadding = Math.max(0, modalWidth - 2 - repoLength)
      lines.push(
        ' '.repeat(padding) + chalk.gray('│') + repoText + ' '.repeat(repoPadding) + chalk.gray('│')
      )
    }

    // Links section
    if (state.homepage) {
      lines.push(' '.repeat(padding) + chalk.gray('├' + '─'.repeat(modalWidth - 2) + '┤'))

      const homeLabel = 'Homepage:'
      const homeUrl = state.homepage.substring(0, modalWidth - 20)
      const homeText = `  ${homeLabel} ${chalk.blue.underline(homeUrl)}`
      const homeLength = this.stripAnsi(homeText).length
      const homePadding = Math.max(0, modalWidth - 2 - homeLength)
      lines.push(
        ' '.repeat(padding) + chalk.gray('│') + homeText + ' '.repeat(homePadding) + chalk.gray('│')
      )
    }

    // Footer
    lines.push(' '.repeat(padding) + chalk.gray('╰' + '─'.repeat(modalWidth - 2) + '╯'))

    return lines
  }
}
