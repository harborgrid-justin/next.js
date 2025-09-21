const os = require('os')
const path = require('path')
const fs = require('fs/promises')

const errorsDir = path.join(__dirname, '.errors')

/**
 * Configuration for error code processing
 */
const CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  MAX_ERROR_MESSAGE_LENGTH: 1000,
  SUPPORTED_ERROR_FILE_EXTENSIONS: ['.json']
}

/**
 * Custom error classes for better error handling
 */
class ErrorCodeValidationError extends Error {
  constructor(message, code = 'VALIDATION_ERROR') {
    super(message)
    this.name = 'ErrorCodeValidationError'
    this.code = code
  }
}

class FileProcessingError extends Error {
  constructor(message, filePath, originalError) {
    super(`Error processing file ${filePath}: ${message}`)
    this.name = 'FileProcessingError'
    this.filePath = filePath
    this.originalError = originalError
  }
}

/**
 * Utility function for retrying operations with exponential backoff
 */
async function retryOperation(operation, maxRetries = CONFIG.MAX_RETRIES) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      if (attempt === maxRetries) {
        throw error
      }
      const delay = CONFIG.RETRY_DELAY * Math.pow(2, attempt - 1)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
}

/**
 * This script checks for new error codes in .errors directory and consolidates them into errors.json.
 * It will fail if new error codes are found, after consolidating them, to ensure error codes are
 * properly reviewed and committed.
 */
