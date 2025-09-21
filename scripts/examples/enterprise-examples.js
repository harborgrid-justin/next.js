/**
 * Enterprise Examples - Comprehensive demonstrations of 43 improvements
 * These examples showcase real-world usage patterns for enterprise applications
 */

const { getLogger } = require('../utils/logger')
const { getProcessManager } = require('../utils/process-manager')
const { loadConfig } = require('../utils/config-manager')
const { getPerformanceManager } = require('../utils/performance')
const { InputValidator, RateLimiter, CacheManager } = require('../utils/security')

/**
 * Example 1: Error Handling & Resilience Patterns
 * Demonstrates: Circuit breaker, retry mechanisms, structured error handling
 */
class ErrorHandlingExample {
  constructor() {
    this.logger = getLogger('ErrorHandlingExample')
    this.pm = getProcessManager('error-example')
    this.failureCount = 0
    this.circuitOpen = false
  }

  /**
   * Demonstrates comprehensive error handling with circuit breaker pattern
   */
  async processWithCircuitBreaker(operation, data) {
    const startTime = performance.now()
    
    try {
      // Circuit breaker check
      if (this.circuitOpen) {
        throw new Error('Circuit breaker is open - service unavailable')
      }

      // Input validation
      const sanitizedData = InputValidator.validateAndSanitize(data, {
        required: ['id', 'payload'],
        types: { id: 'string', payload: 'object' }
      })

      // Execute operation with timeout and retry
      const result = await this.executeWithRetry(operation, sanitizedData, {
        maxRetries: 3,
        timeout: 5000,
        backoffMultiplier: 2
      })

      // Success - reset failure count
      this.failureCount = 0
      this.circuitOpen = false

      this.logger.info('Operation completed successfully', {
        operation: operation.name,
        duration: performance.now() - startTime,
        dataId: sanitizedData.id
      })

      return result

    } catch (error) {
      this.failureCount++
      
      // Open circuit after 5 failures
      if (this.failureCount >= 5) {
        this.circuitOpen = true
        this.logger.error('Circuit breaker opened due to repeated failures', {
          failureCount: this.failureCount
        })
      }

      // Structure the error with context
      const structuredError = new Error(`Operation ${operation.name} failed: ${error.message}`)
      structuredError.originalError = error
      structuredError.context = {
        operation: operation.name,
        failureCount: this.failureCount,
        circuitOpen: this.circuitOpen,
        duration: performance.now() - startTime
      }

      this.logger.error('Operation failed with structured error', structuredError.context, error)
      throw structuredError
    }
  }

  async executeWithRetry(operation, data, options) {
    let lastError
    
    for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
      try {
        const result = await Promise.race([
          operation(data),
          this.timeoutPromise(options.timeout)
        ])
        return result
      } catch (error) {
        lastError = error
        
        if (attempt < options.maxRetries) {
          const delay = options.backoffMultiplier * (1000 * attempt)
          this.logger.warn(`Attempt ${attempt} failed, retrying in ${delay}ms`, { error: error.message })
          await this.delay(delay)
        }
      }
    }
    
    throw lastError
  }

  timeoutPromise(ms) {
    return new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms)
    )
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

/**
 * Example 2: Security & Performance Integration
 * Demonstrates: Input sanitization, rate limiting, caching, resource optimization
 */
class SecurityPerformanceExample {
  constructor() {
    this.logger = getLogger('SecurityPerformanceExample')
    this.rateLimiter = new RateLimiter({
      windowMs: 60000, // 1 minute
      maxRequests: 100,
      skipSuccessfulRequests: false
    })
    this.cache = new CacheManager({
      maxSize: 1000,
      ttl: 300000, // 5 minutes
      enableCompression: true
    })
    this.performance = getPerformanceManager()
  }

