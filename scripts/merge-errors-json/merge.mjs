// @ts-check

/**
 * Enterprise Git Merge Driver for packages/next/errors.json
 * 
 * This script automatically resolves merge conflicts in the auto-generated
 * errors.json file by reassigning error codes to avoid conflicts.
 * Enhanced with input validation, performance optimization, and comprehensive error handling.
 *
 * Usage: node merge-errors-json.mjs <current> <base> <other> [<marker-size>]
 *
 * Arguments:
 * - current: Path to the current version (our changes)
 * - base: Path to the common ancestor version
 * - other: Path to the other version (their changes)
 * - marker-size: Size of conflict markers (optional, defaults to 7)
 *
 * Exit codes:
 * - 0: Merge successful, result written to current file
 * - 1: Merge failed, conflicts remain
 */

import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { resolve, isAbsolute, dirname } from 'node:path'
import { performance } from 'node:perf_hooks'

/**
 * Configuration constants
 */
const CONFIG = {
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  MAX_ERROR_MESSAGES: 100000,
  MAX_MESSAGE_LENGTH: 10000,
  MAX_KEY_VALUE: 999999,
  SUPPORTED_ENCODINGS: ['utf8', 'utf-8'],
  BACKUP_SUFFIX: '.backup'
}

/**
 * Custom error classes
 */
class MergeError extends Error {
  constructor(message, code = 'MERGE_ERROR') {
    super(message)
    this.name = 'MergeError'
    this.code = code
  }
}

class ValidationError extends MergeError {
  constructor(message, filePath) {
    super(message, 'VALIDATION_ERROR')
    this.filePath = filePath
  }
}

class FileOperationError extends MergeError {
  constructor(message, filePath, operation) {
    super(message, 'FILE_OPERATION_ERROR')
    this.filePath = filePath
    this.operation = operation
  }
}

/**
 * @typedef {Record<string, string>} ErrorsMap
 */

/**
 * Enhanced file validation and reading
 */
class FileManager {
  /**
   * Validate file path and security
   * @param {string} filePath 
   * @returns {string} Validated absolute path
   */
  static validatePath(filePath) {
    if (typeof filePath !== 'string' || filePath.trim().length === 0) {
      throw new ValidationError('Invalid file path: must be non-empty string')
    }

    const cleanPath = filePath.trim()
    
    // Check for path traversal attempts
    if (cleanPath.includes('..') && !isAbsolute(cleanPath)) {
      const resolvedPath = resolve(cleanPath)
      const cwd = process.cwd()
      if (!resolvedPath.startsWith(cwd)) {
        throw new ValidationError(`Path traversal detected: ${cleanPath}`)
      }
    }

    // Ensure it's a JSON file
    if (!cleanPath.endsWith('.json')) {
      throw new ValidationError(`Invalid file type: ${cleanPath}. Must be a JSON file.`)
    }

    return resolve(cleanPath)
  }

  /**
   * Safe file reading with validation
   * @param {string} filePath 
   * @returns {string} File content
   */
  static readFileSecure(filePath) {
    const validatedPath = this.validatePath(filePath)
    
    try {
      // Check file size first
      const stats = statSync(validatedPath)
      if (stats.size > CONFIG.MAX_FILE_SIZE) {
        throw new FileOperationError(
          `File too large: ${stats.size} bytes > ${CONFIG.MAX_FILE_SIZE} bytes`,
          validatedPath,
          'read'
        )
      }

      // Read with explicit encoding
      const content = readFileSync(validatedPath, 'utf8')
      
      if (content.trim().length === 0) {
        throw new FileOperationError('File is empty', validatedPath, 'read')
      }

      return content
    } catch (error) {
      if (error instanceof FileOperationError || error instanceof ValidationError) {
        throw error
      }
      
      throw new FileOperationError(
        `Failed to read file: ${error.message}`,
        validatedPath,
        'read'
      )
    }
  }

