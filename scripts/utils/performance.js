/**
 * Enterprise Performance Optimization Utilities
 * Advanced performance monitoring, optimization, and caching strategies
 */

const { performance } = require('perf_hooks')
const { EventEmitter } = require('events')

/**
 * Performance metrics collector
 */
class PerformanceCollector extends EventEmitter {
  constructor() {
    super()
    this.metrics = new Map()
    this.timers = new Map()
    this.counters = new Map()
    this.histograms = new Map()
    this.startTime = performance.now()
    this.enabled = true
  }

  /**
   * Start a timer
   */
  timer(name, labels = {}) {
    if (!this.enabled) return

    const key = this.createKey(name, labels)
    this.timers.set(key, {
      name,
      labels,
      startTime: performance.now(),
      started: Date.now()
    })

    return {
      end: () => this.endTimer(key)
    }
  }

  /**
   * End a timer and record the duration
   */
  endTimer(key) {
    if (!this.enabled) return

    const timer = this.timers.get(key)
    if (!timer) return

    const duration = performance.now() - timer.startTime
    this.recordDuration(timer.name, duration, timer.labels)
    this.timers.delete(key)

    this.emit('timer:end', {
      name: timer.name,
      duration,
      labels: timer.labels
    })

    return duration
  }

  /**
   * Record a duration metric
   */
  recordDuration(name, duration, labels = {}) {
    if (!this.enabled) return

    if (!this.histograms.has(name)) {
      this.histograms.set(name, {
        name,
        values: [],
        sum: 0,
        count: 0,
        min: Infinity,
        max: -Infinity
      })
    }

    const histogram = this.histograms.get(name)
    histogram.values.push({ value: duration, labels, timestamp: Date.now() })
    histogram.sum += duration
    histogram.count++
    histogram.min = Math.min(histogram.min, duration)
    histogram.max = Math.max(histogram.max, duration)

    // Keep only recent values (last 1000)
    if (histogram.values.length > 1000) {
      const removed = histogram.values.shift()
      histogram.sum -= removed.value
      histogram.count--
    }
  }

  /**
   * Increment a counter
   */
  counter(name, increment = 1, labels = {}) {
    if (!this.enabled) return

    const key = this.createKey(name, labels)
    const current = this.counters.get(key) || { name, labels, value: 0 }
    current.value += increment
    this.counters.set(key, current)

    this.emit('counter:increment', {
      name,
      increment,
      total: current.value,
      labels
    })

    return current.value
  }

  /**
   * Record a gauge metric
   */
  gauge(name, value, labels = {}) {
    if (!this.enabled) return

    const key = this.createKey(name, labels)
    this.metrics.set(key, {
      name,
      labels,
      value,
      timestamp: Date.now(),
      type: 'gauge'
    })

    this.emit('gauge:set', { name, value, labels })
  }

  /**
   * Create a unique key for metrics
   */
  createKey(name, labels) {
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',')
    
    return labelStr ? `${name}{${labelStr}}` : name
  }

  /**
   * Get histogram statistics
   */
  getHistogramStats(name) {
    const histogram = this.histograms.get(name)
    if (!histogram) return null

    const values = histogram.values.map(v => v.value).sort((a, b) => a - b)
    const count = values.length

    if (count === 0) return null

    return {
      name,
      count: histogram.count,
      sum: histogram.sum,
      min: histogram.min,
      max: histogram.max,
      mean: histogram.sum / histogram.count,
      p50: this.percentile(values, 50),
      p90: this.percentile(values, 90),
      p95: this.percentile(values, 95),
      p99: this.percentile(values, 99)
    }
  }

  /**
   * Calculate percentile
   */
  percentile(values, p) {
    const index = (p / 100) * (values.length - 1)
    const lower = Math.floor(index)
    const upper = Math.ceil(index)
    
    if (lower === upper) {
      return values[lower]
    }
    
    const weight = index - lower
    return values[lower] * (1 - weight) + values[upper] * weight
  }

  /**
   * Get all metrics
   */
  getAllMetrics() {
    const result = {
      uptime: performance.now() - this.startTime,
      counters: {},
      gauges: {},
      histograms: {}
    }

    // Counters
    for (const [key, counter] of this.counters) {
      result.counters[key] = counter.value
    }

    // Gauges
    for (const [key, metric] of this.metrics) {
      if (metric.type === 'gauge') {
        result.gauges[key] = metric.value
      }
    }

    // Histograms
    for (const name of this.histograms.keys()) {
      result.histograms[name] = this.getHistogramStats(name)
    }

    return result
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics.clear()
    this.timers.clear()
    this.counters.clear()
    this.histograms.clear()
    this.startTime = performance.now()
  }

  /**
   * Enable or disable collection
   */
  setEnabled(enabled) {
    this.enabled = enabled
  }
}

