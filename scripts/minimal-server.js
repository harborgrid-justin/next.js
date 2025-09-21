/**
 * Enterprise Minimal Next.js Server
 * Production-ready minimal server with enhanced monitoring, security, and performance
 */

const path = require('path')
const http = require('http')

// Performance monitoring setup
console.time('next-wall-time')

/**
 * Configuration management with validation
 */
class ServerConfig {
  constructor() {
    this.nodeEnv = process.env.NODE_ENV || 'production'
    this.prebundledReact = process.env.__NEXT_PRIVATE_PREBUNDLED_REACT || 'next'
    this.port = parseInt(process.env.PORT || '3000', 10)
    this.host = process.env.HOST || 'localhost'
    this.appDir = process.argv[2]
    this.targetPage = process.argv[3] || ''
    
    // Monitoring flags
    this.logRequire = process.env.LOG_REQUIRE === 'true'
    this.logCompile = process.env.LOG_COMPILE === 'true'
    this.logReadFile = process.env.LOG_READFILE === 'true'
    this.useBundledNext = process.env.USE_BUNDLED_NEXT === 'true'
    
    // Performance settings
    this.maxRequestTimeout = parseInt(process.env.MAX_REQUEST_TIMEOUT || '30000', 10)
    this.maxConcurrentRequests = parseInt(process.env.MAX_CONCURRENT_REQUESTS || '100', 10)
    
    this.validate()
  }

  validate() {
    if (!this.appDir) {
      throw new Error('Usage: node minimal-server.js <path-to-app-dir-build> [path-to-page]')
    }

    if (this.port < 1 || this.port > 65535) {
      throw new Error(`Invalid port: ${this.port}. Must be between 1 and 65535`)
    }

    if (this.maxRequestTimeout < 1000 || this.maxRequestTimeout > 300000) {
      throw new Error(`Invalid timeout: ${this.maxRequestTimeout}. Must be between 1000ms and 300000ms`)
    }

    try {
      this.absoluteAppDir = path.resolve(this.appDir)
      process.chdir(this.absoluteAppDir)
    } catch (error) {
      throw new Error(`Invalid app directory: ${this.appDir}. ${error.message}`)
    }
  }

  getDistDir() {
    return '.next'
  }

  getServerFilesPath() {
    return path.join(this.absoluteAppDir, this.getDistDir(), 'required-server-files.json')
  }
}

/**
 * Performance monitoring utilities
 */
class PerformanceMonitor {
  constructor(config) {
    this.config = config
    this.currentNode = null
    this.outliers = []
    this.stats = {
      readFileCount: 0,
      readFileSyncCount: 0,
      compileCount: 0,
      requestCount: 0,
      activeRequests: 0,
      errors: 0
    }
    
    this.setupMonitoring()
  }

  setupMonitoring() {
    if (this.config.logRequire) {
      this.setupRequireMonitoring()
    }
    
    if (this.config.logCompile) {
      this.setupCompileMonitoring()
    }
    
    if (this.config.logReadFile) {
      this.setupFileMonitoring()
    }
  }

  setupRequireMonitoring() {
    const originalCompile = require('module').prototype._compile
    
    require('module').prototype._compile = (content, filename) => {
      let parent = this.currentNode
      
      this.currentNode = {
        id: filename,
        selfDuration: 0,
        totalDuration: 0,
        children: []
      }
      
      const start = performance.now()
      const result = originalCompile.call(this, content, filename)
      const end = performance.now()
      
      this.currentNode.totalDuration = end - start
      this.currentNode.selfDuration = this.currentNode.children.reduce(
        (acc, child) => acc - child.selfDuration,
        this.currentNode.totalDuration
      )
      
      parent?.children.push(this.currentNode)
      this.currentNode = parent || this.currentNode
      
      return result
    }
  }

  setupCompileMonitoring() {
    const originalCompile = require('module').prototype._compile
    
    require('module').prototype._compile = function (content, filename) {
      const strippedFilename = filename.replace(process.cwd(), '')
      console.time(`Module '${strippedFilename}' compiled`)
      
      try {
        return originalCompile.apply(this, arguments)
      } finally {
        console.timeEnd(`Module '${strippedFilename}' compiled`)
        this.stats.compileCount++
      }
    }.bind(this)
  }

  setupFileMonitoring() {
    const originalReadFile = require('fs').readFile
    const originalReadFileSync = require('fs').readFileSync
    
    require('fs').readFile = (...args) => {
      this.stats.readFileCount++
      const filePath = args[0]
      if (typeof filePath === 'string') {
        console.log(`readFile: ${path.relative(this.config.absoluteAppDir, filePath)}`)
      }
      return originalReadFile.apply(this, args)
    }
    
    require('fs').readFileSync = (...args) => {
      this.stats.readFileSyncCount++
      const filePath = args[0]
      if (typeof filePath === 'string') {
        console.log(`readFileSync: ${path.relative(this.config.absoluteAppDir, filePath)}`)
      }
      return originalReadFileSync.apply(this, args)
    }
  }