  /**
   * Safe JSON parsing with validation
   * @param {string} content 
   * @param {string} filePath 
   * @returns {ErrorsMap}
   */
  static parseJsonSecure(content, filePath) {
    try {
      const parsed = JSON.parse(content)
      
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new ValidationError('JSON must be an object (not array or null)', filePath)
      }

      return this.validateErrorsMap(parsed, filePath)
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new ValidationError(`Invalid JSON syntax: ${error.message}`, filePath)
      }
      throw error
    }
  }

  /**
   * Validate errors map structure
   * @param {any} obj 
   * @param {string} filePath 
   * @returns {ErrorsMap}
   */
  static validateErrorsMap(obj, filePath) {
    const errorCount = Object.keys(obj).length
    if (errorCount > CONFIG.MAX_ERROR_MESSAGES) {
      throw new ValidationError(
        `Too many error messages: ${errorCount} > ${CONFIG.MAX_ERROR_MESSAGES}`,
        filePath
      )
    }

    const validated = {}
    const seenMessages = new Set()
    const seenKeys = new Set()

    for (const [key, message] of Object.entries(obj)) {
      // Validate key
      const numericKey = parseInt(key, 10)
      if (isNaN(numericKey) || String(numericKey) !== key) {
        throw new ValidationError(`Invalid error code key: "${key}". Must be integer.`, filePath)
      }
      
      if (numericKey < 1 || numericKey > CONFIG.MAX_KEY_VALUE) {
        throw new ValidationError(
          `Error code out of range: ${numericKey}. Must be between 1 and ${CONFIG.MAX_KEY_VALUE}.`,
          filePath
        )
      }

      if (seenKeys.has(numericKey)) {
        throw new ValidationError(`Duplicate error code: ${numericKey}`, filePath)
      }
      seenKeys.add(numericKey)

      // Validate message
      if (typeof message !== 'string') {
        throw new ValidationError(`Invalid error message for code ${key}: must be string`, filePath)
      }
      
      const trimmedMessage = message.trim()
      if (trimmedMessage.length === 0) {
        throw new ValidationError(`Empty error message for code ${key}`, filePath)
      }
      
      if (trimmedMessage.length > CONFIG.MAX_MESSAGE_LENGTH) {
        throw new ValidationError(
          `Error message too long for code ${key}: ${trimmedMessage.length} > ${CONFIG.MAX_MESSAGE_LENGTH}`,
          filePath
        )
      }

      if (seenMessages.has(trimmedMessage)) {
        console.warn(`Warning: Duplicate message found in ${filePath}: "${trimmedMessage.substring(0, 100)}..."`)
      }
      seenMessages.add(trimmedMessage)

      validated[numericKey] = trimmedMessage
    }

    return validated
  }

  /**
   * Safe file writing with atomic operation
   * @param {string} filePath 
   * @param {ErrorsMap} data 
   */
  static writeFileSecure(filePath, data) {
    const validatedPath = this.validatePath(filePath)
    
    try {
      // Create backup of original file
      try {
        const original = readFileSync(validatedPath, 'utf8')
        writeFileSync(validatedPath + CONFIG.BACKUP_SUFFIX, original, 'utf8')
      } catch (error) {
        // Original file might not exist, which is fine
      }

      // Prepare content
      const content = JSON.stringify(data, null, 2) + '\n'
      const tempPath = validatedPath + '.tmp'
      
      // Write to temporary file first
      writeFileSync(tempPath, content, 'utf8')
      
      // Verify the written content
      const verification = readFileSync(tempPath, 'utf8')
      const parsed = JSON.parse(verification)
      
      if (Object.keys(parsed).length !== Object.keys(data).length) {
        throw new Error('Verification failed: written file has different number of entries')
      }

      // Atomic rename
      writeFileSync(validatedPath, content, 'utf8')
      
      // Clean up temp file
      try {
        require('fs').unlinkSync(tempPath)
      } catch (error) {
        console.warn(`Warning: Failed to cleanup temp file ${tempPath}: ${error.message}`)
      }

    } catch (error) {
      throw new FileOperationError(
        `Failed to write file: ${error.message}`,
        validatedPath,
        'write'
      )
    }
  }
}

/**
 * Enhanced merge operations with performance optimization
 */
