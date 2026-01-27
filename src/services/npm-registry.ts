import { Pool, request } from 'undici'
import * as semver from 'semver'
import { CACHE_TTL, MAX_CONCURRENT_REQUESTS, NPM_REGISTRY_URL, REQUEST_TIMEOUT } from '../constants'

// Create a persistent connection pool for npm registry with optimal settings
// This enables connection reuse and HTTP/1.1 keep-alive for blazing fast requests
const npmPool = new Pool('https://registry.npmjs.org', {
  connections: MAX_CONCURRENT_REQUESTS, // Maximum concurrent connections
  pipelining: 10, // Enable request pipelining for even better performance
  keepAliveTimeout: 60000, // Keep connections alive for 60 seconds
  keepAliveMaxTimeout: 600000, // Maximum keep-alive timeout
})

// In-memory cache for package data
interface CacheEntry {
  data: { latestVersion: string; allVersions: string[] }
  timestamp: number
}
const packageCache = new Map<string, CacheEntry>()

/**
 * Fetches package data from npm registry with caching using undici pool.
 * Uses connection pooling and keep-alive for maximum performance.
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
    const url = `${NPM_REGISTRY_URL}/${encodeURIComponent(packageName)}`
    
    const { statusCode, body } = await request(url, {
      dispatcher: npmPool,
      method: 'GET',
      headers: {
        accept: 'application/vnd.npm.install-v1+json',
      },
      headersTimeout: REQUEST_TIMEOUT,
      bodyTimeout: REQUEST_TIMEOUT,
    })

    if (statusCode !== 200) {
      // Consume body to prevent memory leaks
      await body.text()
      throw new Error(`HTTP ${statusCode}`)
    }

    const text = await body.text()
    const data = JSON.parse(text) as {
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
 * Uses undici connection pool for blazing fast performance with connection reuse.
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

  // Fire all requests simultaneously - undici pool handles concurrency internally
  // No need for p-limit - the pool's connection limit controls concurrency
  const allPromises = packageNames.map(async (packageName) => {
    const data = await fetchPackageFromRegistry(packageName)
    packageData.set(packageName, data)

    completedCount++

    if (onProgress) {
      onProgress(packageName, completedCount, total)
    }
  })

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

/**
 * Close the npm registry connection pool (useful for graceful shutdown)
 */
export async function closeNpmPool(): Promise<void> {
  await npmPool.close()
}
