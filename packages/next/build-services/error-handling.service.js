/**
 * Error Handling Service
 * Dedicated error aggregation and reporting service
 * SOA Improvement: Centralized error management
 */

const EventEmitter = require('events')

/**
 * Error Handling Service
 */
class ErrorHandlingService extends EventEmitter {
  constructor(options = {}) {
    super()
    this.handlers = new Map()
    this.reporters = []
    this.filters = []
    this.errorLog = []
    this.maxLogSize = options.maxLogSize || 1000
    this.shouldThrow = options.shouldThrow !== false
  }

  /**
   * Register an error handler for specific error types
   * @param {string} errorType - Type of error to handle
   * @param {Function} handler - Handler function
   */
  registerHandler(errorType, handler) {
    if (!this.handlers.has(errorType)) {
      this.handlers.set(errorType, [])
    }
    this.handlers.get(errorType).push(handler)
    return this
  }

  /**
   * Register an error reporter
   * @param {Function} reporter - Reporter function
   */
  registerReporter(reporter) {
    this.reporters.push(reporter)
    return this
  }

  /**
   * Register an error filter
   * @param {Function} filter - Filter function (returns true to process error)
   */
  registerFilter(filter) {
    this.filters.push(filter)
    return this
  }

  /**
   * Handle an error
   * @param {Error} error - Error instance
   * @param {Object} context - Error context
   */
  async handleError(error, context = {}) {
    try {
      const errorData = this.createErrorData(error, context)
      
      // Apply filters
      if (!this.shouldProcessError(errorData)) {
        return
      }

      // Log the error
      this.logError(errorData)

      // Emit error event
      this.emit('error', errorData)

      // Apply specific handlers
      await this.applyHandlers(errorData)

      // Report to registered reporters
      await this.reportError(errorData)

      // Throw if configured to do so
      if (this.shouldThrow && errorData.severity === 'fatal') {
        throw error
      }

    } catch (handlingError) {
      // Prevent infinite loops in error handling
      console.error('Error in error handling:', handlingError)
    }
  }

  /**
   * Create standardized error data
   */
  createErrorData(error, context) {
    return {
      id: this.generateErrorId(),
      timestamp: new Date().toISOString(),
      name: error.name,
      message: error.message,
      stack: error.stack,
      type: this.determineErrorType(error, context),
      severity: this.determineSeverity(error, context),
      context: {
        ...context,
        nodeVersion: process.version,
        platform: process.platform,
        memory: process.memoryUsage(),
        uptime: process.uptime()
      },
      metadata: this.extractMetadata(error, context)
    }
  }

  /**
   * Generate unique error ID
   */
  generateErrorId() {
    return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Determine error type
   */
  determineErrorType(error, context) {
    if (context.type) return context.type
    
    // Infer type from error properties
    if (error.code) {
      if (error.code.startsWith('ENOENT')) return 'file-not-found'
      if (error.code.startsWith('EACCES')) return 'permission-denied'
      if (error.code.startsWith('EMFILE')) return 'too-many-files'
    }

    if (error.name === 'SyntaxError') return 'syntax-error'
    if (error.name === 'TypeError') return 'type-error'
    if (error.name === 'ReferenceError') return 'reference-error'

    return 'unknown'
  }

  /**
   * Determine error severity
   */
  determineSeverity(error, context) {
    if (context.severity) return context.severity

    // Infer severity
    if (error.name === 'SyntaxError' || error.name === 'ReferenceError') {
      return 'fatal'
    }

    if (error.code === 'ENOENT' || error.code === 'EACCES') {
      return 'error'
    }

    return 'warning'
  }

  /**
   * Extract metadata from error
   */
  extractMetadata(error, context) {
    const metadata = {}

    // Extract build-related metadata
    if (context.buildPhase) {
      metadata.buildPhase = context.buildPhase
    }

    if (context.filePath) {
      metadata.filePath = context.filePath
    }

    if (context.component) {
      metadata.component = context.component
    }

    // Extract webpack-related metadata
    if (error.module) {
      metadata.webpackModule = error.module
    }

    if (error.dependencies) {
      metadata.dependencies = error.dependencies
    }

    return metadata
  }

  /**
   * Check if error should be processed
   */
  shouldProcessError(errorData) {
    return this.filters.every(filter => filter(errorData))
  }

  /**
   * Log error to internal log
   */
  logError(errorData) {
    this.errorLog.push(errorData)
    
    // Maintain log size
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift()
    }
  }

  /**
   * Apply registered handlers
   */
  async applyHandlers(errorData) {
    const handlersToRun = this.handlers.get(errorData.type) || []
    const generalHandlers = this.handlers.get('*') || []
    
    const allHandlers = [...handlersToRun, ...generalHandlers]
    
    for (const handler of allHandlers) {
      try {
        await handler(errorData)
      } catch (handlerError) {
        console.error('Error in error handler:', handlerError)
      }
    }
  }

  /**
   * Report error to registered reporters
   */
  async reportError(errorData) {
    const reportPromises = this.reporters.map(reporter => {
      return reporter(errorData).catch(reporterError => {
        console.error('Error in error reporter:', reporterError)
      })
    })
    
    await Promise.all(reportPromises)
  }