/**
 * Memory optimization utilities
 */
class MemoryOptimizer {
  constructor() {
    this.objectPools = new Map()
    this.weakRefs = new Set()
  }

  /**
   * Create an object pool for reusing expensive objects
   */
  createPool(name, factory, maxSize = 100) {
    const pool = {
      objects: [],
      factory,
      maxSize,
      created: 0,
      reused: 0
    }

    this.objectPools.set(name, pool)
    return pool
  }

  /**
   * Get an object from the pool
   */
  getFromPool(name) {
    const pool = this.objectPools.get(name)
    if (!pool) {
      throw new Error(`Pool '${name}' not found`)
    }

    if (pool.objects.length > 0) {
      pool.reused++
      return pool.objects.pop()
    }

    pool.created++
    return pool.factory()
  }

  /**
   * Return an object to the pool
   */
  returnToPool(name, obj) {
    const pool = this.objectPools.get(name)
    if (!pool) return

    if (pool.objects.length < pool.maxSize) {
      // Reset object properties if it has a reset method
      if (typeof obj.reset === 'function') {
        obj.reset()
      }
      pool.objects.push(obj)
    }
  }

  /**
   * Get pool statistics
   */
  getPoolStats() {
    const stats = {}
    for (const [name, pool] of this.objectPools) {
      stats[name] = {
        available: pool.objects.length,
        created: pool.created,
        reused: pool.reused,
        reuseRate: pool.reused / (pool.created + pool.reused) || 0
      }
    }
    return stats
  }

  /**
   * Create a weak reference that can be garbage collected
   */
  createWeakRef(obj, callback) {
    if (typeof WeakRef === 'undefined') {
      return obj // Fallback for older Node.js versions
    }

    const ref = new WeakRef(obj)
    if (callback) {
      const registry = new FinalizationRegistry(callback)
      registry.register(obj, obj)
      this.weakRefs.add(registry)
    }
    
    return ref
  }

  /**
   * Force garbage collection if available
   */
  forceGC() {
    if (global.gc) {
      global.gc()
      return true
    }
    return false
  }

  /**
   * Get memory usage information
   */
  getMemoryUsage() {
    const usage = process.memoryUsage()
    return {
      rss: usage.rss,
      heapTotal: usage.heapTotal,
      heapUsed: usage.heapUsed,
      external: usage.external,
      arrayBuffers: usage.arrayBuffers,
      heapUtilization: usage.heapUsed / usage.heapTotal
    }
  }
}

/**
 * CPU optimization utilities
 */
class CPUOptimizer {
  constructor() {
    this.taskQueue = []
    this.processing = false
    this.maxTasksPerTick = 10
    this.taskPriorities = new Map()
  }

  /**
   * Schedule a task with priority
   */
  scheduleTask(task, priority = 0) {
    return new Promise((resolve, reject) => {
      this.taskQueue.push({
        task,
        priority,
        resolve,
        reject,
        scheduled: Date.now()
      })

      this.taskQueue.sort((a, b) => b.priority - a.priority)
      this.processQueue()
    })
  }

