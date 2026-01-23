import { execSync, exec } from 'child_process'
import { readFileSync, existsSync, readdirSync, statSync, realpathSync } from 'fs'
import { join, relative } from 'path'
import * as semver from 'semver'
import { promisify } from 'util'
import { PackageJson } from './types'

const execAsync = promisify(exec)

// Constants for npm registry queries
// Batch size balances command line argument limits with parallel fetch efficiency
const NPM_QUERY_BATCH_SIZE = 500

export function findPackageJson(cwd: string = process.cwd()): string | null {
  const packageJsonPath = join(cwd, 'package.json')
  return existsSync(packageJsonPath) ? packageJsonPath : null
}

export function findWorkspaceRoot(cwd: string = process.cwd()): string | null {
  let currentDir = cwd
  while (currentDir !== join(currentDir, '..')) {
    const workspaceFile = join(currentDir, 'pnpm-workspace.yaml')
    if (existsSync(workspaceFile)) {
      return currentDir
    }
    currentDir = join(currentDir, '..')
  }
  return null
}

export function readPackageJson(path: string): PackageJson {
  try {
    const content = readFileSync(path, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    throw new Error(`Failed to read package.json: ${error}`)
  }
}

export function executeCommand(command: string, cwd?: string): string {
  try {
    return execSync(command, {
      encoding: 'utf-8',
      stdio: 'pipe',
      cwd: cwd,
    })
  } catch (error) {
    throw new Error(`Command failed: ${command}\n${error}`)
  }
}

export async function executeCommandAsync(command: string): Promise<string> {
  try {
    const { stdout, stderr } = await execAsync(command, { encoding: 'utf-8' })
    if (stderr && !stdout) {
      throw new Error(stderr)
    }
    return stdout
  } catch (error) {
    throw new Error(`Command failed: ${command}\n${error}`)
  }
}

export function checkPnpmInstalled(): boolean {
  try {
    executeCommand('pnpm --version')
    return true
  } catch {
    return false
  }
}

/**
 * Checks if a version is outdated compared to the latest version.
 * Handles version prefixes (^, ~, >=, etc.) by coercing them to valid semver.
 * @param current - The current version specifier (e.g., "^1.0.0", "1.0.0")
 * @param latest - The latest version (e.g., "2.0.0")
 * @returns true if latest is greater than current, false otherwise or on error
 */
export function isVersionOutdated(current: string, latest: string): boolean {
  try {
    // Remove version prefixes like ^, ~, >=, etc.
    const cleanCurrent = semver.coerce(current)?.version || current
    const cleanLatest = semver.coerce(latest)?.version || latest

    return semver.gt(cleanLatest, cleanCurrent)
  } catch {
    return false
  }
}

export function findAllPackageJsonFiles(
  rootDir: string = process.cwd(),
  excludePatterns: string[] = [],
  maxDepth: number = 10,
  onProgress?: (current: string, found: number) => void
): string[] {
  const packageJsonFiles: string[] = []
  const visitedPaths = new Set<string>()
  let directoriesScanned = 0

  // Compile regex patterns for exclude filtering
  const excludeRegexes = excludePatterns.map((pattern) => new RegExp(pattern, 'i'))

  function shouldExcludePath(relativePath: string): boolean {
    return excludeRegexes.some((regex) => regex.test(relativePath))
  }

  function traverseDirectory(dir: string, depth: number = 0): void {
    // Prevent infinite recursion with depth limit
    if (depth > maxDepth) {
      return
    }

    try {
      // Prevent symlink cycles by tracking visited real paths
      const realPath = realpathSync(dir)
      if (visitedPaths.has(realPath)) {
        return
      }
      visitedPaths.add(realPath)

      directoriesScanned++

      // Report progress every 10 directories or on first scan
      if (onProgress && (directoriesScanned % 10 === 0 || directoriesScanned === 1)) {
        const relativePath = relative(rootDir, dir) || '.'
        onProgress(relativePath, packageJsonFiles.length)
      }

      const files = readdirSync(dir)

      for (const file of files) {
        const fullPath = join(dir, file)
        const relativePath = relative(rootDir, fullPath)

        // Skip if path matches exclude patterns
        if (shouldExcludePath(relativePath)) {
          continue
        }

        let stat
        try {
          stat = statSync(fullPath)
        } catch {
          // Skip files/dirs we can't stat (broken symlinks, permission issues)
          continue
        }

        // Skip common build and dependency directories
        const skipDirs = [
          'node_modules',
          '.git',
          'dist',
          'build',
          '.next',
          'coverage',
          '.cache',
          'out',
          '.output',
          '.nuxt',
          '.vercel',
          '.netlify',
          'lib',
          'es',
          'esm',
          'cjs',
        ]
        if (stat.isDirectory() && !file.startsWith('.') && !skipDirs.includes(file)) {
          traverseDirectory(fullPath, depth + 1)
        } else if (file === 'package.json' && stat.isFile()) {
          packageJsonFiles.push(fullPath)
        }
      }
    } catch (error) {
      // Skip directories that can't be read (permission issues, etc.)
    }
  }

  traverseDirectory(rootDir)
  return packageJsonFiles
}

export interface CollectDependenciesOptions {
  includePeerDeps?: boolean
  includeOptionalDeps?: boolean
}

/**
 * Collects all dependencies from multiple package.json files.
 * Always includes regular dependencies and devDependencies.
 * Optionally includes peer and optional dependencies based on flags.
 * @param packageJsonFiles - Array of paths to package.json files
 * @param options - Options to include peer and/or optional dependencies
 * @returns Array of dependency objects with name, version, type, and package.json path
 */
export function collectAllDependencies(
  packageJsonFiles: string[],
  options: CollectDependenciesOptions = {}
): Array<{ name: string; version: string; type: string; packageJsonPath: string }> {
  const { includePeerDeps = false, includeOptionalDeps = false } = options
  const allDeps: Array<{ name: string; version: string; type: string; packageJsonPath: string }> =
    []

  for (const packageJsonPath of packageJsonFiles) {
    try {
      const packageJson = readPackageJson(packageJsonPath)
      const depTypes: Array<
        'dependencies' | 'devDependencies' | 'optionalDependencies' | 'peerDependencies'
      > = ['dependencies', 'devDependencies']

      if (includeOptionalDeps) {
        depTypes.push('optionalDependencies')
      }
      if (includePeerDeps) {
        depTypes.push('peerDependencies')
      }

      for (const depType of depTypes) {
        const deps = packageJson[depType]
        if (deps && typeof deps === 'object') {
          for (const [name, version] of Object.entries(deps)) {
            allDeps.push({
              name,
              version: version as string,
              type: depType,
              packageJsonPath,
            })
          }
        }
      }
    } catch (error) {
      // Skip malformed package.json files
    }
  }

  return allDeps
}

/**
 * Fetches package version data from npm registry for multiple packages.
 * Processes packages in batches to optimize speed and resource usage.
 * Only returns valid semantic versions (X.Y.Z format, excluding pre-releases).
 * @param packageNames - Array of package names to fetch data for
 * @param onProgress - Optional callback for progress updates (currentPackage, completed, total)
 * @returns Map of package name to object containing latestVersion and allVersions
 */
export async function getAllPackageData(
  packageNames: string[],
  onProgress?: (currentPackage: string, completed: number, total: number) => void
): Promise<Map<string, { latestVersion: string; allVersions: string[] }>> {
  const packageData = new Map<string, { latestVersion: string; allVersions: string[] }>()

  if (packageNames.length === 0) {
    return packageData
  }

  const total = packageNames.length
  let completedCount = 0

  // Process in parallel batches to optimize speed vs resource usage
  const batches = []

  for (let i = 0; i < packageNames.length; i += NPM_QUERY_BATCH_SIZE) {
    batches.push(packageNames.slice(i, i + NPM_QUERY_BATCH_SIZE))
  }

  for (const batch of batches) {
    const fetchPromises = batch.map(async (packageName) => {
      try {
        // Get all versions for the package
        const command = `pnpm view ${packageName} versions --json | jq '[.[] | select(test("^[0-9]+\\\\.[0-9]+\\\\.[0-9]+$"))]'`
        const result = await executeCommandAsync(command)
        const allVersions = JSON.parse(result) as string[]

        // Sort versions to find the latest
        const sortedVersions = allVersions.sort(semver.rcompare)
        const latestVersion = sortedVersions.length > 0 ? sortedVersions[0] : 'unknown'

        const packageResult = {
          packageName,
          data: {
            latestVersion,
            allVersions,
          },
        }

        // Update progress immediately when this package completes
        packageData.set(packageName, packageResult.data)
        completedCount++

        if (onProgress) {
          onProgress(packageName, completedCount, total)
        } else {
          const percentage = Math.round((completedCount / total) * 100)
          showPackageProgress(`🔍 Analyzing packages... (${completedCount}/${total} - ${percentage}%)`)
        }

        return packageResult
      } catch (error) {
        // Fallback for failed packages
        const packageResult = {
          packageName,
          data: { latestVersion: 'unknown', allVersions: [] },
        }

        // Update progress even for failed packages
        packageData.set(packageName, packageResult.data)
        completedCount++

        if (onProgress) {
          onProgress(packageName, completedCount, total)
        } else {
          const percentage = Math.round((completedCount / total) * 100)
          showPackageProgress(`🔍 Analyzing packages... (${completedCount}/${total} - ${percentage}%)`)
        }

        return packageResult
      }
    })

    // Wait for all promises in this batch to complete
    await Promise.all(fetchPromises)
  }

  // Clear the progress line if no custom progress handler
  if (!onProgress) {
    process.stdout.write('\r' + ' '.repeat(80) + '\r')
  }

  return packageData
}

function showPackageProgress(message: string): void {
  // Clear current line and show new message
  process.stdout.write(`\r${' '.repeat(80)}\r${message}`)
}
export function getOptimizedRangeVersion(
  packageName: string,
  currentRange: string,
  allVersions: string[],
  latestVersion: string
): string {
  try {
    // Find the highest version that satisfies the current range
    const satisfyingVersions = allVersions.filter((version: string) => {
      try {
        return semver.satisfies(version, currentRange)
      } catch {
        return false
      }
    })

    if (satisfyingVersions.length === 0) {
      return latestVersion
    }

    // Return the highest satisfying version
    return satisfyingVersions.sort(semver.rcompare)[0]
  } catch {
    return latestVersion
  }
}

export function findClosestMinorVersion(
  installedVersion: string,
  allVersions: string[]
): string | null {
  try {
    const coercedInstalled = semver.coerce(installedVersion)
    if (!coercedInstalled) {
      return null
    }

    const installedMajor = semver.major(coercedInstalled)
    const installedMinor = semver.minor(coercedInstalled)
    let bestMinorVersion: string | null = null
    let bestMinorValue = -1

    // Single pass to find best minor version in same major
    for (const version of allVersions) {
      try {
        const major = semver.major(version)
        const minor = semver.minor(version)
        if (major === installedMajor && minor > installedMinor && minor > bestMinorValue) {
          bestMinorValue = minor
          bestMinorVersion = version
        }
      } catch {
        // Skip invalid versions
      }
    }

    if (bestMinorVersion) {
      return bestMinorVersion
    }

    // Fallback: find highest patch that satisfies current range
    let bestVersion: string | null = null
    for (const version of allVersions) {
      try {
        if (semver.satisfies(version, installedVersion) && semver.gt(version, coercedInstalled)) {
          if (!bestVersion || semver.gt(version, bestVersion)) {
            bestVersion = version
          }
        }
      } catch {
        // Skip invalid versions
      }
    }

    return bestVersion
  } catch {
    return null
  }
}