async function main() {
  let processedFiles = 0
  const startTime = performance.now()

  try {
    // Check if .errors directory exists
    try {
      await fs.access(errorsDir)
    } catch (error) {
      console.log('No .errors directory found, exiting successfully')
      process.exit(0)
    }

    let existingErrors = {}

    // Load existing errors.json if it exists
    const errorsJsonPath = path.join(__dirname, 'errors.json')
    try {
      const errorsContent = await fs.readFile(errorsJsonPath, 'utf8')
      existingErrors = JSON.parse(errorsContent)
      
      // Validate existing errors structure
      if (typeof existingErrors !== 'object' || existingErrors === null) {
        throw new ErrorCodeValidationError('Invalid errors.json format: must be an object')
      }
      
      console.log(`Loaded ${Object.keys(existingErrors).length} existing error codes`)
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('No existing errors.json found, starting fresh')
      } else if (error instanceof SyntaxError) {
        throw new ErrorCodeValidationError(`Invalid JSON in errors.json: ${error.message}`)
      } else if (!(error instanceof ErrorCodeValidationError)) {
        throw new FileProcessingError('Failed to load existing errors', errorsJsonPath, error)
      } else {
        throw error
      }
    }

    // Calculate next error code with validation
    const existingCodes = Object.keys(existingErrors).map(Number).filter(n => !isNaN(n))
    const nextInitialCode = existingCodes.length > 0 ? Math.max(...existingCodes) + 1 : 1

    if (nextInitialCode < 1 || nextInitialCode > 999999) {
      throw new ErrorCodeValidationError(`Invalid error code range: ${nextInitialCode}`)
    }

    // Process new error files with validation
    const allFiles = await fs.readdir(errorsDir)
    const errorFiles = allFiles
      .filter(file => CONFIG.SUPPORTED_ERROR_FILE_EXTENSIONS.some(ext => file.endsWith(ext)))
      .map(file => path.join(errorsDir, file))

    if (errorFiles.length === 0) {
      console.log('No error files found to process')
      await fs.rm(errorsDir, { recursive: true, force: true })
      process.exit(0)
    }

    console.log(`Processing ${errorFiles.length} error files...`)

    const processedMessages = new Set()
    let newErrorCount = 0
    
    for (const file of errorFiles) {
      try {
        processedFiles++
        const fileContent = await retryOperation(async () => {
          const content = await fs.readFile(file, 'utf8')
          if (content.trim().length === 0) {
            throw new FileProcessingError('Empty file', file, null)
          }
          return content
        })

        let errorData
        try {
          errorData = JSON.parse(fileContent)
        } catch (parseError) {
          throw new FileProcessingError('Invalid JSON format', file, parseError)
        }

        // Validate error message structure
        if (!errorData.errorMessage || typeof errorData.errorMessage !== 'string') {
          throw new ErrorCodeValidationError(`Missing or invalid errorMessage in file: ${file}`)
        }

        const errorMessage = errorData.errorMessage.trim()
        
        // Validate error message constraints
        if (errorMessage.length === 0) {
          throw new ErrorCodeValidationError(`Empty error message in file: ${file}`)
        }
        
        if (errorMessage.length > CONFIG.MAX_ERROR_MESSAGE_LENGTH) {
          throw new ErrorCodeValidationError(
            `Error message too long (${errorMessage.length} > ${CONFIG.MAX_ERROR_MESSAGE_LENGTH}) in file: ${file}`
          )
        }

        // Check for duplicate messages in current batch
        if (processedMessages.has(errorMessage)) {
          console.warn(`Duplicate error message found in current batch: "${errorMessage}" (file: ${file})`)
          continue
        }
        processedMessages.add(errorMessage)

        // Check if message already exists in existing errors
        const existingCode = Object.entries(existingErrors).find(
          ([_, msg]) => msg === errorMessage
        )?.[0]

        if (!existingCode) {
          // Only add if message is new
          const code = nextInitialCode + newErrorCount
          existingErrors[code] = errorMessage
          newErrorCount++
          console.log(`Added new error code ${code}: "${errorMessage.substring(0, 80)}${errorMessage.length > 80 ? '...' : ''}"`)
        } else {
          console.log(`Error message already exists with code ${existingCode}: "${errorMessage.substring(0, 80)}${errorMessage.length > 80 ? '...' : ''}"`)
        }
      } catch (error) {
        if (error instanceof FileProcessingError || error instanceof ErrorCodeValidationError) {
          console.error(`Error processing file ${file}: ${error.message}`)
          throw error
        } else {
          throw new FileProcessingError('Unexpected error during processing', file, error)
        }
      }
    }

    // Write updated errors with atomic operation and validation
    const updatedErrorsJson = JSON.stringify(existingErrors, null, 2) + os.EOL
    const tempFilePath = errorsJsonPath + '.tmp'
    
    try {
      await fs.writeFile(tempFilePath, updatedErrorsJson, 'utf8')
      
      // Validate written file before atomic rename
      const writtenContent = await fs.readFile(tempFilePath, 'utf8')
      const parsedContent = JSON.parse(writtenContent)
      
      if (Object.keys(parsedContent).length !== Object.keys(existingErrors).length) {
        throw new Error('Written file validation failed: incorrect number of entries')
      }
      
      // Atomic rename operation
      await fs.rename(tempFilePath, errorsJsonPath)
      console.log(`Successfully updated errors.json with ${newErrorCount} new error codes`)
    } catch (error) {
      // Cleanup temp file if exists
      try {
        await fs.unlink(tempFilePath)
      } catch (cleanupError) {
        console.warn(`Failed to cleanup temp file: ${cleanupError.message}`)
      }
      throw new FileProcessingError('Failed to write errors.json', errorsJsonPath, error)
    }

    // Cleanup .errors directory
    await retryOperation(async () => {
      await fs.rm(errorsDir, { recursive: true, force: true })
      console.log('Successfully cleaned up .errors directory')
    })

    const endTime = performance.now()
    const duration = (endTime - startTime).toFixed(2)
    
    console.log(`\nProcessing complete:`)
    console.log(`- Files processed: ${processedFiles}`)
    console.log(`- New error codes added: ${newErrorCount}`)
    console.log(`- Total error codes: ${Object.keys(existingErrors).length}`)
    console.log(`- Processing time: ${duration}ms`)
    
    if (newErrorCount > 0) {
      console.log('\nNew error codes were added. Please review and commit the changes.')
      process.exit(1)
    } else {
      console.log('No new error codes were found.')
      process.exit(0)
    }
    
  } catch (error) {
    console.error('\n❌ Error processing error codes:')
    
    if (error instanceof ErrorCodeValidationError) {
      console.error(`Validation Error: ${error.message}`)
      process.exit(1)
    } else if (error instanceof FileProcessingError) {
      console.error(`File Processing Error: ${error.message}`)
      if (error.originalError) {
        console.error(`Original Error: ${error.originalError.message}`)
      }
      process.exit(1)
    } else {
      console.error(`Unexpected Error: ${error.message}`)
      console.error(error.stack)
      process.exit(1)
    }
  }
}

/**
 * Enhanced error handler with proper logging and graceful degradation
 */
function handleMainError(error) {
  console.error('\n❌ Fatal error in error code processing:')
  
  if (error instanceof ErrorCodeValidationError || error instanceof FileProcessingError) {
    console.error(`${error.name}: ${error.message}`)
  } else {
    console.error(`Unexpected Error: ${error.message}`)
    console.error('Stack trace:', error.stack)
  }
  
  process.exit(1)
}

// Enhanced main execution with proper error handling
if (require.main === module) {
  main().catch(handleMainError)
} else {
  // Export for testing
  module.exports = {
    main,
    ErrorCodeValidationError,
    FileProcessingError,
    retryOperation,
    CONFIG
  }
}