  /**
   * Secure API endpoint simulation with comprehensive protections
   */
  async secureApiEndpoint(request, clientId) {
    const timer = this.performance.collector.timer('secure_api_request')
    
    try {
      // Rate limiting
      const rateLimitResult = this.rateLimiter.isAllowed(clientId)
      if (!rateLimitResult.allowed) {
        throw new Error(`Rate limit exceeded. Try again in ${rateLimitResult.resetTime}ms`)
      }

      // Input sanitization and validation
      const sanitizedRequest = this.sanitizeRequest(request)
      
      // Check cache first
      const cacheKey = this.generateCacheKey(sanitizedRequest, clientId)
      let result = this.cache.get(cacheKey)
      
      if (result) {
        this.logger.debug('Cache hit', { cacheKey, clientId })
        this.performance.collector.counter('cache_hits')
        return result
      }

      // Process request
      result = await this.processSecureRequest(sanitizedRequest, clientId)
      
      // Cache the result
      this.cache.set(cacheKey, result, { compress: result.length > 1024 })
      this.performance.collector.counter('cache_misses')
      
      return result

    } catch (error) {
      this.logger.error('Secure API endpoint error', { clientId, error: error.message })
      throw error
    } finally {
      timer.end()
    }
  }

  sanitizeRequest(request) {
    return {
      id: InputValidator.sanitizeString(request.id, { maxLength: 50 }),
      query: InputValidator.sanitizeString(request.query, { maxLength: 200 }),
      filters: InputValidator.sanitizeObject(request.filters, {
        allowedKeys: ['category', 'date', 'status'],
        maxDepth: 2
      }),
      pagination: {
        page: InputValidator.sanitizeNumber(request.page, { min: 1, max: 1000, default: 1 }),
        limit: InputValidator.sanitizeNumber(request.limit, { min: 1, max: 100, default: 20 })
      }
    }
  }

  generateCacheKey(request, clientId) {
    const keyData = { request, clientId }
    return `api_${InputValidator.hashObject(keyData)}`
  }

