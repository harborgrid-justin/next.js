/**
 * Testing Orchestration Service
 * Centralized test execution management service
 * SOA Improvement: Modular testing orchestration
 */

const EventEmitter = require('events')
const path = require('path')

/**
 * Test Suite
 */
class TestSuite {
  constructor(name, options = {}) {
    this.name = name
    this.testFiles = []
    this.config = options.config || {}
    this.timeout = options.timeout || 30000
    this.retries = options.retries || 0
    this.parallel = options.parallel !== false
  }

  addTestFile(filePath) {
    this.testFiles.push(filePath)
    return this
  }

  addTestFiles(filePaths) {
    this.testFiles.push(...filePaths)
    return this
  }
}

/**
 * Testing Orchestration Service
 */
class TestingOrchestrationService extends EventEmitter {
  constructor(options = {}) {
    super()
    this.testSuites = new Map()
    this.runners = new Map()
    this.results = new Map()
    this.config = options.config || {}
    this.parallel = options.parallel !== false
    this.maxConcurrency = options.maxConcurrency || 4
  }

  /**
   * Register a test suite
   * @param {TestSuite} testSuite - Test suite to register
   */
  registerTestSuite(testSuite) {
    this.testSuites.set(testSuite.name, testSuite)
    return this
  }

  /**
   * Register a test runner
   * @param {string} type - Runner type (jest, mocha, etc.)
   * @param {Function} runner - Runner function
   */
  registerRunner(type, runner) {
    this.runners.set(type, runner)
    return this
  }

  /**
   * Run all test suites
   */
  async runAll() {
    this.emit('test-run-start')
    
    const startTime = Date.now()
    const suiteResults = []

    try {
      if (this.parallel) {
        suiteResults.push(...await this.runSuitesInParallel())
      } else {
        suiteResults.push(...await this.runSuitesSequentially())
      }

      const overallResult = this.aggregateResults(suiteResults, startTime)
      this.emit('test-run-complete', overallResult)
      
      return overallResult

    } catch (error) {
      this.emit('test-run-error', error)
      throw error
    }
  }

  /**
   * Run specific test suite
   * @param {string} suiteName - Name of the test suite
   * @param {Object} options - Run options
   */
  async runSuite(suiteName, options = {}) {
    const testSuite = this.testSuites.get(suiteName)
    if (!testSuite) {
      throw new Error(`Test suite not found: ${suiteName}`)
    }

    this.emit('suite-start', suiteName)
    const startTime = Date.now()

    try {
      const result = await this.executeSuite(testSuite, options)
      
      result.duration = Date.now() - startTime
      this.results.set(suiteName, result)
      
      this.emit('suite-complete', suiteName, result)
      return result

    } catch (error) {
      this.emit('suite-error', suiteName, error)
      throw error
    }
  }

  /**
   * Run test suites in parallel
   */
  async runSuitesInParallel() {
    const suiteNames = Array.from(this.testSuites.keys())
    const chunks = this.chunkArray(suiteNames, this.maxConcurrency)
    const results = []

    for (const chunk of chunks) {
      const chunkPromises = chunk.map(suiteName => 
        this.runSuite(suiteName).catch(error => ({ error, suiteName }))
      )
      
      const chunkResults = await Promise.all(chunkPromises)
      results.push(...chunkResults)
    }

    return results
  }

  /**
   * Run test suites sequentially
   */
  async runSuitesSequentially() {
    const results = []
    
    for (const suiteName of this.testSuites.keys()) {
      try {
        const result = await this.runSuite(suiteName)
        results.push(result)
      } catch (error) {
        results.push({ error, suiteName })
      }
    }

    return results
  }

  /**
   * Execute individual test suite
   */
  async executeSuite(testSuite, options = {}) {
    const runner = this.getRunner(options.runner || 'default')
    
    const suiteConfig = {
      ...this.config,
      ...testSuite.config,
      ...options.config
    }

    return runner(testSuite, suiteConfig)
  }

  /**
   * Get test runner
   */
  getRunner(type) {
    const runner = this.runners.get(type)
    if (!runner) {
      throw new Error(`Test runner not found: ${type}`)
    }
    return runner
  }

