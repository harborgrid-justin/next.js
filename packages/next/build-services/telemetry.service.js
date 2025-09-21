/**
 * Telemetry Service
 * Standalone telemetry collection and reporting service
 * SOA Improvement: Modular telemetry service extraction
 */

/**
 * Base Telemetry Service
 */
class TelemetryService {
  constructor(options = {}) {
    this.enabled = options.enabled !== false
    this.collectors = new Map()
    this.processors = []
    this.reporters = []
    this.buffer = []
    this.maxBufferSize = options.maxBufferSize || 1000
  }

  /**
   * Register a telemetry data collector
   * @param {string} name - Collector name
   * @param {Function} collector - Collector function
   */
  registerCollector(name, collector) {
    this.collectors.set(name, collector)
    return this
  }

  /**
   * Register a telemetry data processor
   * @param {Function} processor - Processing function
   */
  registerProcessor(processor) {
    this.processors.push(processor)
    return this
  }

  /**
   * Register a telemetry reporter
   * @param {Function} reporter - Reporting function
   */
  registerReporter(reporter) {
    this.reporters.push(reporter)
    return this
  }

  /**
   * Collect telemetry data
   * @param {string} event - Event name
   * @param {Object} data - Event data
   * @param {Object} metadata - Event metadata
   */
  async collect(event, data = {}, metadata = {}) {
    if (!this.enabled) return

    const telemetryEvent = {
      event,
      data,
      metadata: {
        timestamp: Date.now(),
        sessionId: this.getSessionId(),
        ...metadata
      }
    }

    // Run collectors
    for (const [name, collector] of this.collectors) {
      try {
        const collectedData = await collector(telemetryEvent)
        if (collectedData) {
          telemetryEvent.data = { ...telemetryEvent.data, ...collectedData }
        }
      } catch (error) {
        console.warn(`Telemetry collector ${name} failed:`, error)
      }
    }

    // Process the event
    let processedEvent = telemetryEvent
    for (const processor of this.processors) {
      try {
        processedEvent = await processor(processedEvent) || processedEvent
      } catch (error) {
        console.warn('Telemetry processor failed:', error)
      }
    }

    // Add to buffer
    this.addToBuffer(processedEvent)
  }

  /**
   * Add event to buffer and manage buffer size
   */
  addToBuffer(event) {
    this.buffer.push(event)
    
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift() // Remove oldest event
    }
  }

  /**
   * Flush buffered telemetry data to reporters
   */
  async flush() {
    if (!this.enabled || this.buffer.length === 0) return

    const events = [...this.buffer]
    this.buffer = []

    for (const reporter of this.reporters) {
      try {
        await reporter(events)
      } catch (error) {
        console.warn('Telemetry reporter failed:', error)
      }
    }
  }

  /**
   * Get or generate session ID
   */
  getSessionId() {
    if (!this.sessionId) {
      this.sessionId = this.generateSessionId()
    }
    return this.sessionId
  }

  /**
   * Generate unique session ID
   */
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Enable telemetry collection
   */
  enable() {
    this.enabled = true
  }

  /**
   * Disable telemetry collection
   */
  disable() {
    this.enabled = false
  }

  /**
   * Get current telemetry status
   */
  getStatus() {
    return {
      enabled: this.enabled,
      collectorsCount: this.collectors.size,
      processorsCount: this.processors.length,
      reportersCount: this.reporters.length,
      bufferSize: this.buffer.length,
      sessionId: this.sessionId
    }
  }
}

/**
 * Performance Telemetry Service
 */
class PerformanceTelemetryService extends TelemetryService {
  constructor(options = {}) {
    super(options)
    this.setupPerformanceCollectors()
  }

  setupPerformanceCollectors() {
    // Build performance collector
    this.registerCollector('build-performance', (event) => {
      if (event.event.startsWith('build:')) {
        return {
          buildTime: event.metadata.duration || 0,
          memoryUsage: process.memoryUsage(),
          cpuUsage: process.cpuUsage()
        }
      }
    })

    // Runtime performance collector
    this.registerCollector('runtime-performance', (event) => {
      if (event.event.startsWith('render:') || event.event.startsWith('request:')) {
        return {
          responseTime: event.metadata.duration || 0,
          memoryUsage: process.memoryUsage().heapUsed,
          requestCount: event.data.requestCount || 1
        }
      }
    })

    // Bundle size collector
    this.registerCollector('bundle-size', (event) => {
      if (event.event === 'build:bundle-generated') {
        return {
          bundleSize: event.data.size || 0,
          chunkCount: event.data.chunks?.length || 0,
          compressionRatio: event.data.compressionRatio || 1
        }
      }
    })
  }

  /**
   * Track build performance
   */
  async trackBuildPerformance(buildType, duration, metadata = {}) {
    await this.collect(`build:${buildType}`, {
      buildType,
      duration
    }, {
      duration,
      ...metadata
    })
  }

  /**
   * Track runtime performance
   */
  async trackRuntimePerformance(operation, duration, metadata = {}) {
    await this.collect(`runtime:${operation}`, {
      operation,
      duration
    }, {
      duration,
      ...metadata
    })
  }
}

/**
 * Next.js specific Telemetry Service
 */
class NextJSTelemetryService extends PerformanceTelemetryService {
  constructor(options = {}) {
    super(options)
    this.setupNextJSCollectors()
    this.setupNextJSReporters()
  }

  setupNextJSCollectors() {
    // Next.js feature usage collector
    this.registerCollector('nextjs-features', (event) => {
      const features = {
        hasAppRouter: event.data.hasAppRouter || false,
        hasMiddleware: event.data.hasMiddleware || false,
        hasServerComponents: event.data.hasServerComponents || false,
        hasClientComponents: event.data.hasClientComponents || false,
        hasApiRoutes: event.data.hasApiRoutes || false,
        hasImageOptimization: event.data.hasImageOptimization || false,
        hasInternationalization: event.data.hasInternationalization || false
      }
      
      return { nextjsFeatures: features }
    })

    // Build configuration collector
    this.registerCollector('build-config', (event) => {
      if (event.event === 'build:started' || event.event === 'build:completed') {
        return {
          buildConfig: {
            target: event.data.target || 'server',
            minify: event.data.minify || false,
            sourceMaps: event.data.sourceMaps || false,
            experimental: Object.keys(event.data.experimental || {})
          }
        }
      }
    })
  }

  setupNextJSReporters() {
    // Console reporter (for development)
    this.registerReporter(async (events) => {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Next.js Telemetry] Collected ${events.length} events`)
      }
    })

    // File reporter (for analysis)
    this.registerReporter(async (events) => {
      if (process.env.NEXT_TELEMETRY_DEBUG) {
        const fs = require('fs').promises
        const path = require('path')
        
        const logFile = path.join(process.cwd(), '.next', 'telemetry.json')
        await fs.writeFile(logFile, JSON.stringify(events, null, 2))
      }
    })
  }

  /**
   * Track Next.js specific events
   */
  async trackNextJSEvent(eventName, data = {}) {
    await this.collect(`nextjs:${eventName}`, data)
  }

  /**
   * Track page navigation
   */
  async trackPageNavigation(route, metadata = {}) {
    await this.collect('nextjs:page-navigation', {
      route,
      ...metadata
    })
  }

  /**
   * Track API route usage
   */
  async trackAPIRoute(route, method, responseTime) {
    await this.collect('nextjs:api-route', {
      route,
      method,
      responseTime
    })
  }
}

module.exports = { 
  TelemetryService, 
  PerformanceTelemetryService,
  NextJSTelemetryService 
}