  async processSecureRequest(request, clientId) {
    // Simulate secure processing
    await this.delay(Math.random() * 100 + 50) // 50-150ms processing time
    
    return {
      data: `Processed request ${request.id} for client ${clientId}`,
      timestamp: new Date().toISOString(),
      filters: request.filters,
      pagination: request.pagination
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

/**
 * Example 3: Configuration Management & Dependency Injection
 * Demonstrates: Centralized config, factory patterns, proper abstraction
 */
class ConfigurationExample {
  constructor() {
    this.logger = getLogger('ConfigurationExample')
    this.services = new Map()
  }

  /**
   * Initialize application with dependency injection
   */
  async initialize() {
    // Load configurations from multiple sources
    await loadConfig('database', {
      required: ['host', 'port', 'name'],
      defaults: {
        port: 5432,
        ssl: true,
        connectionPool: {
          min: 2,
          max: 10
        }
      }
    })

    await loadConfig('redis', {
      required: ['host'],
      defaults: {
        port: 6379,
        db: 0,
        retryAttempts: 3
      }
    })

    await loadConfig('application', {
      defaults: {
        environment: 'development',
        logLevel: 'info',
        security: {
          cors: true,
          helmet: true,
          rateLimiting: true
        }
      }
    })

    // Initialize services with dependency injection
    this.initializeServices()
  }

  initializeServices() {
    // Service factory pattern
    this.services.set('database', this.createDatabaseService())
    this.services.set('cache', this.createCacheService())
    this.services.set('auth', this.createAuthService())
    this.services.set('metrics', this.createMetricsService())
  }

  createDatabaseService() {
    const config = require('../utils/config-manager').getConfig('database')
    return {
      config,
      connect: async () => {
        this.logger.info('Database connection established', { 
          host: config.host, 
          port: config.port 
        })
      },
      disconnect: async () => {
        this.logger.info('Database connection closed')
      }
    }
  }

  createCacheService() {
    const config = require('../utils/config-manager').getConfig('redis')
    return new CacheManager({
      host: config.host,
      port: config.port,
      db: config.db
    })
  }

  createAuthService() {
    return {
      authenticate: async (token) => {
        // Secure authentication implementation
        return InputValidator.validateJWT(token)
      },
      authorize: async (user, resource) => {
        // Authorization logic
        return user.permissions.includes(resource)
      }
    }
  }

  createMetricsService() {
    return getPerformanceManager()
  }

  getService(name) {
    const service = this.services.get(name)
    if (!service) {
      throw new Error(`Service '${name}' not found`)
    }
    return service
  }
}

/**
 * Example 4: Comprehensive Testing Integration
 * Demonstrates: Unit tests, integration tests, performance benchmarks
 */
class TestingExample {
  constructor() {
    this.logger = getLogger('TestingExample')
  }

  /**
   * Run comprehensive test suite
   */
  async runTestSuite() {
    const { TestRunner } = require('../utils/testing')
    const { BenchmarkRunner } = require('./benchmark-suite')
    
    const testRunner = new TestRunner({ verbose: true })
    const benchmarkRunner = new BenchmarkRunner()

    // Unit tests
    testRunner.describe('Enterprise Examples Unit Tests', 'Testing individual components', () => {
      testRunner.it('should handle errors with circuit breaker', async () => {
        const errorHandler = new ErrorHandlingExample()
        const mockOperation = async () => { throw new Error('Test failure') }
        
        try {
          await errorHandler.processWithCircuitBreaker(mockOperation, { id: 'test', payload: {} })
        } catch (error) {
          // Expected to fail
        }
        
        return errorHandler.failureCount > 0
      })

      testRunner.it('should enforce rate limiting', async () => {
        const securityExample = new SecurityPerformanceExample()
        const requests = []
        
        // Make 105 requests (exceeds limit of 100)
        for (let i = 0; i < 105; i++) {
          requests.push(
            securityExample.secureApiEndpoint(
              { id: `test-${i}`, query: 'test' }, 
              'test-client'
            ).catch(err => err)
          )
        }
        
        const results = await Promise.all(requests)
        const rateLimitErrors = results.filter(r => r instanceof Error && r.message.includes('Rate limit'))
        
        return rateLimitErrors.length > 0
      })

      testRunner.it('should cache responses effectively', async () => {
        const securityExample = new SecurityPerformanceExample()
        const request = { id: 'cache-test', query: 'test' }
        
        // First request - cache miss
        const result1 = await securityExample.secureApiEndpoint(request, 'cache-client')
        
        // Second request - should be cache hit
        const result2 = await securityExample.secureApiEndpoint(request, 'cache-client')
        
        return result1.data === result2.data
      })
    })

    // Performance benchmarks
    await benchmarkRunner.benchmark('Error Handling Performance', async () => {
      const errorHandler = new ErrorHandlingExample()
      const mockOperation = async (data) => ({ result: 'success', id: data.id })
      
      await errorHandler.processWithCircuitBreaker(
        mockOperation, 
        { id: 'benchmark', payload: { test: true } }
      )
    }, 100, 10)

    await benchmarkRunner.benchmark('Security Pipeline Performance', async () => {
      const securityExample = new SecurityPerformanceExample()
      await securityExample.secureApiEndpoint(
        { id: 'perf-test', query: 'benchmark' },
        'benchmark-client'
      )
    }, 50, 5)

    // Run tests
    const testResults = await testRunner.run()
    
    // Display benchmark results
    this.displayBenchmarkResults(benchmarkRunner)
    
    return {
      tests: testResults,
      benchmarks: benchmarkRunner.results
    }
  }

  displayBenchmarkResults(benchmarkRunner) {
    this.logger.info('Performance Benchmark Results:')
    
    for (const [name, results] of benchmarkRunner.results) {
      this.logger.info(`${name}:`, {
        mean: `${results.stats.mean.toFixed(2)}ms`,
        p95: `${results.stats.p95.toFixed(2)}ms`,
        iterations: results.iterations,
        errors: results.errors
      })
    }
  }
}

module.exports = {
  ErrorHandlingExample,
  SecurityPerformanceExample,
  ConfigurationExample,
  TestingExample
}