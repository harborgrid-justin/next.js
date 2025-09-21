/**
 * Performance Benchmarking Suite
 * Comprehensive benchmarks for enterprise utilities
 */

const { performance } = require('perf_hooks')
const { getLogger } = require('../utils/logger')
const { getProcessManager } = require('../utils/process-manager')
const { getPerformanceManager } = require('../utils/performance')
const { loadConfig } = require('../utils/config-manager')
const { TestRunner, assert } = require('../utils/testing')

/**
 * Benchmark runner with statistical analysis
 */
class BenchmarkRunner {
  constructor() {
    this.results = new Map()
    this.logger = getLogger('Benchmark')
  }

  /**
   * Run a benchmark multiple times and collect statistics
   */
  async benchmark(name, fn, iterations = 100, warmupIterations = 10) {
    this.logger.info(`Starting benchmark: ${name}`)
    
    // Warmup runs
    for (let i = 0; i < warmupIterations; i++) {
      try {
        await fn()
      } catch (error) {
        this.logger.warn(`Warmup iteration ${i} failed:`, error.message)
      }
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc()
    }

    const durations = []
    const errors = []
    let memoryBefore = process.memoryUsage()

    // Actual benchmark runs
    for (let i = 0; i < iterations; i++) {
      const start = performance.now()
      
      try {
        await fn()
        const duration = performance.now() - start
        durations.push(duration)
      } catch (error) {
        errors.push(error)
        this.logger.warn(`Benchmark iteration ${i} failed:`, error.message)
      }
    }

    const memoryAfter = process.memoryUsage()
    const stats = this.calculateStats(durations)
    
    const result = {
      name,
      iterations: durations.length,
      errors: errors.length,
      stats,
      memory: {
        heapUsedDelta: memoryAfter.heapUsed - memoryBefore.heapUsed,
        heapTotalDelta: memoryAfter.heapTotal - memoryBefore.heapTotal,
        rssDelta: memoryAfter.rss - memoryBefore.rss
      }
    }

    this.results.set(name, result)
    this.logger.info(`Benchmark completed: ${name}`, {
      mean: stats.mean.toFixed(2) + 'ms',
      p95: stats.p95.toFixed(2) + 'ms',
      errors: errors.length
    })

    return result
  }

  /**
   * Calculate statistical measures
   */
  calculateStats(durations) {
    if (durations.length === 0) {
      return { count: 0, mean: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0, stddev: 0 }
    }

    const sorted = durations.slice().sort((a, b) => a - b)
    const count = sorted.length
    const sum = sorted.reduce((a, b) => a + b, 0)
    const mean = sum / count
    const min = sorted[0]
    const max = sorted[count - 1]

    // Percentiles
    const p50 = this.percentile(sorted, 50)
    const p95 = this.percentile(sorted, 95)
    const p99 = this.percentile(sorted, 99)

    // Standard deviation
    const variance = sorted.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / count
    const stddev = Math.sqrt(variance)

    return { count, mean, min, max, p50, p95, p99, stddev }
  }

  /**
   * Calculate percentile
   */
  percentile(sorted, p) {
    const index = (p / 100) * (sorted.length - 1)
    const lower = Math.floor(index)
    const upper = Math.ceil(index)
    
    if (lower === upper) {
      return sorted[lower]
    }
    
    const weight = index - lower
    return sorted[lower] * (1 - weight) + sorted[upper] * weight
  }

  /**
   * Generate benchmark report
   */
  generateReport() {
    const report = ['📊 Benchmark Results', '=' .repeat(50)]

    for (const [name, result] of this.results) {
      report.push(`\n🔬 ${name}`)
      report.push(`   Iterations: ${result.iterations}`)
      report.push(`   Errors: ${result.errors}`)
      report.push(`   Mean: ${result.stats.mean.toFixed(2)}ms`)
      report.push(`   Min: ${result.stats.min.toFixed(2)}ms`)
      report.push(`   Max: ${result.stats.max.toFixed(2)}ms`)
      report.push(`   P95: ${result.stats.p95.toFixed(2)}ms`)
      report.push(`   StdDev: ${result.stats.stddev.toFixed(2)}ms`)
      report.push(`   Heap Delta: ${(result.memory.heapUsedDelta / 1024 / 1024).toFixed(2)}MB`)
    }

    // Performance rating
    const overallScore = this.calculateOverallScore()
    report.push(`\n🏆 Overall Performance Score: ${overallScore.toFixed(1)}/100`)
    report.push(this.getPerformanceRating(overallScore))

    return report.join('\n')
  }

  /**
   * Calculate overall performance score
   */
  calculateOverallScore() {
    if (this.results.size === 0) return 0

    let totalScore = 0
    for (const result of this.results.values()) {
      // Score based on speed (lower is better) and error rate
      const speedScore = Math.max(0, 100 - result.stats.mean)
      const errorScore = Math.max(0, 100 - (result.errors / result.iterations) * 100)
      const benchmarkScore = (speedScore + errorScore) / 2
      totalScore += benchmarkScore
    }

    return totalScore / this.results.size
  }

  /**
   * Get performance rating description
   */
  getPerformanceRating(score) {
    if (score >= 90) return '🚀 Excellent performance!'
    if (score >= 80) return '✅ Good performance'
    if (score >= 70) return '⚠️  Acceptable performance'
    if (score >= 60) return '🐌 Below average performance'
    return '❌ Poor performance - optimization needed'
  }
}