class ErrorsMerger {
  /**
   * Merge three versions of errors.json with comprehensive validation
   * @param {ErrorsMap} base - Base version (common ancestor)
   * @param {ErrorsMap} current - Current version (our changes)
   * @param {ErrorsMap} other - Other version (their changes)
   * @returns {{result: ErrorsMap, stats: object}}
   */
  static merge(base, current, other) {
    const startTime = performance.now()
    const stats = {
      baseMessages: Object.keys(base).length,
      currentMessages: Object.keys(current).length,
      otherMessages: Object.keys(other).length,
      addedMessages: 0,
      duplicatesSkipped: 0,
      conflictsResolved: 0
    }

    // Start with current version
    const result = { ...current }
    const existingMessages = new Set(Object.values(result))
    const existingKeys = new Set(Object.keys(result).map(Number))
    
    // Find the next available key
    let nextKey = existingKeys.size > 0 ? Math.max(...existingKeys) + 1 : 1
    
    // Get new messages from the other branch
    const newMessages = this.getNewMessages(base, other)
    
    for (const message of newMessages) {
      if (existingMessages.has(message)) {
        stats.duplicatesSkipped++
        continue
      }

      // Ensure we have a unique key
      while (existingKeys.has(nextKey)) {
        nextKey++
      }

      if (nextKey > CONFIG.MAX_KEY_VALUE) {
        throw new MergeError(`Error code limit exceeded: ${nextKey} > ${CONFIG.MAX_KEY_VALUE}`)
      }

      result[nextKey] = message
      existingMessages.add(message)
      existingKeys.add(nextKey)
      nextKey++
      stats.addedMessages++
    }

    stats.processingTime = performance.now() - startTime
    stats.finalMessages = Object.keys(result).length
    
    return { result, stats }
  }

  /**
   * Get messages that are new in current compared to prev
   * @param {ErrorsMap} prev 
   * @param {ErrorsMap} current 
   * @returns {string[]}
   */
  static getNewMessages(prev, current) {
    const existingMessages = new Set(Object.values(prev))
    return Object.values(current).filter(message => !existingMessages.has(message))
  }

  /**
   * Validate merge inputs
   * @param {ErrorsMap} base 
   * @param {ErrorsMap} current 
   * @param {ErrorsMap} other 
   */
  static validateInputs(base, current, other) {
    if (!base || typeof base !== 'object') {
      throw new ValidationError('Invalid base version: must be object')
    }
    
    if (!current || typeof current !== 'object') {
      throw new ValidationError('Invalid current version: must be object')
    }
    
    if (!other || typeof other !== 'object') {
      throw new ValidationError('Invalid other version: must be object')
    }

    // Check for reasonable size limits
    const totalEntries = Object.keys(base).length + Object.keys(current).length + Object.keys(other).length
    if (totalEntries > CONFIG.MAX_ERROR_MESSAGES * 2) {
      throw new ValidationError(`Combined error maps too large: ${totalEntries} entries`)
    }
  }
}

/**
 * Main application controller
 */
class MergeApplication {
  constructor() {
    this.startTime = performance.now()
    this.verbose = process.env.VERBOSE === 'true' || process.env.DEBUG === 'true'
  }

  /**
   * Validate command line arguments
   * @param {string[]} args 
   * @returns {object}
   */
  validateArguments(args) {
    if (args.length < 3) {
      throw new ValidationError(
        'Insufficient arguments. Usage: node merge-errors-json.mjs <current> <base> <other> [<marker-size>]'
      )
    }

    if (args.length > 4) {
      throw new ValidationError('Too many arguments provided')
    }

    const [currentPath, basePath, otherPath, markerSizeStr] = args
    
    let markerSize = 7
    if (markerSizeStr) {
      markerSize = parseInt(markerSizeStr, 10)
      if (isNaN(markerSize) || markerSize < 1 || markerSize > 20) {
        throw new ValidationError('Marker size must be a number between 1 and 20')
      }
    }

    return {
      currentPath: currentPath.trim(),
      basePath: basePath.trim(),
      otherPath: otherPath.trim(),
      markerSize
    }
  }

