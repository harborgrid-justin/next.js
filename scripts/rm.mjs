// @ts-check
import { rm } from 'fs/promises'
import { join, resolve, isAbsolute } from 'path'
import { stat } from 'fs/promises'

/**
 * Configuration for rm operations
 */
const CONFIG = {
  MAX_PATH_LENGTH: 260,
  MAX_CONCURRENT_OPERATIONS: 5,
  DRY_RUN: process.env.DRY_RUN === 'true',
  VERBOSE: process.env.VERBOSE === 'true' || process.env.DEBUG === 'true'
}

/**
 * Custom error class for rm operations
 */
class RmError extends Error {
  constructor(message, path, originalError) {
    super(message)
    this.name = 'RmError'
    this.path = path
    this.originalError = originalError
  }
}

/**
 * Validates a path before deletion
 * @param {string} path - The path to validate
 * @returns {Promise<string>} - The resolved absolute path
 */
async function validatePath(path) {
  if (typeof path !== 'string' || path.trim().length === 0) {
    throw new RmError('Invalid path: path must be a non-empty string', path, null)
  }

  const trimmedPath = path.trim()
  
  if (trimmedPath.length > CONFIG.MAX_PATH_LENGTH) {
    throw new RmError(`Path too long: ${trimmedPath.length} > ${CONFIG.MAX_PATH_LENGTH}`, path, null)
  }

  // Prevent deletion of dangerous paths
  const dangerousPaths = ['/', '/bin', '/usr', '/etc', '/var', '/sys', '/proc', '/dev']
  const absolutePath = isAbsolute(trimmedPath) ? trimmedPath : resolve(process.cwd(), trimmedPath)
  
  if (dangerousPaths.some(dangerous => absolutePath.startsWith(dangerous))) {
    throw new RmError(`Dangerous path detected, refusing to delete: ${absolutePath}`, path, null)
  }

  // Prevent deletion above current directory unless explicitly absolute
  if (!isAbsolute(trimmedPath) && trimmedPath.includes('..')) {
    const resolvedPath = resolve(process.cwd(), trimmedPath)
    if (!resolvedPath.startsWith(process.cwd())) {
      throw new RmError(`Path traversal detected, refusing to delete: ${resolvedPath}`, path, null)
    }
  }

  return absolutePath
}

/**
 * Safely removes a path with proper error handling
 * @param {string} path - The path to remove
 * @returns {Promise<{success: boolean, path: string, size?: number, error?: Error}>}
 */
async function safeRm(path) {
  const startTime = performance.now()
  let pathSize = 0
  
  try {
    const validatedPath = await validatePath(path)
    
    // Get path info before deletion for logging
    try {
      const pathStat = await stat(validatedPath)
      pathSize = pathStat.size || 0
    } catch (statError) {
      // Path might not exist, which is fine
      if (statError.code !== 'ENOENT') {
        CONFIG.VERBOSE && console.warn(`Warning: Could not stat path ${validatedPath}: ${statError.message}`)
      }
    }

    if (CONFIG.DRY_RUN) {
      console.log(`[DRY RUN] Would delete: "${validatedPath}" (estimated size: ${pathSize} bytes)`)
      return { success: true, path: validatedPath, size: pathSize }
    }

    CONFIG.VERBOSE && console.log(`Deleting: "${validatedPath}" (size: ${pathSize} bytes)`)
    
    await rm(validatedPath, { recursive: true, force: true })
    
    const duration = (performance.now() - startTime).toFixed(2)
    CONFIG.VERBOSE && console.log(`✅ Successfully deleted "${validatedPath}" in ${duration}ms`)
    
    return { success: true, path: validatedPath, size: pathSize }
    
  } catch (error) {
    const duration = (performance.now() - startTime).toFixed(2)
    const rmError = error instanceof RmError ? error : new RmError(
      `Failed to delete path: ${error.message}`,
      path,
      error
    )
    
    console.error(`❌ Error deleting "${path}" after ${duration}ms: ${rmError.message}`)
    return { success: false, path, error: rmError }
  }
}

/**
 * Process multiple paths with concurrency control
 * @param {string[]} paths - Array of paths to process
 * @returns {Promise<{success: number, failed: number, totalSize: number}>}
 */
async function processPathsConcurrently(paths) {
  const results = { success: 0, failed: 0, totalSize: 0 }
  const semaphore = new Array(CONFIG.MAX_CONCURRENT_OPERATIONS).fill(null).map(() => Promise.resolve())
  let semaphoreIndex = 0
  
  const operations = paths.map(async (path) => {
    // Wait for available slot
    await semaphore[semaphoreIndex]
    const currentIndex = semaphoreIndex
    semaphoreIndex = (semaphoreIndex + 1) % CONFIG.MAX_CONCURRENT_OPERATIONS
    
    const operationPromise = safeRm(path).then(result => {
      if (result.success) {
        results.success++
        results.totalSize += result.size || 0
      } else {
        results.failed++
      }
      return result
    })
    
    semaphore[currentIndex] = operationPromise
    return operationPromise
  })

  await Promise.all(operations)
  return results
}

/**
 * Main execution function
 */
async function main() {
  const startTime = performance.now()
  console.log('🗑️  Enhanced rm utility started')
  
  if (CONFIG.DRY_RUN) {
    console.log('🔍 Running in DRY RUN mode - no files will be deleted')
  }

  const args = process.argv.slice(2)
  
  if (args.length === 0) {
    console.error('❌ Error: rm.mjs requires at least one parameter')
    console.error('Usage: node rm.mjs <path1> [path2] [path3] ...')
    console.error('Environment variables:')
    console.error('  DRY_RUN=true    - Show what would be deleted without actually deleting')
    console.error('  VERBOSE=true    - Enable verbose logging')
    process.exit(1)
  }

  // Validate all paths first
  const validPaths = []
  for (const arg of args) {
    try {
      const validatedPath = await validatePath(arg)
      validPaths.push(validatedPath)
    } catch (error) {
      console.error(`❌ Invalid path "${arg}": ${error.message}`)
      process.exit(1)
    }
  }

  console.log(`📁 Processing ${validPaths.length} path(s)...`)
  
  const results = await processPathsConcurrently(validPaths)
  
  const duration = (performance.now() - startTime).toFixed(2)
  const totalSizeMB = (results.totalSize / (1024 * 1024)).toFixed(2)
  
  console.log('\n📊 Summary:')
  console.log(`✅ Successfully processed: ${results.success} path(s)`)
  console.log(`❌ Failed: ${results.failed} path(s)`)
  console.log(`💾 Total size processed: ${totalSizeMB} MB`)
  console.log(`⏱️  Total time: ${duration}ms`)
  
  if (results.failed > 0) {
    console.error(`\n⚠️  ${results.failed} operation(s) failed. Check the error messages above.`)
    process.exit(1)
  }
  
  console.log('\n🎉 All operations completed successfully!')
}

// Execute main function with proper error handling
if (process.argv[1].includes('rm.mjs')) {
  main().catch((error) => {
    console.error('\n💥 Fatal error:', error.message)
    console.error('Stack trace:', error.stack)
    process.exit(1)
  })
}

// Export for testing
export { main, safeRm, validatePath, RmError, CONFIG }