  /**
   * Process the task queue
   */
  async processQueue() {
    if (this.processing || this.taskQueue.length === 0) {
      return
    }

    this.processing = true

    while (this.taskQueue.length > 0) {
      const batch = this.taskQueue.splice(0, this.maxTasksPerTick)
      
      await Promise.all(batch.map(async ({ task, resolve, reject }) => {
        try {
          const result = await task()
          resolve(result)
        } catch (error) {
          reject(error)
        }
      }))

      // Yield control to event loop
      await new Promise(resolve => setImmediate(resolve))
    }

    this.processing = false
  }

  /**
   * Debounce function calls
   */
  debounce(func, delay) {
    let timeoutId
    return (...args) => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => func.apply(this, args), delay)
    }
  }

  /**
   * Throttle function calls
   */
  throttle(func, limit) {
    let inThrottle
    return (...args) => {
      if (!inThrottle) {
        func.apply(this, args)
        inThrottle = true
        setTimeout(() => inThrottle = false, limit)
      }
    }
  }

  /**
   * Batch multiple calls into one
   */
  batchCalls(func, batchSize = 10, delay = 100) {
    let batch = []
    let timeoutId

    return (item) => {
      batch.push(item)

      if (batch.length >= batchSize) {
        clearTimeout(timeoutId)
        func(batch)
        batch = []
      } else if (batch.length === 1) {
        timeoutId = setTimeout(() => {
          if (batch.length > 0) {
            func(batch)
            batch = []
          }
        }, delay)
      }
    }
  }
}

/**
 * I/O optimization utilities
 */
class IOOptimizer {
  constructor() {
    this.readCache = new Map()
    this.writeQueue = []
    this.maxCacheSize = 100
    this.flushInterval = 5000
    
    this.startFlushTimer()
  }

  /**
   * Cached file read with TTL
   */
  async cachedRead(filePath, ttl = 60000) {
    const cached = this.readCache.get(filePath)
    
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.data
    }

    const fs = require('fs').promises
    const data = await fs.readFile(filePath, 'utf8')
    
    // Manage cache size
    if (this.readCache.size >= this.maxCacheSize) {
      const firstKey = this.readCache.keys().next().value
      this.readCache.delete(firstKey)
    }

    this.readCache.set(filePath, {
      data,
      timestamp: Date.now()
    })

    return data
  }

  /**
   * Batch write operations
   */
  async batchWrite(filePath, data, append = false) {
    return new Promise((resolve, reject) => {
      this.writeQueue.push({
        filePath,
        data,
        append,
        resolve,
        reject,
        timestamp: Date.now()
      })
    })
  }

  /**
   * Flush write queue to disk
   */
  async flushWrites() {
    if (this.writeQueue.length === 0) return

    const fs = require('fs').promises
    const batches = new Map()

    // Group writes by file path
    for (const write of this.writeQueue) {
      if (!batches.has(write.filePath)) {
        batches.set(write.filePath, [])
      }
      batches.get(write.filePath).push(write)
    }

    // Process each batch
    for (const [filePath, writes] of batches) {
      try {
        if (writes[0].append) {
          // Append mode - concatenate all data
          const combinedData = writes.map(w => w.data).join('')
          await fs.appendFile(filePath, combinedData)
        } else {
          // Write mode - use last data
          const lastWrite = writes[writes.length - 1]
          await fs.writeFile(filePath, lastWrite.data)
        }

        // Resolve all promises for this file
        writes.forEach(write => write.resolve())
      } catch (error) {
        // Reject all promises for this file
        writes.forEach(write => write.reject(error))
      }
    }

    this.writeQueue = []
  }

  /**
   * Start automatic flush timer
   */
  startFlushTimer() {
    setInterval(() => {
      this.flushWrites().catch(console.error)
    }, this.flushInterval)
  }

  /**
   * Clear read cache
   */
  clearCache() {
    this.readCache.clear()
  }

  /**
   * Get I/O statistics
   */
  getStats() {
    return {
      cacheSize: this.readCache.size,
      queueSize: this.writeQueue.length,
      maxCacheSize: this.maxCacheSize
    }
  }
}

/**
 * Main performance manager
 */
