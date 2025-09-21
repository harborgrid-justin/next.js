/**
 * Enterprise Testing Framework
 * Comprehensive unit and integration testing utilities for Next.js build scripts
 */

const { performance } = require('perf_hooks')
const { EventEmitter } = require('events')
const path = require('path')
const fs = require('fs').promises

/**
 * Test result representation
 */
class TestResult {
  constructor(name, status, duration, error = null, data = {}) {
    this.name = name
    this.status = status // 'passed', 'failed', 'skipped', 'pending'
    this.duration = duration
    this.error = error
    this.data = data
    this.timestamp = new Date().toISOString()
  }

  isPassed() { return this.status === 'passed' }
  isFailed() { return this.status === 'failed' }
  isSkipped() { return this.status === 'skipped' }
}

/**
 * Test suite representation
 */
class TestSuite {
  constructor(name, description = '') {
    this.name = name
    this.description = description
    this.tests = []
    this.beforeEach = []
    this.afterEach = []
    this.beforeAll = []
    this.afterAll = []
    this.results = []
    this.startTime = null
    this.endTime = null
  }

  addTest(test) {
    this.tests.push(test)
  }

  addHook(type, fn) {
    if (!this[type]) {
      throw new Error(`Invalid hook type: ${type}`)
    }
    this[type].push(fn)
  }

  getStats() {
    const passed = this.results.filter(r => r.isPassed()).length
    const failed = this.results.filter(r => r.isFailed()).length
    const skipped = this.results.filter(r => r.isSkipped()).length
    const total = this.results.length
    
    return {
      total,
      passed,
      failed,
      skipped,
      duration: this.endTime ? this.endTime - this.startTime : 0,
      passRate: total > 0 ? (passed / total) * 100 : 0
    }
  }
}

/**
 * Test case representation
 */
class TestCase {
  constructor(name, testFn, options = {}) {
    this.name = name
    this.testFn = testFn
    this.timeout = options.timeout || 5000
    this.skip = options.skip || false
    this.only = options.only || false
    this.tags = options.tags || []
  }