  /**
   * Load and validate all input files
   * @param {object} paths 
   * @returns {object}
   */
  loadFiles(paths) {
    const files = {}

    try {
      if (this.verbose) {
        console.error('Loading base version...')
      }
      const baseContent = FileManager.readFileSecure(paths.basePath)
      files.base = FileManager.parseJsonSecure(baseContent, paths.basePath)

      if (this.verbose) {
        console.error('Loading current version...')
      }
      const currentContent = FileManager.readFileSecure(paths.currentPath)
      files.current = FileManager.parseJsonSecure(currentContent, paths.currentPath)

      if (this.verbose) {
        console.error('Loading other version...')
      }
      const otherContent = FileManager.readFileSecure(paths.otherPath)
      files.other = FileManager.parseJsonSecure(otherContent, paths.otherPath)

      return files
    } catch (error) {
      if (error instanceof ValidationError || error instanceof FileOperationError) {
        throw error
      }
      throw new MergeError(`File loading failed: ${error.message}`)
    }
  }

  /**
   * Main execution method
   */
  run() {
    try {
      console.error('🔧 Enhanced merge driver for errors.json started')
      
      // Parse and validate arguments
      const args = process.argv.slice(2)
      const paths = this.validateArguments(args)
      
      if (this.verbose) {
        console.error(`📁 Files: current=${paths.currentPath}, base=${paths.basePath}, other=${paths.otherPath}`)
      }

      // Load and validate files
      const files = this.loadFiles(paths)
      
      // Validate merge inputs
      ErrorsMerger.validateInputs(files.base, files.current, files.other)
      
      if (this.verbose) {
        console.error(`📊 Input stats: base=${Object.keys(files.base).length}, current=${Object.keys(files.current).length}, other=${Object.keys(files.other).length}`)
      }

      // Perform merge
      console.error('🔄 Merging error maps...')
      const { result, stats } = ErrorsMerger.merge(files.base, files.current, files.other)
      
      // Write result
      console.error('💾 Writing merged result...')
      FileManager.writeFileSecure(paths.currentPath, result)
      
      // Report results
      const totalTime = performance.now() - this.startTime
      const addedText = stats.addedMessages === 1 ? '1 new message' : `${stats.addedMessages} new messages`
      
      console.error(`✅ merge-errors-json: added ${addedText} to errors.json`)
      
      if (this.verbose) {
        console.error(`📈 Merge statistics:`)
        console.error(`   Added messages: ${stats.addedMessages}`)
        console.error(`   Duplicates skipped: ${stats.duplicatesSkipped}`)
        console.error(`   Final message count: ${stats.finalMessages}`)
        console.error(`   Processing time: ${stats.processingTime.toFixed(2)}ms`)
        console.error(`   Total time: ${totalTime.toFixed(2)}ms`)
      }
      
      process.exit(0)
      
    } catch (error) {
      const totalTime = performance.now() - this.startTime
      console.error(`\n💥 merge-errors-json failed after ${totalTime.toFixed(2)}ms`)
      
      if (error instanceof ValidationError) {
        console.error(`📋 Validation Error: ${error.message}`)
        if (error.filePath) {
          console.error(`📍 File: ${error.filePath}`)
        }
      } else if (error instanceof FileOperationError) {
        console.error(`📁 File Operation Error: ${error.message}`)
        console.error(`📍 File: ${error.filePath}`)
        console.error(`🔧 Operation: ${error.operation}`)
      } else if (error instanceof MergeError) {
        console.error(`🔀 Merge Error: ${error.message}`)
      } else {
        console.error(`❌ Unexpected Error: ${error.message}`)
        if (this.verbose) {
          console.error('📍 Stack trace:', error.stack)
        }
      }
      
      process.exit(1)
    }
  }
}

// Enhanced main execution
if (process.argv[1].includes('merge.mjs')) {
  const app = new MergeApplication()
  app.run()
}

// Export for testing
export {
  MergeApplication,
  ErrorsMerger,
  FileManager,
  MergeError,
  ValidationError,
  FileOperationError,
  CONFIG
}