  prettyPrint(node, distDir, prefix = '', isLast = false, isRoot = true) {
    const chalk = {
      yellow: (str) => `\x1b[33m${str}\x1b[0m`,
      green: (str) => `\x1b[32m${str}\x1b[0m`
    }
    
    let duration = `${node.selfDuration.toFixed(2)}ms / ${node.totalDuration.toFixed(2)}ms`
    
    if (node.selfDuration > 70) {
      duration = chalk.yellow(duration)
      this.outliers.push(node)
    }
    
    let output = `${prefix}${isLast || isRoot ? '└─ ' : '├─ '}${chalk.green(
      path.relative(distDir, node.id)
    )} ${chalk.yellow(duration)}\n`
    
    const childPrefix = `${prefix}${isRoot ? '  ' : isLast ? '   ' : '│  '}`
    
    node.children.forEach((child, i) => {
      output += this.prettyPrint(
        child,
        distDir,
        childPrefix,
        i === node.children.length - 1,
        false
      )
    })
    
    return output
  }

  getStats() {
    return {
      ...this.stats,
      totalFileReads: this.stats.readFileCount + this.stats.readFileSyncCount
    }
  }

  printSummary() {
    if (this.config.logRequire && this.currentNode) {
      console.log('\n📊 Module Loading Performance:')
      console.log(this.prettyPrint(this.currentNode, path.join(this.config.absoluteAppDir, this.config.getDistDir())))
      
      if (this.outliers.length > 0) {
        console.log('\n⚠️  Slow Loading Modules (>70ms):')
        this.outliers.forEach((node) => {
          console.log(
            `  ${path.relative(
              path.join(this.config.absoluteAppDir, this.config.getDistDir()),
              node.id
            )} ${node.selfDuration.toFixed(2)}ms / ${node.totalDuration.toFixed(2)}ms`
          )
        })
      }
    }

    const stats = this.getStats()
    console.log('\n📈 Server Performance Stats:')
    console.log(`  Requests handled: ${stats.requestCount}`)
    console.log(`  Modules compiled: ${stats.compileCount}`)
    console.log(`  Files read: ${stats.totalFileReads}`)
    console.log(`  Errors: ${stats.errors}`)
  }
}

/**
 * Security middleware
 */
class SecurityManager {
  constructor(config) {
    this.config = config
    this.requestCounts = new Map()
    this.suspiciousRequests = new Set()
  }

  /**
   * Basic request validation and rate limiting
   */
  validateRequest(req) {
    const clientIP = req.connection.remoteAddress || 'unknown'
    const userAgent = req.headers['user-agent'] || 'unknown'
    
    // Basic request validation
    if (!req.url || req.url.length > 2048) {
      throw new Error('Invalid or too long URL')
    }
    
    // Simple rate limiting
    const key = `${clientIP}:${Math.floor(Date.now() / 60000)}` // Per minute
    const currentCount = this.requestCounts.get(key) || 0
    
    if (currentCount > 100) { // 100 requests per minute per IP
      throw new Error('Rate limit exceeded')
    }
    
    this.requestCounts.set(key, currentCount + 1)
    
    // Clean old entries
    if (this.requestCounts.size > 1000) {
      const cutoff = Math.floor(Date.now() / 60000) - 5
      for (const [k] of this.requestCounts) {
        const timestamp = parseInt(k.split(':')[1], 10)
        if (timestamp < cutoff) {
          this.requestCounts.delete(k)
        }
      }
    }
    
    return true
  }

  /**
   * Add security headers
   */
  addSecurityHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('X-XSS-Protection', '1; mode=block')
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    res.setHeader('Content-Security-Policy', "default-src 'self'")
  }
}

/**
 * Enhanced Next.js server wrapper
 */
class EnhancedNextServer {
  constructor() {
    this.config = new ServerConfig()
    this.monitor = new PerformanceMonitor(this.config)
    this.security = new SecurityManager(this.config)
    this.server = null
    this.nextServer = null
    this.isShuttingDown = false
    
    this.setupEnvironment()
    this.setupGracefulShutdown()
  }

  setupEnvironment() {
    // Set production environment
    if (this.config.nodeEnv) {
      process.env.NODE_ENV = this.config.nodeEnv
    }
    
    if (this.config.prebundledReact) {
      process.env.__NEXT_PRIVATE_PREBUNDLED_REACT = this.config.prebundledReact
    }
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) return
      
      console.log(`\n🛑 Received ${signal}, initiating graceful shutdown...`)
      this.isShuttingDown = true
      