  /**
   * Aggregate test results
   */
  aggregateResults(suiteResults, startTime) {
    const totalDuration = Date.now() - startTime
    const stats = {
      totalSuites: suiteResults.length,
      passedSuites: 0,
      failedSuites: 0,
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      duration: totalDuration,
      suiteResults: []
    }

    for (const result of suiteResults) {
      if (result.error) {
        stats.failedSuites++
      } else {
        stats.passedSuites++
        stats.totalTests += result.totalTests || 0
        stats.passedTests += result.passedTests || 0
        stats.failedTests += result.failedTests || 0
        stats.skippedTests += result.skippedTests || 0
      }
      
      stats.suiteResults.push(result)
    }

    stats.success = stats.failedSuites === 0 && stats.failedTests === 0

    return stats
  }

  /**
   * Chunk array for parallel processing
   */
  chunkArray(array, chunkSize) {
    const chunks = []
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize))
    }
    return chunks
  }

  /**
   * Get test results
   */
  getResults(suiteName) {
    if (suiteName) {
      return this.results.get(suiteName)
    }
    return Object.fromEntries(this.results)
  }

  /**
   * Clear results
   */
  clearResults() {
    this.results.clear()
  }
}

/**
 * Jest Test Runner
 */
class JestRunner {
  constructor(options = {}) {
    this.jestConfig = options.jestConfig || {}
  }

  async run(testSuite, config = {}) {
    const jest = require('jest')
    
    const jestOptions = {
      ...this.jestConfig,
      ...config.jest,
      testPathPattern: testSuite.testFiles.join('|'),
      verbose: config.verbose !== false,
      collectCoverage: config.coverage === true,
      maxWorkers: testSuite.parallel ? config.maxWorkers : 1
    }

    try {
      const { results } = await jest.runCLI(jestOptions, [process.cwd()])
      
      return {
        success: results.success,
        totalTests: results.numTotalTests,
        passedTests: results.numPassedTests,
        failedTests: results.numFailedTests,
        skippedTests: results.numPendingTests,
        coverage: results.coverageMap,
        testResults: results.testResults
      }
    } catch (error) {
      throw new Error(`Jest execution failed: ${error.message}`)
    }
  }
}

/**
 * Mocha Test Runner
 */
class MochaRunner {
  constructor(options = {}) {
    this.mochaConfig = options.mochaConfig || {}
  }

  async run(testSuite, config = {}) {
    const Mocha = require('mocha')
    
    const mocha = new Mocha({
      ...this.mochaConfig,
      ...config.mocha,
      timeout: testSuite.timeout,
      retries: testSuite.retries
    })

    // Add test files
    testSuite.testFiles.forEach(file => {
      mocha.addFile(file)
    })

    return new Promise((resolve, reject) => {
      mocha.run((failures) => {
        const stats = mocha.stats || {}
        
        resolve({
          success: failures === 0,
          totalTests: stats.tests || 0,
          passedTests: stats.passes || 0,
          failedTests: stats.failures || 0,
          skippedTests: stats.pending || 0,
          duration: stats.duration || 0
        })
      })
    })
  }
}

/**
 * Next.js Testing Service
 */
class NextJSTestingService extends TestingOrchestrationService {
  constructor(options = {}) {
    super(options)
    this.setupNextJSRunners()
    this.setupNextJSTestSuites()
  }

  setupNextJSRunners() {
    // Register Jest runner with Next.js configuration
    this.registerRunner('jest', new JestRunner({
      jestConfig: {
        testEnvironment: 'jsdom',
        setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
        moduleNameMapping: {
          '^@/(.*)$': '<rootDir>/src/$1',
          '^@/components/(.*)$': '<rootDir>/components/$1',
          '^@/pages/(.*)$': '<rootDir>/pages/$1'
        },
        transform: {
          '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { presets: ['next/babel'] }]
        },
        moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
        collectCoverageFrom: [
          'src/**/*.{js,jsx,ts,tsx}',
          'pages/**/*.{js,jsx,ts,tsx}',
          'components/**/*.{js,jsx,ts,tsx}',
          '!**/*.d.ts',
          '!**/node_modules/**'
        ]
      }
    }))

    // Register custom Next.js test runner
    this.registerRunner('nextjs', this.createNextJSRunner())
  }

