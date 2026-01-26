import pLimit from 'p-limit'
import * as semver from 'semver'
import { CACHE_TTL, JSDELIVR_CDN_URL, MAX_CONCURRENT_REQUESTS } from '../constants'
import { getAllPackageData } from './npm-registry'

// In-memory cache for package data
interface CacheEntry {
  data: { latestVersion: string; allVersions: string[] }
  timestamp: number
}
const packageCache = new Map<string, CacheEntry>()

/**
 * Fetches package.json from jsdelivr CDN for a specific version tag.
 * @param packageName - The npm package name
 * @param versionTag - The version tag (e.g., '14', 'latest')
 * @returns The package.json content or null if not found
 */
async function fetchPackageJsonFromJsdelivr(
  packageName: string,
  versionTag: string
): Promise<{ version: string } | null> {
  try {
    const url = `${JSDELIVR_CDN_URL}/${encodeURIComponent(packageName)}@${versionTag}/package.json`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
      },
    })

    if (!response.ok) {
      return null
    }

    const data = (await response.json()) as { version?: string }
    return data.version ? { version: data.version } : null
  } catch (error) {
    console.error(`Error fetching from jsdelivr for package: ${packageName}@${versionTag}`, error)
    return null
  }
}

/**
 * Fetches package data from jsdelivr CDN with fallback to npm registry.
 * Makes simultaneous requests for @latest and @major version.
 * @param packageName - The npm package name
 * @param currentVersion - The current version to extract major from (optional)
 * @returns Package data with latest version and all versions
 */
async function fetchPackageFromJsdelivr(
  packageName: string,
  currentVersion?: string
): Promise<{ latestVersion: string; allVersions: string[] }> {
  // Check cache first
  const cached = packageCache.get(packageName)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data
  }

  try {
    // Determine major version from current version if provided
    // Need to coerce the version first in case it's a range like ^1.1.5
    const majorVersion = currentVersion
      ? semver.major(semver.coerce(currentVersion) || '0.0.0').toString()
      : null

    // Prepare requests: always fetch @latest, and @major if we have a current version
    const requests: Array<Promise<{ version: string } | null>> = [
      fetchPackageJsonFromJsdelivr(packageName, 'latest'),
    ]

    if (majorVersion) {
      requests.push(fetchPackageJsonFromJsdelivr(packageName, majorVersion))
    }

    // Execute all requests simultaneously
    const results = await Promise.all(requests)

    const latestResult = results[0]
    const majorResult = results[1]

    if (!latestResult) {
      // jsdelivr doesn't have this package, fallback to npm registry
      const npmData = await getAllPackageData([packageName])
      const data = npmData.get(packageName) || { latestVersion: 'unknown', allVersions: [] }
      
      // Cache the result
      packageCache.set(packageName, {
        data,
        timestamp: Date.now(),
      })
      
      return data
    }

    const latestVersion = latestResult.version

    // If we have a major version result, we can build a minimal version list
    // This is much faster than fetching all versions from npm
    if (majorResult) {
      const allVersions = [latestVersion]

      // Add the major version result if different from latest
      if (majorResult.version !== latestVersion) {
        allVersions.push(majorResult.version)
      }

      // Add the current version if it's valid and not already in the list
      if (currentVersion && semver.valid(currentVersion)) {
        const coerced = semver.coerce(currentVersion)
        if (coerced && !allVersions.includes(coerced.version)) {
          allVersions.push(coerced.version)
        }
      }

      const result = {
        latestVersion,
        allVersions: allVersions.sort(semver.rcompare),
      }

      // Cache the result
      packageCache.set(packageName, {
        data: result,
        timestamp: Date.now(),
      })

      return result
    }

    // No major version provided, just return latest with minimal version list
    const allVersions = [latestVersion]
    
    // Add the current version if it's valid and not already in the list
    if (currentVersion && semver.valid(currentVersion)) {
      const coerced = semver.coerce(currentVersion)
      if (coerced && !allVersions.includes(coerced.version)) {
        allVersions.push(coerced.version)
      }
    }

    const result = {
      latestVersion,
      allVersions: allVersions.sort(semver.rcompare),
    }

    // Cache the result
    packageCache.set(packageName, {
      data: result,
      timestamp: Date.now(),
    })

    return result
  } catch (error) {
    // Fallback to npm registry on any error
    const npmData = await getAllPackageData([packageName])
    const data = npmData.get(packageName) || { latestVersion: 'unknown', allVersions: [] }
    
    // Cache the result
    packageCache.set(packageName, {
      data,
      timestamp: Date.now(),
    })
    
    return data
  }
}

/**
 * Fetches package version data from jsdelivr CDN for multiple packages.
 * Uses native fetch + p-limit for optimal concurrency control.
 * Falls back to npm registry if jsdelivr doesn't have the package.
 * @param packageNames - Array of package names to fetch
 * @param currentVersions - Optional map of package names to their current versions
 * @param onProgress - Optional progress callback
 * @returns Map of package names to their version data
 */
export async function getAllPackageDataFromJsdelivr(
  packageNames: string[],
  currentVersions?: Map<string, string>,
  onProgress?: (currentPackage: string, completed: number, total: number) => void
): Promise<Map<string, { latestVersion: string; allVersions: string[] }>> {
  const packageData = new Map<string, { latestVersion: string; allVersions: string[] }>()

  if (packageNames.length === 0) {
    return packageData
  }

  const total = packageNames.length
  let completedCount = 0

  // Use p-limit for controlled concurrency + native fetch for HTTP
  const limit = pLimit(MAX_CONCURRENT_REQUESTS)

  const allPromises = packageNames.map((packageName) =>
    limit(async () => {
      const currentVersion = currentVersions?.get(packageName)
      const data = await fetchPackageFromJsdelivr(packageName, currentVersion)
      packageData.set(packageName, data)

      completedCount++

      if (onProgress) {
        onProgress(packageName, completedCount, total)
      }
    })
  )

  // Wait for all requests to complete
  await Promise.all(allPromises)

  // Clear the progress line and show completion time if no custom progress handler
  if (!onProgress) {
    process.stdout.write('\r' + ' '.repeat(80) + '\r')
  }

  return packageData
}

/**
 * Clear the package cache (useful for testing)
 */
export function clearJsdelivrPackageCache(): void {
  packageCache.clear()
}