  async run(context = {}) {
    if (this.skip) {
      return new TestResult(this.name, 'skipped', 0)
    }

    const startTime = performance.now()
    
    try {
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Test timeout after ${this.timeout}ms`)), this.timeout)
      })
      
      // Run the test with timeout
      await Promise.race([
        this.testFn(context),
        timeoutPromise
      ])
      
      const duration = performance.now() - startTime
      return new TestResult(this.name, 'passed', duration)
      
    } catch (error) {
      const duration = performance.now() - startTime
      return new TestResult(this.name, 'failed', duration, error)
    }
  }
}

/**
 * Assertion utilities
 */
class Assertions {
  static assertEqual(actual, expected, message = '') {
    if (actual !== expected) {
      throw new Error(`Assertion failed: ${message}\n  Expected: ${expected}\n  Actual: ${actual}`)
    }
  }

  static assertDeepEqual(actual, expected, message = '') {
    const actualStr = JSON.stringify(actual, null, 2)
    const expectedStr = JSON.stringify(expected, null, 2)
    
    if (actualStr !== expectedStr) {
      throw new Error(`Deep assertion failed: ${message}\n  Expected: ${expectedStr}\n  Actual: ${actualStr}`)
    }
  }

  static assertTrue(value, message = '') {
    if (!value) {
      throw new Error(`Assertion failed: Expected truthy value ${message}`)
    }
  }

  static assertFalse(value, message = '') {
    if (value) {
      throw new Error(`Assertion failed: Expected falsy value ${message}`)
    }
  }

  static assertThrows(fn, expectedError = null, message = '') {
    try {
      fn()
      throw new Error(`Expected function to throw ${message}`)
    } catch (error) {
      if (expectedError && !error.message.includes(expectedError)) {
        throw new Error(`Expected error containing "${expectedError}", got "${error.message}" ${message}`)
      }
    }
  }

  static async assertThrowsAsync(fn, expectedError = null, message = '') {
    try {
      await fn()
      throw new Error(`Expected async function to throw ${message}`)
    } catch (error) {
      if (expectedError && !error.message.includes(expectedError)) {
        throw new Error(`Expected error containing "${expectedError}", got "${error.message}" ${message}`)
      }
    }
  }

  static assertInstanceOf(obj, constructor, message = '') {
    if (!(obj instanceof constructor)) {
      throw new Error(`Assertion failed: Expected instance of ${constructor.name} ${message}`)
    }
  }

  static assertContains(container, value, message = '') {
    if (Array.isArray(container)) {
      if (!container.includes(value)) {
        throw new Error(`Array does not contain ${value} ${message}`)
      }
    } else if (typeof container === 'string') {
      if (!container.includes(value)) {
        throw new Error(`String does not contain "${value}" ${message}`)
      }
    } else if (typeof container === 'object' && container !== null) {
      if (!(value in container)) {
        throw new Error(`Object does not contain key "${value}" ${message}`)
      }
    } else {
      throw new Error(`Cannot check containment for type ${typeof container}`)
    }
  }

  static assertMatches(actual, pattern, message = '') {
    if (!pattern.test(actual)) {
      throw new Error(`String does not match pattern: ${actual} ${message}`)
    }
  }
}

/**
 * Mock utilities
 */
class MockManager {
  constructor() {
    this.mocks = new Map()
    this.originalValues = new Map()
  }

  /**
   * Mock a function
   */
  mockFunction(name, implementation = null) {
    const mock = {
      calls: [],
      implementation: implementation || (() => {}),
      callsCount: 0,
      called: false
    }

    const mockFn = (...args) => {
      mock.called = true
      mock.callsCount++
      mock.calls.push(args)
      return mock.implementation(...args)
    }

    // Add mock methods to function with proper context binding
    mockFn.mockReturnValue = (value) => {
      mock.implementation = () => value
      return mockFn
    }
    
    mockFn.mockImplementation = (fn) => {
      mock.implementation = fn
      return mockFn
    }
    
    mockFn.mockResolvedValue = (value) => {
      mock.implementation = () => Promise.resolve(value)
      return mockFn
    }
    
    mockFn.mockRejectedValue = (error) => {
      mock.implementation = () => Promise.reject(error)
      return mockFn
    }

    // Copy other properties
    mockFn.calls = mock.calls
    mockFn.callsCount = mock.callsCount
    Object.defineProperty(mockFn, 'called', {
      get() { return mock.called }
    })
    
    this.mocks.set(name, mockFn)
    return mockFn
  }

  /**
   * Mock an object property
   */
  mockProperty(obj, property, value) {
    const key = `${obj.constructor.name}.${property}`
    
    if (!this.originalValues.has(key)) {
      this.originalValues.set(key, obj[property])
    }
    
    obj[property] = value
    return this
  }

  /**
   * Mock environment variable
   */
  mockEnv(name, value) {
    const key = `env.${name}`
    
    if (!this.originalValues.has(key)) {
      this.originalValues.set(key, process.env[name])
    }
    
    process.env[name] = value
    return this
  }

  /**
   * Restore all mocks
   */
  restoreAll() {
    // Restore environment variables
    for (const [key, value] of this.originalValues) {
      if (key.startsWith('env.')) {
        const envName = key.substring(4)
        if (value === undefined) {
          delete process.env[envName]
        } else {
          process.env[envName] = value
        }
      }
    }
    
    this.mocks.clear()
    this.originalValues.clear()
  }

  /**
   * Get mock by name
   */
  getMock(name) {
    return this.mocks.get(name)
  }
}

/**
 * Main test runner
 */
class TestRunner extends EventEmitter {
  constructor(options = {}) {
    super()
    this.suites = []
    this.options = {
      bail: options.bail || false,
      timeout: options.timeout || 10000,
      verbose: options.verbose || false,
      reporter: options.reporter || 'default',
      parallel: options.parallel || false,
      maxConcurrency: options.maxConcurrency || 4
    }
    this.mockManager = new MockManager()
  }

  /**
   * Create a new test suite
   */
  describe(name, description, suiteFn) {
    const suite = new TestSuite(name, description)
    const originalSuite = this.currentSuite
    this.currentSuite = suite
    
    try {
      suiteFn()
      this.suites.push(suite)
    } finally {
      this.currentSuite = originalSuite
    }
    
    return suite
  }

  /**
   * Add a test to the current suite
   */
  it(name, testFn, options = {}) {
    if (!this.currentSuite) {
      throw new Error('Tests must be defined within a describe block')
    }
    
    const test = new TestCase(name, testFn, options)
    this.currentSuite.addTest(test)
    return test
  }

  /**
   * Add hooks to current suite
   */
  beforeEach(fn) { this.currentSuite.addHook('beforeEach', fn) }
  afterEach(fn) { this.currentSuite.addHook('afterEach', fn) }
  beforeAll(fn) { this.currentSuite.addHook('beforeAll', fn) }
  afterAll(fn) { this.currentSuite.addHook('afterAll', fn) }

  /**
   * Run all test suites
   */
  async run() {
    const startTime = performance.now()
    this.emit('start', { suites: this.suites.length })
    
    let totalStats = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0
    }

    try {
      for (const suite of this.suites) {
        const suiteResult = await this.runSuite(suite)
        const stats = suite.getStats()
        
        totalStats.total += stats.total
        totalStats.passed += stats.passed
        totalStats.failed += stats.failed
        totalStats.skipped += stats.skipped
        totalStats.duration += stats.duration
        
        this.emit('suite:complete', { suite, stats })
        
        if (this.options.bail && stats.failed > 0) {
          console.log('🛑 Bailing out due to test failures')
          break
        }
      }

      totalStats.duration = performance.now() - startTime
      this.emit('complete', totalStats)
      
      return totalStats
      
    } catch (error) {
      this.emit('error', error)
      throw error
    } finally {
      this.mockManager.restoreAll()
    }
  }

  /**
   * Run a single test suite
   */
  async runSuite(suite) {
    suite.startTime = performance.now()
    this.emit('suite:start', { suite })
    
    try {
      // Run beforeAll hooks
      for (const hook of suite.beforeAll) {
        await hook()
      }
      
      // Run tests
      for (const test of suite.tests) {
        // Run beforeEach hooks
        for (const hook of suite.beforeEach) {
          await hook()
        }
        
        const result = await test.run({ mockManager: this.mockManager })
        suite.results.push(result)
        
        this.emit('test:complete', { test, result })
        
        // Run afterEach hooks
        for (const hook of suite.afterEach) {
          await hook()
        }
        
        if (this.options.bail && result.isFailed()) {
          break
        }
      }
      
      // Run afterAll hooks
      for (const hook of suite.afterAll) {
        await hook()
      }
      
    } catch (error) {
      this.emit('suite:error', { suite, error })
      throw error
    } finally {
      suite.endTime = performance.now()
    }
  }

  /**
   * Generate test report
   */
  generateReport(stats, format = 'console') {
    if (format === 'console') {
      return this.generateConsoleReport(stats)
    } else if (format === 'json') {
      return this.generateJsonReport(stats)
    } else if (format === 'junit') {
      return this.generateJunitReport(stats)
    }
    
    throw new Error(`Unsupported report format: ${format}`)
  }

  /**
   * Generate console report
   */
  generateConsoleReport(stats) {
    const lines = []
    const passRate = stats.total > 0 ? (stats.passed / stats.total * 100).toFixed(1) : '0'
    
    lines.push('📊 Test Results Summary')
    lines.push('=' .repeat(50))
    lines.push(`Total Tests: ${stats.total}`)
    lines.push(`✅ Passed: ${stats.passed}`)
    lines.push(`❌ Failed: ${stats.failed}`)
    lines.push(`⏭️  Skipped: ${stats.skipped}`)
    lines.push(`📈 Pass Rate: ${passRate}%`)
    lines.push(`⏱️  Duration: ${stats.duration.toFixed(2)}ms`)
    lines.push('')

    // Suite details
    for (const suite of this.suites) {
      const suiteStats = suite.getStats()
      lines.push(`📦 Suite: ${suite.name}`)
      
      if (suite.description) {
        lines.push(`   ${suite.description}`)
      }
      
      lines.push(`   Tests: ${suiteStats.total}, Passed: ${suiteStats.passed}, Failed: ${suiteStats.failed}`)
      
      // Show failed tests
      const failedResults = suite.results.filter(r => r.isFailed())
      for (const result of failedResults) {
        lines.push(`   ❌ ${result.name}: ${result.error.message}`)
      }
      
      lines.push('')
    }

    return lines.join('\n')
  }

  /**
   * Generate JSON report
   */
  generateJsonReport(stats) {
    return JSON.stringify({
      summary: stats,
      suites: this.suites.map(suite => ({
        name: suite.name,
        description: suite.description,
        stats: suite.getStats(),
        tests: suite.results.map(result => ({
          name: result.name,
          status: result.status,
          duration: result.duration,
          error: result.error ? result.error.message : null,
          timestamp: result.timestamp
        }))
      }))
    }, null, 2)
  }
}

/**
 * Integration test utilities
 */
class IntegrationTestHelper {
  constructor() {
    this.tempDirs = []
    this.processes = []
  }

  /**
   * Create temporary directory
   */
  async createTempDir(prefix = 'test-') {
    const os = require('os')
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
    this.tempDirs.push(tempDir)
    return tempDir
  }

  /**
   * Write file to temporary directory
   */
  async writeTestFile(dir, filename, content) {
    const filepath = path.join(dir, filename)
    await fs.mkdir(path.dirname(filepath), { recursive: true })
    await fs.writeFile(filepath, content)
    return filepath
  }

  /**
   * Execute command and capture output
   */
  async executeCommand(command, args = [], options = {}) {
    const { spawn } = require('child_process')
    
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: 'pipe',
        ...options
      })
      
      let stdout = ''
      let stderr = ''
      
      child.stdout.on('data', data => stdout += data.toString())
      child.stderr.on('data', data => stderr += data.toString())
      
      child.on('exit', (code, signal) => {
        resolve({
          exitCode: code,
          signal,
          stdout,
          stderr,
          success: code === 0 && !signal
        })
      })
      
      child.on('error', reject)
      this.processes.push(child)
    })
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    // Kill processes
    for (const process of this.processes) {
      if (!process.killed) {
        process.kill('SIGTERM')
      }
    }
    this.processes = []
    
    // Remove temp directories
    for (const dir of this.tempDirs) {
      try {
        await fs.rm(dir, { recursive: true, force: true })
      } catch (error) {
        console.warn(`Failed to cleanup temp dir ${dir}: ${error.message}`)
      }
    }
    this.tempDirs = []
  }
}

// Create global instances for convenience
const assert = Assertions
const mockManager = new MockManager()
const integrationHelper = new IntegrationTestHelper()

// Cleanup on process exit
process.on('exit', () => {
  mockManager.restoreAll()
  integrationHelper.cleanup().catch(console.error)
})

module.exports = {
  TestRunner,
  TestSuite,
  TestCase,
  TestResult,
  Assertions,
  MockManager,
  IntegrationTestHelper,
  assert,
  mockManager,
  integrationHelper
}