import pLimit from 'p-limit'
import * as semver from 'semver'
import { CACHE_TTL, MAX_CONCURRENT_REQUESTS, NPM_REGISTRY_URL } from '../constants'

// In-memory cache for package data
interface CacheEntry {
  data: { latestVersion: string; allVersions: string[] }
  timestamp: number
}
const packageCache = new Map<string, CacheEntry>()

/**
 * Fetches package data from npm registry with caching.
 * Uses native fetch for HTTP requests with connection pooling.
 */
async function fetchPackageFromRegistry(
  packageName: string
): Promise<{ latestVersion: string; allVersions: string[] }> {
  // Check cache first
  const cached = packageCache.get(packageName)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data
  }

  try {
    // Direct HTTP call to npm registry using native fetch
    const url = `${NPM_REGISTRY_URL}/${encodeURIComponent(packageName)}`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/vnd.npm.install-v1+json',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = (await response.json()) as {
      versions?: Record<string, unknown>
      description?: string
      homepage?: string
      repository?: any
      bugs?: any
      keywords?: string[]
      author?: any
      license?: string
      'dist-tags'?: Record<string, string>
    }

    // Extract versions and filter to valid semver (X.Y.Z format, no pre-releases)
    const allVersions = Object.keys(data.versions || {}).filter((version) => {
      // Match only X.Y.Z format (no pre-release, no build metadata)
      return /^[0-9]+\.[0-9]+\.[0-9]+$/.test(version)
    })

    // Sort versions to find the latest
    const sortedVersions = allVersions.sort(semver.rcompare)
    const latestVersion = sortedVersions.length > 0 ? sortedVersions[0] : 'unknown'

    const result = {
      latestVersion,
      allVersions,
    }

    // Cache the result
    packageCache.set(packageName, {
      data: result,
      timestamp: Date.now(),
    })

    return result
  } catch (error) {
    // Return fallback data for failed packages
    return { latestVersion: 'unknown', allVersions: [] }
  }
}

/**
 * Fetches package version data from npm registry for multiple packages.
 * Uses native fetch + p-limit for optimal concurrency control.
 * Only returns valid semantic versions (X.Y.Z format, excluding pre-releases).
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

  // Use p-limit for controlled concurrency + native fetch for HTTP
  const limit = pLimit(MAX_CONCURRENT_REQUESTS)

  const allPromises = packageNames.map((packageName) =>
    limit(async () => {
      const data = await fetchPackageFromRegistry(packageName)
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
export function clearPackageCache(): void {
  packageCache.clear()
}
