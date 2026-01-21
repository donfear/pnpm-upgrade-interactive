import * as semver from 'semver'
import { PackageInfo, PackageJson, PnpmUpgradeOptions } from './types'
import {
  findPackageJson,
  readPackageJson,
  findAllPackageJsonFiles,
  collectAllDependencies,
  getAllPackageData,
  getOptimizedRangeVersion,
  findClosestMinorVersion,
  isVersionOutdated,
  findWorkspaceRoot,
} from './utils'

export class PackageDetector {
  private packageJsonPath: string | null = null
  private packageJson: PackageJson | null = null
  private cwd: string
  private excludePatterns: string[]
  private includePeerDeps: boolean
  private includeOptionalDeps: boolean

  constructor(options?: PnpmUpgradeOptions) {
    this.cwd = options?.cwd || process.cwd()
    this.excludePatterns = options?.excludePatterns || []
    // Explicitly check for true to ensure false/undefined both become false (opt-in)
    this.includePeerDeps = options?.includePeerDeps === true
    this.includeOptionalDeps = options?.includeOptionalDeps === true
    this.packageJsonPath = findPackageJson(this.cwd)
    if (this.packageJsonPath) {
      this.packageJson = readPackageJson(this.packageJsonPath)
    }
  }

  public hasPackageJson(): boolean {
    return this.packageJsonPath !== null && this.packageJson !== null
  }

  public async getOutdatedPackages(): Promise<PackageInfo[]> {
    if (!this.packageJson) {
      throw new Error('No package.json found in current directory')
    }

    const packages: PackageInfo[] = []

    // Always check all package.json files recursively
    this.showProgress('🔍 Analyzing repo to find all package.json files...')
    const allPackageJsonFiles = findAllPackageJsonFiles(this.cwd, this.excludePatterns)
    this.showProgress(`📦 Found ${allPackageJsonFiles.length} package.json files`)

    // Step 2: Collect all dependencies from package.json files
    this.showProgress('📋 Collecting all dependencies...')
    const allDepsRaw = collectAllDependencies(allPackageJsonFiles, {
      includePeerDeps: this.includePeerDeps,
      includeOptionalDeps: this.includeOptionalDeps,
    })

    // Step 3: Get unique package names while filtering out workspace references
    this.showProgress('📦 Getting unique package names...')
    const uniquePackageNames = new Set<string>()
    const allDeps: typeof allDepsRaw = []
    for (const dep of allDepsRaw) {
      if (!this.isWorkspaceReference(dep.version)) {
        allDeps.push(dep)
        uniquePackageNames.add(dep.name)
      }
    }
    const packageNames = Array.from(uniquePackageNames)

    // Step 4: Fetch all package data in one call per package
    this.showProgress('🔍 Fetching version data for all packages...')
    const allPackageData = await getAllPackageData(packageNames)
    // Step 5: Process all dependencies with batched data
    this.showProgress('🔍 Analyzing package versions...')

    let processedCount = 0
    const updateProgress = () => {
      processedCount++
      if (processedCount % 10 === 0 || processedCount === allDeps.length) {
        this.showProgress(`🔍 Analyzing versions... (${processedCount}/${allDeps.length})`)
      }
    }

    try {
      for (const dep of allDeps) {
        try {
          const packageData = allPackageData.get(dep.name)
          if (!packageData) continue

          const { latestVersion, allVersions } = packageData

          // Find closest minor version (same major, higher minor) that satisfies the current range
          // Falls back to patch updates if no minor updates are available
          const closestMinorVersion = findClosestMinorVersion(dep.version, allVersions)

          const installedClean = semver.coerce(dep.version)?.version || dep.version
          const minorClean = closestMinorVersion
            ? semver.coerce(closestMinorVersion)?.version || closestMinorVersion
            : null
          const latestClean = semver.coerce(latestVersion)?.version || latestVersion

          const hasRangeUpdate = minorClean !== null && minorClean !== installedClean
          const hasMajorUpdate = semver.major(latestClean) > semver.major(installedClean)
          const isOutdated = hasRangeUpdate || hasMajorUpdate

          packages.push({
            name: dep.name,
            currentVersion: dep.version, // Keep original version specifier with prefix
            rangeVersion: closestMinorVersion || dep.version,
            latestVersion,
            type: dep.type as 'dependencies' | 'devDependencies' | 'optionalDependencies' | 'peerDependencies',
            packageJsonPath: dep.packageJsonPath,
            isOutdated,
            hasRangeUpdate,
            hasMajorUpdate,
          })
        } catch (error) {
          // Skip packages that can't be checked (private packages, etc.)
          packages.push({
            name: dep.name,
            currentVersion: dep.version,
            rangeVersion: 'unknown',
            latestVersion: 'unknown',
            type: dep.type as 'dependencies' | 'devDependencies' | 'optionalDependencies' | 'peerDependencies',
            packageJsonPath: dep.packageJsonPath,
            isOutdated: false,
            hasRangeUpdate: false,
            hasMajorUpdate: false,
          })
        }
        updateProgress()
      }

      const outdatedCount = packages.filter((p) => p.isOutdated).length
      this.showProgress(
        `✅ Found ${outdatedCount} outdated packages across ${allPackageJsonFiles.length} package.json files`
      )
      return packages
    } catch (error) {
      this.showProgress('❌ Failed to check packages')
      throw error
    }
  }

  private isWorkspaceReference(version: string): boolean {
    // Check for common workspace reference patterns
    return (
      version.includes('workspace:') ||
      version === '*' ||
      version.startsWith('file:') ||
      version.startsWith('link:') ||
      version.startsWith('git+') ||
      version.startsWith('github:') ||
      version.startsWith('gitlab:') ||
      version.startsWith('bitbucket:')
    )
  }

  private showProgress(message: string): void {
    // Clear current line and show new message
    process.stdout.write(`\r${' '.repeat(80)}\r${message}`)
  }

  public getOutdatedPackagesOnly(packages: PackageInfo[]): PackageInfo[] {
    return packages.filter((pkg) => pkg.isOutdated)
  }
}