class PerformanceManager {
  constructor(options = {}) {
    this.collector = new PerformanceCollector()
    this.memoryOptimizer = new MemoryOptimizer()
    this.cpuOptimizer = new CPUOptimizer()
    this.ioOptimizer = new IOOptimizer()
    
    this.monitoringEnabled = options.monitoring !== false
    this.reportInterval = options.reportInterval || 60000 // 1 minute
    
    if (this.monitoringEnabled) {
      this.startMonitoring()
    }
  }

  /**
   * Start performance monitoring
   */
  startMonitoring() {
    setInterval(() => {
      this.collectSystemMetrics()
    }, this.reportInterval)

    // Monitor memory usage
    setInterval(() => {
      const memUsage = this.memoryOptimizer.getMemoryUsage()
      this.collector.gauge('memory.heap.used', memUsage.heapUsed)
      this.collector.gauge('memory.heap.total', memUsage.heapTotal)
      this.collector.gauge('memory.heap.utilization', memUsage.heapUtilization)
      this.collector.gauge('memory.rss', memUsage.rss)
      
      // Trigger GC if memory usage is high
      if (memUsage.heapUtilization > 0.8) {
        this.memoryOptimizer.forceGC()
      }
    }, 10000)
  }

  /**
   * Collect system-level metrics
   */
  collectSystemMetrics() {
    // CPU usage
    const cpuUsage = process.cpuUsage()
    this.collector.gauge('cpu.user', cpuUsage.user)
    this.collector.gauge('cpu.system', cpuUsage.system)

    // Event loop lag
    const start = process.hrtime.bigint()
    setImmediate(() => {
      const lag = Number(process.hrtime.bigint() - start) / 1000000
      this.collector.gauge('event_loop.lag', lag)
    })

    // Active handles and requests
    this.collector.gauge('handles.active', (process as any)._getActiveHandles().length)
    this.collector.gauge('requests.active', (process as any)._getActiveRequests().length)
  }

  /**
   * Create a performance wrapper for functions
   */
  wrap(name, func) {
    return async (...args) => {
      const timer = this.collector.timer(name)
      try {
        this.collector.counter(`${name}.calls`)
        const result = await func(...args)
        this.collector.counter(`${name}.success`)
        return result
      } catch (error) {
        this.collector.counter(`${name}.errors`)
        throw error
      } finally {
        timer.end()
      }
    }
  }

  /**
   * Get comprehensive performance report
   */
  getReport() {
    return {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      metrics: this.collector.getAllMetrics(),
      memory: this.memoryOptimizer.getMemoryUsage(),
      pools: this.memoryOptimizer.getPoolStats(),
      io: this.ioOptimizer.getStats()
    }
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheusMetrics() {
    const metrics = this.collector.getAllMetrics()
    let output = ''

    // Counters
    for (const [name, value] of Object.entries(metrics.counters)) {
      output += `# TYPE ${name} counter\n`
      output += `${name} ${value}\n\n`
    }

    // Gauges
    for (const [name, value] of Object.entries(metrics.gauges)) {
      output += `# TYPE ${name} gauge\n`
      output += `${name} ${value}\n\n`
    }

    // Histograms
    for (const [name, stats] of Object.entries(metrics.histograms)) {
      if (!stats) continue
      
      output += `# TYPE ${name} histogram\n`
      output += `${name}_count ${stats.count}\n`
      output += `${name}_sum ${stats.sum}\n`
      output += `${name}_bucket{le="50"} ${stats.p50}\n`
      output += `${name}_bucket{le="90"} ${stats.p90}\n`
      output += `${name}_bucket{le="95"} ${stats.p95}\n`
      output += `${name}_bucket{le="99"} ${stats.p99}\n`
      output += `${name}_bucket{le="+Inf"} ${stats.count}\n\n`
    }

    return output
  }
}

// Global instance
let globalPerformanceManager = null

/**
 * Get global performance manager
 */
function getPerformanceManager(options) {
  if (!globalPerformanceManager) {
    globalPerformanceManager = new PerformanceManager(options)
  }
  return globalPerformanceManager
}

module.exports = {
  PerformanceCollector,
  MemoryOptimizer,
  CPUOptimizer,
  IOOptimizer,
  PerformanceManager,
  getPerformanceManager
}