  setupNextJSTestSuites() {
    // Unit tests suite
    const unitTests = new TestSuite('unit', {
      config: { runner: 'jest', coverage: true },
      parallel: true
    })
    
    // Integration tests suite
    const integrationTests = new TestSuite('integration', {
      config: { runner: 'jest' },
      parallel: false
    })

    // E2E tests suite
    const e2eTests = new TestSuite('e2e', {
      config: { runner: 'nextjs' },
      parallel: false,
      timeout: 60000
    })

    this.registerTestSuite(unitTests)
    this.registerTestSuite(integrationTests)
    this.registerTestSuite(e2eTests)
  }

  createNextJSRunner() {
    return async (testSuite, config) => {
      // Mock Next.js E2E test runner
      // Would integrate with actual Next.js testing utilities
      return {
        success: true,
        totalTests: testSuite.testFiles.length,
        passedTests: testSuite.testFiles.length,
        failedTests: 0,
        skippedTests: 0,
        duration: 5000
      }
    }
  }

  /**
   * Discover test files automatically
   */
  async discoverTests() {
    const glob = require('glob')
    
    const patterns = [
      '**/__tests__/**/*.{js,jsx,ts,tsx}',
      '**/*.{test,spec}.{js,jsx,ts,tsx}',
      'tests/**/*.{js,jsx,ts,tsx}',
      'e2e/**/*.{js,jsx,ts,tsx}'
    ]

    const allTestFiles = []
    
    for (const pattern of patterns) {
      const files = await new Promise((resolve, reject) => {
        glob(pattern, { ignore: ['node_modules/**', '.next/**'] }, (err, matches) => {
          if (err) reject(err)
          else resolve(matches)
        })
      })
      
      allTestFiles.push(...files)
    }

    // Categorize tests
    const unitFiles = allTestFiles.filter(file => 
      file.includes('__tests__') || file.includes('.test.') || file.includes('.spec.')
    )
    
    const integrationFiles = allTestFiles.filter(file =>
      file.includes('integration') || file.includes('__integration__')
    )
    
    const e2eFiles = allTestFiles.filter(file =>
      file.includes('e2e') || file.includes('cypress') || file.includes('playwright')
    )

    // Update test suites
    this.testSuites.get('unit').addTestFiles(unitFiles)
    this.testSuites.get('integration').addTestFiles(integrationFiles)
    this.testSuites.get('e2e').addTestFiles(e2eFiles)

    return {
      unit: unitFiles,
      integration: integrationFiles,
      e2e: e2eFiles,
      total: allTestFiles.length
    }
  }

  /**
   * Run tests for specific Next.js features
   */
  async runFeatureTests(feature) {
    const featurePatterns = {
      'api-routes': '**/api/**/*.{test,spec}.{js,ts}',
      'pages': '**/pages/**/*.{test,spec}.{js,jsx,ts,tsx}',
      'components': '**/components/**/*.{test,spec}.{js,jsx,ts,tsx}',
      'middleware': '**/middleware*.{test,spec}.{js,ts}',
      'app-router': '**/app/**/*.{test,spec}.{js,jsx,ts,tsx}'
    }

    const pattern = featurePatterns[feature]
    if (!pattern) {
      throw new Error(`Unknown feature: ${feature}`)
    }

    const glob = require('glob')
    const testFiles = await new Promise((resolve, reject) => {
      glob(pattern, { ignore: ['node_modules/**'] }, (err, matches) => {
        if (err) reject(err)
        else resolve(matches)
      })
    })

    const featureSuite = new TestSuite(`feature-${feature}`)
    featureSuite.addTestFiles(testFiles)

    return this.executeSuite(featureSuite)
  }
}

module.exports = { 
  TestSuite,
  TestingOrchestrationService,
  JestRunner,
  MochaRunner,
  NextJSTestingService 
}