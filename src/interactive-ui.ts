import inquirer from 'inquirer'
import chalk from 'chalk'
import * as semver from 'semver'
const keypress = require('keypress')
import { PackageInfo, PackageUpgradeChoice, PackageSelectionState } from './types'
import { Key } from 'node:readline'

export class InteractiveUI {
  private applyVersionPrefix(originalSpecifier: string, targetVersion: string): string {
    // Extract prefix from original specifier (^ or ~)
    const prefixMatch = originalSpecifier.match(/^([^\d]+)/)
    const prefix = prefixMatch ? prefixMatch[1] : ''

    // Return target version with same prefix
    return prefix + targetVersion
  }

  private getVisualLength(str: string): number {
    // Strip ANSI escape codes to get visual length
    return str.replace(/\u001b\[[0-9;]*m/g, '').length
  }

  private formatVersionDiff(
    current: string,
    target: string,
    colorFn: (text: string) => string
  ): string {
    if (current === target) {
      return chalk.white(target)
    }

    // Parse semantic versions into parts
    const currentParts = current.split('.').map((part) => parseInt(part) || 0)
    const targetParts = target.split('.').map((part) => parseInt(part) || 0)

    // Find the first differing version segment (major, minor, or patch)
    let firstDiffSegment = -1
    const maxLength = Math.max(currentParts.length, targetParts.length)

    for (let i = 0; i < maxLength; i++) {
      const currentPart = currentParts[i] || 0
      const targetPart = targetParts[i] || 0

      if (currentPart !== targetPart) {
        firstDiffSegment = i
        break
      }
    }

    if (firstDiffSegment === -1) {
      // Versions are identical (shouldn't happen due to guard above, but just in case)
      return chalk.white(target)
    }

    // Build the result with proper coloring
    const result: string[] = []

    for (let i = 0; i < maxLength; i++) {
      const targetPart = targetParts[i] || 0
      const partStr = targetPart.toString()

      if (i < firstDiffSegment) {
        // Unchanged segment - keep white
        result.push(partStr)
      } else {
        // Changed segment or later - apply color
        result.push(colorFn(partStr))
      }

      // Add dot separator if not the last part
      if (i < maxLength - 1) {
        // Color the dot the same as the following part
        const nextPartColor = i + 1 < firstDiffSegment ? chalk.white : colorFn
        result.push(nextPartColor('.'))
      }
    }

    return result.join('')
  }

  public async displayPackagesTable(packages: PackageInfo[]): Promise<void> {
    if (packages.length === 0) {
      console.log(chalk.green('✅ All packages are up to date!'))
      return
    }

    const outdatedPackages = packages.filter((p) => p.isOutdated)

    if (outdatedPackages.length === 0) {
      console.log(chalk.green('✅ All packages are up to date!'))
      return
    }

    // Just show a simple message, the interactive interface will handle the display
    console.log(chalk.bold.blue('🚀 pnpm-upgrade-interactive\n'))
  }

  public async selectPackagesToUpgrade(
    packages: PackageInfo[],
    previousSelections?: Map<string, 'none' | 'range' | 'latest'>
  ): Promise<PackageUpgradeChoice[]> {
    const outdatedPackages = packages.filter((p) => p.isOutdated)

    if (outdatedPackages.length === 0) {
      return []
    }

    // Deduplicate packages by name and version specifier, but track all package.json paths
    const uniquePackages = new Map<
      string,
      {
        pkg: PackageInfo
        packageJsonPaths: Set<string>
      }
    >()

    for (const pkg of outdatedPackages) {
      const key = `${pkg.name}@${pkg.currentVersion}`
      if (!uniquePackages.has(key)) {
        uniquePackages.set(key, {
          pkg,
          packageJsonPaths: new Set([pkg.packageJsonPath]),
        })
      } else {
        uniquePackages.get(key)!.packageJsonPaths.add(pkg.packageJsonPath)
      }
    }

    // Convert to array and sort alphabetically by name (@scoped packages first, then unscoped)
    const deduplicatedPackages = Array.from(uniquePackages.values()).map(
      ({ pkg, packageJsonPaths }) => ({
        ...pkg,
        packageJsonPaths: Array.from(packageJsonPaths),
      })
    )

    deduplicatedPackages.sort((a, b) => {
      const aIsScoped = a.name.startsWith('@')
      const bIsScoped = b.name.startsWith('@')

      // If one is scoped and the other isn't, scoped comes first
      if (aIsScoped && !bIsScoped) return -1
      if (!aIsScoped && bIsScoped) return 1

      // Both scoped or both unscoped - sort alphabetically
      return a.name.localeCompare(b.name)
    })

    // Create selection states for each unique package
    const selectionStates: PackageSelectionState[] = deduplicatedPackages.map((pkg) => {
      const currentClean = semver.coerce(pkg.currentVersion)?.version || pkg.currentVersion
      const rangeClean = semver.coerce(pkg.rangeVersion)?.version || pkg.rangeVersion
      const latestClean = semver.coerce(pkg.latestVersion)?.version || pkg.latestVersion

      // Use previous selection if available, otherwise default to 'none'
      const key = `${pkg.name}@${pkg.currentVersion}`
      const previousSelection = previousSelections?.get(key) || 'none'

      return {
        name: pkg.name,
        packageJsonPath: pkg.packageJsonPaths[0], // Use first path for display
        packageJsonPaths: pkg.packageJsonPaths, // Store all paths for upgrading
        currentVersionSpecifier: pkg.currentVersion, // Keep original with prefix
        currentVersion: currentClean,
        rangeVersion: rangeClean,
        latestVersion: latestClean,
        selectedOption: previousSelection,
        hasRangeUpdate: pkg.hasRangeUpdate,
        hasMajorUpdate: pkg.hasMajorUpdate,
      }
    })

    // Use custom interactive table selector
    const selectedStates = await this.interactiveTableSelector(selectionStates)

    // Convert to PackageUpgradeChoice[] - create one choice per package.json path
    const choices: PackageUpgradeChoice[] = []
    selectedStates
      .filter((state) => state.selectedOption !== 'none')
      .forEach((state) => {
        const targetVersion =
          state.selectedOption === 'range' ? state.rangeVersion : state.latestVersion
        const targetVersionWithPrefix = this.applyVersionPrefix(
          state.currentVersionSpecifier,
          targetVersion
        )

        // Create a choice for each package.json path where this package appears
        const pathsToUpdate = state.packageJsonPaths || [state.packageJsonPath]
        pathsToUpdate.forEach((packageJsonPath) => {
          choices.push({
            name: state.name,
            packageJsonPath,
            upgradeType: state.selectedOption,
            targetVersion: targetVersionWithPrefix,
            currentVersionSpecifier: state.currentVersionSpecifier,
          })
        })
      })

    return choices
  }

  private async interactiveTableSelector(
    selectionStates: PackageSelectionState[]
  ): Promise<PackageSelectionState[]> {
    return new Promise((resolve) => {
      let currentRow = 0
      let previousRow = -1
      const states = [...selectionStates]

      // States are already initialized with previous selections, don't reset them

      // Scrolling/pagination state
      let terminalHeight = process.stdout.rows || 24
      const headerLines = 4 // question + instructions + empty line + status line
      let maxVisibleItems = Math.max(5, terminalHeight - headerLines - 2) // Reserve space for footer
      let scrollOffset = 0 // Index of first visible item
      let previousScrollOffset = 0 // Track previous scroll offset to detect changes

      // Store rendered lines for incremental updates
      let renderedLines: string[] = []
      let isInitialRender = true

      const renderPackageLine = (state: PackageSelectionState, index: number): string => {
        const isCurrentRow = index === currentRow
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
          const rangeVersionWithPrefix = this.applyVersionPrefix(
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
          const latestVersionWithPrefix = this.applyVersionPrefix(
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
        const currentSectionLength = this.getVisualLength(currentSection) + 1 // +1 for space before dashes
        const currentPadding = Math.max(0, currentColumnWidth - currentSectionLength)
        const currentWithPadding = currentSection + ' ' + dashColor('-').repeat(currentPadding)

        // Range version section with fixed width
        let rangeSection = ''
        if (state.hasRangeUpdate) {
          rangeSection = `${rangeDot} ${rangeVersionText}`
          const rangeSectionLength = this.getVisualLength(rangeSection) + 1 // +1 for space before dashes
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
          const latestSectionLength = this.getVisualLength(latestSection) + 1 // +1 for space before dashes
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

      // Helper function to ensure current row is visible
      const ensureVisible = (rowIndex: number) => {
        if (rowIndex < scrollOffset) {
          scrollOffset = rowIndex
        } else if (rowIndex >= scrollOffset + maxVisibleItems) {
          scrollOffset = rowIndex - maxVisibleItems + 1
        }
        // Ensure scrollOffset doesn't go negative or beyond bounds
        scrollOffset = Math.max(
          0,
          Math.min(scrollOffset, Math.max(0, states.length - maxVisibleItems))
        )
      }

      const renderInterface = () => {
        if (isInitialRender) {
          // Initial full render
          console.clear()
          console.log('  ' + chalk.bold.magenta('🚀 pnpm-upgrade-interactive'))
          console.log('')
          console.log(
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
          console.log('  ' + statusLine)
          console.log('')

          // Render only visible packages
          renderedLines = []
          for (
            let i = scrollOffset;
            i < Math.min(scrollOffset + maxVisibleItems, states.length);
            i++
          ) {
            const line = renderPackageLine(states[i], i)
            renderedLines.push(line)
            console.log(line)
          }
          isInitialRender = false
        } else {
          // Move cursor to top and rewrite everything to minimize flicker
          process.stdout.write('\x1b[H') // Move cursor to home position (1,1)

          console.log('  ' + chalk.bold.magenta('🚀 pnpm-upgrade-interactive'))
          console.log('')
          console.log(
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
          console.log('  ' + statusLine)
          console.log('')

          // Render only visible packages
          renderedLines = []
          for (
            let i = scrollOffset;
            i < Math.min(scrollOffset + maxVisibleItems, states.length);
            i++
          ) {
            const line = renderPackageLine(states[i], i)
            renderedLines.push(line)
            console.log(line)
          }

          // Clear any remaining lines from previous render
          process.stdout.write('\x1b[J')
        }

        previousRow = currentRow
        previousScrollOffset = scrollOffset
      }

      const handleKeypress = (str: string, key: Key) => {
        if (key.ctrl && key.name === 'c') {
          process.exit(0)
        }

        switch (key.name) {
          case 'up':
            previousRow = currentRow
            currentRow = currentRow - 1
            if (currentRow < 0) {
              currentRow = states.length - 1 // Wrap around to last item
            }
            ensureVisible(currentRow)
            renderInterface()
            break

          case 'down':
            previousRow = currentRow
            currentRow = currentRow + 1
            if (currentRow >= states.length) {
              currentRow = 0 // Wrap around to first item
            }
            ensureVisible(currentRow)
            renderInterface()
            break

          case 'left':
            // Move selection left with wraparound: latest -> range -> none -> latest
            const currentState = states[currentRow]
            if (currentState.selectedOption === 'latest') {
              if (currentState.hasRangeUpdate) {
                currentState.selectedOption = 'range'
              } else {
                currentState.selectedOption = 'none'
              }
            } else if (currentState.selectedOption === 'range') {
              currentState.selectedOption = 'none'
            } else if (currentState.selectedOption === 'none') {
              // Wrap around to the last available option
              if (currentState.hasMajorUpdate) {
                currentState.selectedOption = 'latest'
              } else if (currentState.hasRangeUpdate) {
                currentState.selectedOption = 'range'
              }
            }
            renderInterface()
            break

          case 'right':
            // Move selection right with wraparound: none -> range -> latest -> none
            const currentStateRight = states[currentRow]
            if (currentStateRight.selectedOption === 'none') {
              if (currentStateRight.hasRangeUpdate) {
                currentStateRight.selectedOption = 'range'
              } else if (currentStateRight.hasMajorUpdate) {
                currentStateRight.selectedOption = 'latest'
              }
            } else if (currentStateRight.selectedOption === 'range') {
              if (currentStateRight.hasMajorUpdate) {
                currentStateRight.selectedOption = 'latest'
              } else {
                // Wrap around to none
                currentStateRight.selectedOption = 'none'
              }
            } else if (currentStateRight.selectedOption === 'latest') {
              // Wrap around to none
              currentStateRight.selectedOption = 'none'
            }
            renderInterface()
            break

          case 'return':
            // Check if any packages are selected
            const selectedCount = states.filter((s) => s.selectedOption !== 'none').length
            if (selectedCount === 0) {
              // Show warning and stay in selection mode
              console.log(
                '\n' +
                  chalk.yellow(
                    '⚠️  No packages selected. Press ↑/↓ to navigate and ←/→ to select versions, or ESC to exit.'
                  )
              )
              setTimeout(() => renderInterface(), 2000) // Re-render after 2 seconds
              return
            }

            // Clean up and resolve
            if (process.stdin.setRawMode) {
              process.stdin.setRawMode(false)
            }
            process.stdin.removeListener('keypress', handleKeypress)
            process.removeListener('SIGWINCH', handleResize)
            process.stdin.pause()
            resolve(states)
            return

          case 'm':
          case 'M':
            // Select all packages with minor updates
            states.forEach((state) => {
              if (state.hasRangeUpdate) {
                state.selectedOption = 'range'
              }
            })
            renderInterface()
            break

          case 'l':
          case 'L':
            // Select all packages with updates (latest if available, otherwise minor)
            states.forEach((state) => {
              if (state.hasMajorUpdate) {
                state.selectedOption = 'latest'
              } else if (state.hasRangeUpdate) {
                state.selectedOption = 'range'
              }
            })
            renderInterface()
            break

          case 'u':
          case 'U':
            // Unselect all packages
            states.forEach((state) => {
              state.selectedOption = 'none'
            })
            renderInterface()
            break

          case 'escape':
            // Cancel - return empty results
            if (process.stdin.setRawMode) {
              process.stdin.setRawMode(false)
            }
            process.stdin.removeListener('keypress', handleKeypress)
            process.removeListener('SIGWINCH', handleResize)
            process.stdin.pause()
            resolve(states.map((s) => ({ ...s, selectedOption: 'none' })))
            return
        }
      }

      // Handle window resize
      const handleResize = () => {
        const newTerminalHeight = process.stdout.rows || 24
        const newMaxVisibleItems = Math.max(5, newTerminalHeight - headerLines - 2)

        // Only update if dimensions actually changed
        if (newTerminalHeight !== terminalHeight || newMaxVisibleItems !== maxVisibleItems) {
          terminalHeight = newTerminalHeight
          maxVisibleItems = newMaxVisibleItems

          // Adjust scroll offset to keep current selection visible
          ensureVisible(currentRow)

          // Force full clear and rerender after resize to avoid layout issues
          isInitialRender = true

          // Re-render the interface
          renderInterface()
        }
      }

      // Setup keypress handling
      try {
        keypress(process.stdin)
        if (process.stdin.setRawMode) {
          process.stdin.setRawMode(true)
        }
        process.stdin.resume()
        process.stdin.on('keypress', handleKeypress)

        // Setup resize handler
        process.on('SIGWINCH', handleResize)

        // Initial render
        renderInterface()
      } catch (error) {
        // Fallback to simple interface if raw mode fails
        console.log(chalk.yellow('Raw mode not available, using fallback interface...'))
        resolve(states)
      }
    })
  }

  private getVersionUpdateType(current: string, target: string): string {
    try {
      const diff = semver.diff(current, target)
      return diff || 'patch'
    } catch {
      return 'unknown'
    }
  }

  public async confirmUpgrade(choices: PackageUpgradeChoice[]): Promise<boolean | null> {
    if (choices.length === 0) {
      console.log(chalk.yellow('No packages selected for upgrade.'))
      return false
    }

    // Group choices by package name to show unique packages
    const packagesByName = new Map<string, PackageUpgradeChoice[]>()
    choices.forEach((choice) => {
      if (!packagesByName.has(choice.name)) {
        packagesByName.set(choice.name, [])
      }
      packagesByName.get(choice.name)!.push(choice)
    })

    console.log(chalk.bold(`\n🚀 Ready to upgrade ${packagesByName.size} package(s):`))
    packagesByName.forEach((packageChoices, packageName) => {
      // Use the first choice for display (they should all have the same target version for the same package)
      const choice = packageChoices[0]
      const upgradeTypeColor = choice.upgradeType === 'range' ? chalk.yellow : chalk.red
      const instancesText =
        packageChoices.length > 1 ? chalk.gray(` (${packageChoices.length} instances)`) : ''
      console.log(
        `  • ${chalk.cyan(packageName)} → ${upgradeTypeColor(choice.targetVersion)} ${chalk.gray(`(${choice.upgradeType})`)}${instancesText}`
      )
    })

    console.log(chalk.gray('Press Enter/Y to proceed, N to go back to selection, ESC to cancel'))

    return new Promise((resolve) => {
      const handleKeypress = (str: string, key: Key) => {
        if (key.ctrl && key.name === 'c') {
          process.exit(0)
        }

        switch (key.name) {
          case 'y':
          case 'return':
            // Clean up
            if (process.stdin.setRawMode) {
              process.stdin.setRawMode(false)
            }
            process.stdin.removeListener('keypress', handleKeypress)
            process.stdin.pause()
            resolve(true)
            break

          case 'n':
            // Go back to selection
            if (process.stdin.setRawMode) {
              process.stdin.setRawMode(false)
            }
            process.stdin.removeListener('keypress', handleKeypress)
            process.stdin.pause()
            resolve(null) // Go back to selection
            break

          case 'escape':
            // Cancel upgrade
            if (process.stdin.setRawMode) {
              process.stdin.setRawMode(false)
            }
            process.stdin.removeListener('keypress', handleKeypress)
            process.stdin.pause()
            resolve(false) // Cancel
            break
        }
      }

      // Setup keypress handling
      try {
        keypress(process.stdin)
        if (process.stdin.setRawMode) {
          process.stdin.setRawMode(true)
        }
        process.stdin.resume()
        process.stdin.on('keypress', handleKeypress)
      } catch (error) {
        // Fallback to inquirer
        inquirer
          .prompt([
            {
              type: 'confirm',
              name: 'proceed',
              message: 'Proceed with upgrade?',
              default: true,
            },
          ])
          .then((answer) => resolve(answer.proceed))
          .catch(() => resolve(false))
      }
    })
  }

  private getUpdateTypeColor(type: string): (text: string) => string {
    switch (type) {
      case 'major':
        return chalk.red
      case 'minor':
        return chalk.yellow
      case 'patch':
        return chalk.green
      case 'prerelease':
        return chalk.magenta
      default:
        return chalk.gray
    }
  }

  private getDependencyTypeColor(type: string): (text: string) => string {
    switch (type) {
      case 'dependencies':
        return chalk.blue
      case 'devDependencies':
        return chalk.cyan
      case 'peerDependencies':
        return chalk.magenta
      case 'optionalDependencies':
        return chalk.gray
      default:
        return chalk.white
    }
  }
}
