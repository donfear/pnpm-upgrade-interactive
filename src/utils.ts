import { execSync, exec } from 'child_process'
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import * as semver from 'semver'
import { promisify } from 'util'
import { PackageJson } from './types'

const execAsync = promisify(exec)

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

export function formatVersionDiff(
  current: string,
  latest: string
): { current: string; latest: string; type: string } {
  try {
    const cleanCurrent = semver.coerce(current)?.version || current
    const cleanLatest = semver.coerce(latest)?.version || latest

    if (!semver.valid(cleanCurrent) || !semver.valid(cleanLatest)) {
      return { current, latest, type: 'unknown' }
    }

    const diff = semver.diff(cleanCurrent, cleanLatest)
    return {
      current: cleanCurrent,
      latest: cleanLatest,
      type: diff || 'none',
    }
  } catch {
    return { current, latest, type: 'unknown' }
  }
}

export function findAllPackageJsonFiles(
  rootDir: string = process.cwd(),
  excludePatterns: string[] = []
): string[] {
  const packageJsonFiles: string[] = []

  // Compile regex patterns for exclude filtering
  const excludeRegexes = excludePatterns.map((pattern) => new RegExp(pattern, 'i'))

  function shouldExcludePath(relativePath: string): boolean {
    return excludeRegexes.some((regex) => regex.test(relativePath))
  }

  function traverseDirectory(dir: string): void {
    try {
      const files = readdirSync(dir)

      for (const file of files) {
        const fullPath = join(dir, file)
        const relativePath = relative(rootDir, fullPath)
        const stat = statSync(fullPath)

        // Skip if path matches exclude patterns
        if (shouldExcludePath(relativePath)) {
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
          traverseDirectory(fullPath)
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

export function collectAllDependencies(
  packageJsonFiles: string[]
): Array<{ name: string; version: string; type: string; packageJsonPath: string }> {
  const allDeps: Array<{ name: string; version: string; type: string; packageJsonPath: string }> =
    []

  for (const packageJsonPath of packageJsonFiles) {
    try {
      const packageJson = readPackageJson(packageJsonPath)
      const depTypes = ['dependencies', 'devDependencies', 'optionalDependencies'] as const

      for (const depType of depTypes) {
        const deps = packageJson[depType]
        if (deps && typeof deps === 'object') {
          for (const [name, version] of Object.entries(deps)) {
            allDeps.push({
              name,
              version,
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

export async function getAllPackageData(
  packageNames: string[]
): Promise<Map<string, { latestVersion: string; allVersions: string[] }>> {
  const packageData = new Map<string, { latestVersion: string; allVersions: string[] }>()

  if (packageNames.length === 0) {
    return packageData
  }

  const total = packageNames.length
  let completedCount = 0

  // Create an array of promises to fetch data for each package
  const fetchPromises = packageNames.map(async (packageName) => {
    try {
      // Get all versions for the package
      const command = `pnpm view ${packageName} versions --json | jq '[.[] | select(test("^[0-9]+\\\\.[0-9]+\\\\.[0-9]+$"))]'`
      const result = await executeCommandAsync(command)
      const allVersions = JSON.parse(result) as string[]

      // Sort versions to find the latest
      const sortedVersions = allVersions.sort(semver.rcompare)
      const latestVersion = sortedVersions.length > 0 ? sortedVersions[0] : 'unknown'

      return {
        packageName,
        data: {
          latestVersion,
          allVersions,
        },
      }
    } catch (error) {
      // Fallback for failed packages
      return {
        packageName,
        data: { latestVersion: 'unknown', allVersions: [] },
      }
    }
  })

  // Wrap promises to track completion progress
  const wrappedPromises = fetchPromises.map(async (promise, index) => {
    const result = await promise
    completedCount++
    const percentage = Math.round((completedCount / total) * 100)
    showPackageProgress(`🔍 Analyzing packages... (${completedCount}/${total} - ${percentage}%)`)
    return result
  })

  // Wait for all promises to settle
  const results = await Promise.all(wrappedPromises)

  // Clear the progress line
  process.stdout.write('\r' + ' '.repeat(80) + '\r')

  // Process results and build the map
  for (const result of results) {
    packageData.set(result.packageName, result.data)
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
    // Coerce the version specifier to get a valid semver version
    const coercedVersion = semver.coerce(installedVersion)
    if (!coercedVersion) {
      return null
    }

    const installedMajor = semver.major(coercedVersion)
    const installedMinor = semver.minor(coercedVersion)

    // Find versions with same major but higher minor
    const sameMajorVersions = allVersions.filter((version) => {
      try {
        const major = semver.major(version)
        const minor = semver.minor(version)
        return major === installedMajor && minor > installedMinor
      } catch {
        return false
      }
    })

    if (sameMajorVersions.length === 0) {
      return null
    }

    // Return the highest minor version (lowest patch)
    return sameMajorVersions.sort(semver.rcompare)[0]
  } catch {
    return null
  }
}