      try {
        if (this.server) {
          await new Promise((resolve) => {
            this.server.close(() => {
              console.log('✅ HTTP server closed')
              resolve()
            })
          })
        }
        
        this.monitor.printSummary()
        console.log('✅ Graceful shutdown completed')
        process.exit(0)
      } catch (error) {
        console.error('❌ Error during shutdown:', error.message)
        process.exit(1)
      }
    }
    
    process.on('SIGINT', () => shutdown('SIGINT'))
    process.on('SIGTERM', () => shutdown('SIGTERM'))
  }

  async initialize() {
    console.log('🚀 Initializing Enhanced Next.js Server...')
    console.time('next-cold-start')
    
    try {
      // Load Next.js server
      const NextServer = this.config.useBundledNext
        ? require('next/dist/compiled/next-server/server.runtime.prod').default
        : require('next/dist/server/next-server').default

      // Load server configuration
      const serverFilesPath = this.config.getServerFilesPath()
      let compiledConfig
      
      try {
        compiledConfig = require(serverFilesPath).config
      } catch (error) {
        throw new Error(`Failed to load server files from ${serverFilesPath}: ${error.message}`)
      }

      // Initialize Next.js server
      this.nextServer = new NextServer({
        conf: compiledConfig,
        dir: '.',
        distDir: this.config.getDistDir(),
        minimalMode: true,
        customServer: false
      })

      console.log('✅ Next.js server initialized')
      console.timeEnd('next-cold-start')
      
    } catch (error) {
      console.error('❌ Failed to initialize Next.js server:', error.message)
      throw error
    }
  }

  async createRequestHandler() {
    if (!this.nextServer) {
      throw new Error('Next.js server not initialized')
    }

    const nextRequestHandler = this.nextServer.getRequestHandler()
    
    return async (req, res) => {
      const requestStart = performance.now()
      const requestId = `req-${++this.monitor.stats.requestCount}`
      
      // Update active request count
      this.monitor.stats.activeRequests++
      
      try {
        // Security validation
        this.security.validateRequest(req)
        this.security.addSecurityHeaders(res)
        
        // Request logging
        console.log(`📨 ${requestId}: ${req.method} ${req.url}`)
        
        if (this.config.logReadFile) {
          this.monitor.stats.readFileCount = 0
          this.monitor.stats.readFileSyncCount = 0
        }
        
        // Set request timeout
        const timeout = setTimeout(() => {
          if (!res.headersSent) {
            res.statusCode = 408
            res.end('Request Timeout')
          }
        }, this.config.maxRequestTimeout)
        
        // Handle the request
        await nextRequestHandler(req, res)
        
        clearTimeout(timeout)
        
      } catch (error) {
        this.monitor.stats.errors++
        console.error(`❌ ${requestId}: Error - ${error.message}`)
        
        if (!res.headersSent) {
          res.statusCode = error.message.includes('Rate limit') ? 429 : 500
          res.end(error.message.includes('Rate limit') ? 'Rate Limit Exceeded' : 'Internal Server Error')
        }
      } finally {
        this.monitor.stats.activeRequests--
        
        const duration = performance.now() - requestStart
        const status = res.statusCode || 500
        
        console.log(`📤 ${requestId}: ${status} (${duration.toFixed(2)}ms)`)
        
        if (this.config.logReadFile) {
          const fileReads = this.monitor.stats.readFileCount + this.monitor.stats.readFileSyncCount
          if (fileReads > 0) {
            console.log(`📁 ${requestId}: ${fileReads} files read`)
          }
        }
      }
    }
  }

  async start() {
    try {
      await this.initialize()
      
      const requestHandler = await this.createRequestHandler()
      
      // Create HTTP server
      this.server = http.createServer(requestHandler)
      
      // Handle server errors
      this.server.on('error', (error) => {
        console.error('❌ Server error:', error.message)
        if (error.code === 'EADDRINUSE') {
          console.error(`Port ${this.config.port} is already in use`)
        }
        process.exit(1)
      })
      
      // Start listening
      await new Promise((resolve, reject) => {
        this.server.listen(this.config.port, this.config.host, (error) => {
          if (error) return reject(error)
          resolve()
        })
      })
      
      console.log(`🌐 Server running at http://${this.config.host}:${this.config.port}/`)
      console.log(`📁 App directory: ${this.config.absoluteAppDir}`)
      console.log(`🎯 Target page: ${this.config.targetPage || 'index'}`)
      
      // Make initial request for warm-up
      await this.warmUp()
      
    } catch (error) {
      console.error('❌ Failed to start server:', error.message)
      throw error
    }
  }

  async warmUp() {
    if (!this.config.targetPage && !process.env.SKIP_WARMUP) {
      return // Skip warmup if no target page specified
    }
    
    console.log('🔥 Warming up server with initial request...')
    
    try {
      const response = await fetch(`http://${this.config.host}:${this.config.port}/${this.config.targetPage}`)
      await response.text()
      console.log(`✅ Warmup completed (${response.status})`)
    } catch (error) {
      console.warn(`⚠️  Warmup failed: ${error.message}`)
    } finally {
      console.timeEnd('next-wall-time')
    }
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    const server = new EnhancedNextServer()
    await server.start()
    
  } catch (error) {
    console.error('\n💥 Server startup failed:', error.message)
    
    if (process.env.DEBUG === 'true') {
      console.error('Stack trace:', error.stack)
    }
    
    process.exit(1)
  }
}

// Execute if this is the main module
if (require.main === module) {
  main()
}

// Export for testing
module.exports = {
  EnhancedNextServer,
  ServerConfig,
  PerformanceMonitor,
  SecurityManager
}
