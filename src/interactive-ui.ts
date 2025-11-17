import inquirer from 'inquirer'
import chalk from 'chalk'
import * as semver from 'semver'
const keypress = require('keypress')
import { PackageInfo, PackageUpgradeChoice, PackageSelectionState } from './types'
import { Key } from 'node:readline'
import {
  StateManager,
  UIRenderer,
  InputHandler,
  ConfirmationInputHandler,
  InputAction,
  VersionUtils,
} from './ui'

export class InteractiveUI {
  private renderer: UIRenderer

  constructor() {
    this.renderer = new UIRenderer()
  }

  public async displayPackagesTable(packages: PackageInfo[]): Promise<void> {
    console.log(this.renderer.renderPackagesTable(packages))
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
        const targetVersionWithPrefix = VersionUtils.applyVersionPrefix(
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

  private getTerminalHeight(): number {
    // Check if stdout is a TTY and has rows property
    if (process.stdout.isTTY && typeof process.stdout.rows === 'number' && process.stdout.rows > 0) {
      return process.stdout.rows
    }
    return 24 // Fallback default
  }

  private async interactiveTableSelector(
    selectionStates: PackageSelectionState[]
  ): Promise<PackageSelectionState[]> {
    return new Promise((resolve) => {
      const states = [...selectionStates]
      const stateManager = new StateManager(0, this.getTerminalHeight())

      const handleAction = (action: InputAction) => {
        switch (action.type) {
          case 'navigate_up':
            stateManager.navigateUp(states.length)
            break
          case 'navigate_down':
            stateManager.navigateDown(states.length)
            break
          case 'select_left':
            stateManager.updateSelection(states, 'left')
            break
          case 'select_right':
            stateManager.updateSelection(states, 'right')
            break
          case 'bulk_select_minor':
            stateManager.bulkSelectMinor(states)
            break
          case 'bulk_select_latest':
            stateManager.bulkSelectLatest(states)
            break
          case 'bulk_unselect_all':
            stateManager.bulkUnselectAll(states)
            break
          case 'resize':
            const heightChanged = stateManager.updateTerminalHeight(action.height)
            if (heightChanged) {
              stateManager.resetForResize()
            } else {
              // Even if height didn't change, width might have changed
              // Force a full re-render to clear any wrapping issues
              stateManager.setInitialRender(true)
            }
            break
        }
        renderInterface()
      }

      const handleConfirm = (selectedStates: PackageSelectionState[]) => {
        resolve(selectedStates)
      }

      const handleCancel = () => {
        resolve(states.map((s) => ({ ...s, selectedOption: 'none' })))
      }

      const inputHandler = new InputHandler(stateManager, handleAction, handleConfirm, handleCancel)

      const renderInterface = () => {
        const uiState = stateManager.getUIState()

        if (uiState.isInitialRender) {
          console.clear()
        } else {
          // Move cursor to top and rewrite everything to minimize flicker
          process.stdout.write('\x1b[H')
        }

        const lines = this.renderer.renderInterface(
          states,
          uiState.currentRow,
          uiState.scrollOffset,
          uiState.maxVisibleItems,
          uiState.isInitialRender
        )

        // Print all lines
        lines.forEach((line) => console.log(line))

        // Clear any remaining lines from previous render
        if (!uiState.isInitialRender) {
          process.stdout.write('\x1b[J')
        }

        stateManager.markRendered(lines)
        stateManager.setInitialRender(false)
      }

      const handleResize = () => {
        // On resize (width or height change), always trigger a re-render
        // This prevents layout breaking when terminal width changes
        // The action handler will update height and force a full re-render
        inputHandler.handleResize(this.getTerminalHeight())
      }

      // Setup keypress handling
      try {
        keypress(process.stdin)
        if (process.stdin.setRawMode) {
          process.stdin.setRawMode(true)
        }
        process.stdin.resume()
        process.stdin.on('keypress', (str, key) => inputHandler.handleKeypress(str, key, states))

        // Setup resize handler
        process.on('SIGWINCH', handleResize)

        // Update terminal height directly before initial render to ensure correct dimensions
        // This handles cases where process.stdout.rows might not be accurate at startup
        const currentHeight = this.getTerminalHeight()
        if (stateManager.updateTerminalHeight(currentHeight)) {
          stateManager.resetForResize()
        }

        // Initial render
        renderInterface()
      } catch (error) {
        // Fallback to simple interface if raw mode fails
        console.log(chalk.yellow('Raw mode not available, using fallback interface...'))
        resolve(states)
      }
    })
  }

  public async confirmUpgrade(choices: PackageUpgradeChoice[]): Promise<boolean | null> {
    console.log(this.renderer.renderConfirmation(choices))

    return new Promise((resolve) => {
      const handleConfirm = (confirmed: boolean | null) => {
        resolve(confirmed)
      }

      const inputHandler = new ConfirmationInputHandler(handleConfirm)

      // Setup keypress handling
      try {
        keypress(process.stdin)
        if (process.stdin.setRawMode) {
          process.stdin.setRawMode(true)
        }
        process.stdin.resume()
        process.stdin.on('keypress', (str, key) => inputHandler.handleKeypress(str, key))
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
}