/**
 * Benchmark suite for enterprise utilities
 */
async function runBenchmarkSuite() {
  const benchmark = new BenchmarkRunner()
  const logger = getLogger('BenchmarkSuite')

  logger.info('🚀 Starting enterprise utilities benchmark suite')

  try {
    // Configuration loading benchmark
    await benchmark.benchmark('config-loading', async () => {
      await loadConfig('benchmark-test', {
        defaults: { timeout: 1000, retries: 3 }
      })
    }, 50, 5)

    // Logger performance benchmark
    await benchmark.benchmark('logger-performance', async () => {
      const testLogger = getLogger('benchmark-test')
      testLogger.info('Test message', { data: { key: 'value' } })
    }, 100, 10)

    // Process execution benchmark (mock)
    await benchmark.benchmark('process-simulation', async () => {
      // Simulate process execution without actual system calls
      await new Promise(resolve => setTimeout(resolve, Math.random() * 10))
    }, 50, 5)

    // Performance monitoring benchmark
    await benchmark.benchmark('performance-monitoring', async () => {
      const perf = getPerformanceManager()
      const timer = perf.collector.timer('test-operation')
      await new Promise(resolve => setTimeout(resolve, 1))
      timer.end()
      perf.collector.counter('test-counter')
      perf.collector.gauge('test-gauge', Math.random() * 100)
    }, 100, 10)

    // Generate and display report
    const report = benchmark.generateReport()
    console.log('\n' + report)

    return benchmark.results

  } catch (error) {
    logger.error('Benchmark suite failed:', error.message)
    throw error
  }
}

/**
 * Example usage and integration tests
 */
async function runExamples() {
  const logger = getLogger('Examples')
  
  logger.info('🔧 Running enterprise utilities examples')

  try {
    // Example 1: Configuration Management
    logger.info('📋 Example 1: Configuration Management')
    
    const config = await loadConfig('example-app', {
      defaults: {
        appName: 'next-app',
        timeout: 30000,
        retries: 3,
        debug: false
      }
    })
    
    logger.info('Loaded configuration:', config)

    // Example 2: Performance Monitoring
    logger.info('📊 Example 2: Performance Monitoring')
    
    const perf = getPerformanceManager()
    
    // Wrap a function for automatic performance tracking
    const processData = perf.wrap('data-processing', async (data) => {
      // Simulate data processing
      await new Promise(resolve => setTimeout(resolve, Math.random() * 50))
      return data.map(item => item * 2)
    })
    
    const results = await Promise.all([
      processData([1, 2, 3]),
      processData([4, 5, 6]),
      processData([7, 8, 9])
    ])
    
    logger.info('Data processing completed:', {
      batches: results.length,
      totalItems: results.flat().length
    })

    // Example 3: Testing Framework
    logger.info('🧪 Example 3: Testing Framework')
    
    const testRunner = new TestRunner({ verbose: false })
    
    testRunner.describe('Example Tests', 'Demonstration of testing capabilities', () => {
      testRunner.it('should perform basic assertions', async () => {
        assert.assertEqual(2 + 2, 4, 'Basic math should work')
        assert.assertTrue(Array.isArray([1, 2, 3]), 'Array should be recognized')
        assert.assertContains('hello world', 'world', 'String should contain substring')
      })
      
      testRunner.it('should handle async operations', async () => {
        const result = await Promise.resolve('async-result')
        assert.assertEqual(result, 'async-result', 'Async operation should complete')
      })
      
      testRunner.it('should test error conditions', async () => {
        await assert.assertThrowsAsync(
          () => Promise.reject(new Error('Expected error')),
          'Expected error',
          'Should throw expected error'
        )
      })
    })
    
    const testStats = await testRunner.run()
    logger.info('Test execution completed:', {
      total: testStats.total,
      passed: testStats.passed,
      failed: testStats.failed,
      passRate: `${(testStats.total > 0 ? (testStats.passed / testStats.total * 100) : 0).toFixed(1)}%`
    })

    logger.info('✅ All examples completed successfully')
    
  } catch (error) {
    logger.error('❌ Example execution failed:', error.message)
    throw error
  }
}

/**
 * Main benchmark execution
 */
async function main() {
  console.log('🚀 Enterprise Utilities Benchmark & Examples Suite')
  console.log('=' .repeat(60))

  try {
    // Run examples first
    await runExamples()
    
    console.log('\n' + '=' .repeat(60))
    
    // Run benchmarks
    const benchmarkResults = await runBenchmarkSuite()
    
    console.log('\n✅ Benchmark suite completed successfully!')
    console.log(`📊 Total benchmarks: ${benchmarkResults.size}`)
    
    // Performance recommendations
    console.log('\n💡 Performance Recommendations:')
    console.log('  • Monitor memory usage patterns')
    console.log('  • Use connection pooling for I/O operations')
    console.log('  • Implement caching for frequently accessed data')
    console.log('  • Profile critical paths in production')
    
  } catch (error) {
    console.error('\n💥 Suite execution failed:')
    console.error(error.message)
    if (process.env.DEBUG) {
      console.error(error.stack)
    }
    process.exit(1)
  }
}

// Execute if this is the main module
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}

module.exports = {
  BenchmarkRunner,
  runBenchmarkSuite,
  runExamples
}