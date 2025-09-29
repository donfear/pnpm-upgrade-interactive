import chalk from 'chalk'
import { PackageDetector } from './package-detector'
import { InteractiveUI } from './interactive-ui'
import { PackageUpgrader } from './upgrader'
import { checkPnpmInstalled } from './utils'

export class PnpmUpgradeInteractive {
  private detector: PackageDetector
  private ui: InteractiveUI
  private upgrader: PackageUpgrader

  constructor(cwd?: string, excludePatterns?: string[]) {
    this.detector = new PackageDetector(cwd, excludePatterns)
    this.ui = new InteractiveUI()
    this.upgrader = new PackageUpgrader()
  }

  public async run(): Promise<void> {
    try {
      // Check prerequisites
      this.checkPrerequisites()

      // Detect packages
      const packages = await this.detector.getOutdatedPackages()

      // Display packages table
      await this.ui.displayPackagesTable(packages)

      const outdatedPackages = this.detector.getOutdatedPackagesOnly(packages)
      if (outdatedPackages.length === 0) {
        return
      }

      // Interactive selection and confirmation loop
      let selectedChoices: any[] = []
      let shouldProceed: boolean | null = false
      let previousSelections: Map<string, 'none' | 'range' | 'latest'> | undefined

      while (true) {
        // Interactive selection
        selectedChoices = await this.ui.selectPackagesToUpgrade(packages, previousSelections)

        if (selectedChoices.length === 0) {
          console.log(chalk.yellow('No packages selected. Exiting...'))
          return
        }

        // Store current selections for potential return to selection
        previousSelections = new Map()
        // Convert selectedChoices back to selection state format
        // Group by package name and version specifier
        const choiceMap = new Map<string, 'range' | 'latest'>()
        selectedChoices.forEach((choice) => {
          const key = `${choice.name}@${choice.currentVersionSpecifier}`
          choiceMap.set(key, choice.upgradeType as 'range' | 'latest')
        })
        // Convert to the format expected by selectPackagesToUpgrade
        choiceMap.forEach((upgradeType, key) => {
          previousSelections!.set(key, upgradeType)
        })

        // Confirm upgrade
        shouldProceed = await this.ui.confirmUpgrade(selectedChoices)

        if (shouldProceed === null) {
          // User pressed N or ESC - go back to selection with current selections preserved
          console.clear()
          console.log(chalk.bold.blue('🚀 pnpm-upgrade-interactive\n'))
          // previousSelections is already set from above
          continue
        }

        if (!shouldProceed) {
          console.log(chalk.yellow('Upgrade cancelled.'))
          return
        }

        // User confirmed - break out of loop and proceed
        break
      }

      // Perform upgrade
      await this.upgrader.upgradePackages(selectedChoices, packages)
    } catch (error) {
      console.error(chalk.red(`Error: ${error}`))
      process.exit(1)
    }
  }

  private checkPrerequisites(): void {
    // Check if pnpm is installed
    if (!checkPnpmInstalled()) {
      throw new Error('pnpm is not installed. Please install pnpm first: npm install -g pnpm')
    }

    // Check if package.json exists
    if (!this.detector.hasPackageJson()) {
      throw new Error('No package.json found in current directory')
    }
  }
}

export * from './types'
export * from './utils'
export * from './package-detector'
export * from './interactive-ui'
export * from './upgrader'