  /**
   * Get error statistics
   */
  getErrorStats() {
    const stats = {
      totalErrors: this.errorLog.length,
      errorsByType: {},
      errorsBySeverity: {},
      recentErrors: this.errorLog.slice(-10)
    }

    for (const error of this.errorLog) {
      stats.errorsByType[error.type] = (stats.errorsByType[error.type] || 0) + 1
      stats.errorsBySeverity[error.severity] = (stats.errorsBySeverity[error.severity] || 0) + 1
    }

    return stats
  }

  /**
   * Clear error log
   */
  clearLog() {
    this.errorLog = []
  }
}

/**
 * Build Error Handler
 */
class BuildErrorHandler extends ErrorHandlingService {
  constructor(options = {}) {
    super(options)
    this.setupBuildHandlers()
  }

  setupBuildHandlers() {
    // Syntax error handler
    this.registerHandler('syntax-error', async (errorData) => {
      console.error(`🔴 Syntax Error in ${errorData.metadata.filePath || 'unknown file'}:`)
      console.error(errorData.message)
      
      if (errorData.context.suggestions) {
        console.log('💡 Suggestions:')
        errorData.context.suggestions.forEach(suggestion => {
          console.log(`  - ${suggestion}`)
        })
      }
    })

    // Module not found handler
    this.registerHandler('file-not-found', async (errorData) => {
      if (errorData.message.includes('Cannot resolve module')) {
        console.error(`🔴 Module Resolution Error:`)
        console.error(errorData.message)
        console.log('💡 Check your import paths and ensure the module is installed')
      }
    })

    // Build performance handler
    this.registerHandler('build-performance', async (errorData) => {
      if (errorData.context.duration > 30000) { // 30 seconds
        console.warn(`⚠️ Slow build detected: ${errorData.context.duration}ms`)
        console.log('💡 Consider enabling webpack build cache or optimizing imports')
      }
    })
  }
}

/**
 * Next.js Error Handling Service
 */
class NextJSErrorHandlingService extends BuildErrorHandler {
  constructor(options = {}) {
    super(options)
    this.setupNextJSHandlers()
    this.setupNextJSReporters()
  }

  setupNextJSHandlers() {
    // Next.js specific error handlers
    this.registerHandler('next-config-error', async (errorData) => {
      console.error('🔴 Next.js Configuration Error:')
      console.error(errorData.message)
      console.log('💡 Check your next.config.js file for syntax errors')
    })

    // Server component error handler
    this.registerHandler('server-component-error', async (errorData) => {
      console.error(`🔴 Server Component Error in ${errorData.metadata.component}:`)
      console.error(errorData.message)
      console.log('💡 Ensure server components only use server-side APIs')
    })

    // API route error handler
    this.registerHandler('api-route-error', async (errorData) => {
      console.error(`🔴 API Route Error in ${errorData.metadata.route}:`)
      console.error(errorData.message)
    })

    // Middleware error handler
    this.registerHandler('middleware-error', async (errorData) => {
      console.error('🔴 Middleware Error:')
      console.error(errorData.message)
      console.log('💡 Check your middleware.ts file')
    })
  }

  setupNextJSReporters() {
    // Development reporter
    this.registerReporter(async (errorData) => {
      if (process.env.NODE_ENV === 'development') {
        // In development, show detailed error info
        this.displayDetailedError(errorData)
      }
    })

    // Production reporter
    this.registerReporter(async (errorData) => {
      if (process.env.NODE_ENV === 'production') {
        // In production, log to monitoring service
        this.reportToMonitoring(errorData)
      }
    })

    // File reporter
    this.registerReporter(async (errorData) => {
      if (process.env.NEXT_ERROR_LOG) {
        await this.writeErrorToFile(errorData)
      }
    })
  }

  displayDetailedError(errorData) {
    console.log('\n' + '='.repeat(80))
    console.log(`ERROR: ${errorData.name}`)
    console.log(`TIME: ${errorData.timestamp}`)
    console.log(`TYPE: ${errorData.type}`)
    console.log(`SEVERITY: ${errorData.severity}`)
    if (errorData.metadata.filePath) {
      console.log(`FILE: ${errorData.metadata.filePath}`)
    }
    console.log('MESSAGE:', errorData.message)
    if (errorData.stack) {
      console.log('STACK:', errorData.stack)
    }
    console.log('='.repeat(80) + '\n')
  }

  async reportToMonitoring(errorData) {
    // Mock implementation - would integrate with actual monitoring service
    console.log(`Reported error ${errorData.id} to monitoring service`)
  }

  async writeErrorToFile(errorData) {
    const fs = require('fs').promises
    const path = require('path')
    
    const logPath = path.join(process.cwd(), '.next', 'errors.log')
    const logEntry = JSON.stringify(errorData) + '\n'
    
    await fs.appendFile(logPath, logEntry)
  }

  /**
   * Handle Next.js specific error types
   */
  async handleNextJSError(error, context = {}) {
    // Enhance context with Next.js specific information
    const enhancedContext = {
      ...context,
      isNextJS: true,
      version: process.env.npm_package_version,
      buildTarget: process.env.NEXT_BUILD_TARGET || 'server'
    }

    return this.handleError(error, enhancedContext)
  }
}

module.exports = { 
  ErrorHandlingService, 
  BuildErrorHandler,
  NextJSErrorHandlingService 
}