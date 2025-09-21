/**
 * Development Server Service
 * Modular development server with microservices architecture
 * SOA Improvement: Split development server into microservices
 */

const EventEmitter = require('events')

/**
 * Base Development Service
 */
class DevelopmentService extends EventEmitter {
  constructor(name, options = {}) {
    super()
    this.name = name
    this.status = 'stopped'
    this.options = options
  }

  async start() {
    this.status = 'starting'
    this.emit('starting', this.name)
    
    try {
      await this.onStart()
      this.status = 'running'
      this.emit('started', this.name)
    } catch (error) {
      this.status = 'error'
      this.emit('error', error, this.name)
      throw error
    }
  }

  async stop() {
    this.status = 'stopping'
    this.emit('stopping', this.name)
    
    try {
      await this.onStop()
      this.status = 'stopped'
      this.emit('stopped', this.name)
    } catch (error) {
      this.status = 'error'
      this.emit('error', error, this.name)
      throw error
    }
  }

  async restart() {
    if (this.status === 'running') {
      await this.stop()
    }
    await this.start()
  }

  // Abstract methods to be implemented by concrete services
  async onStart() {
    throw new Error('onStart must be implemented')
  }

  async onStop() {
    throw new Error('onStop must be implemented')
  }

  getStatus() {
    return {
      name: this.name,
      status: this.status,
      uptime: this.status === 'running' ? Date.now() - this.startTime : 0
    }
  }
}

/**
 * Hot Reload Service
 */
class HotReloadService extends DevelopmentService {
  constructor(options = {}) {
    super('hot-reload', options)
    this.watchers = new Map()
    this.clients = new Set()
  }

  async onStart() {
    this.setupFileWatcher()
    this.setupWebSocketServer()
    this.startTime = Date.now()
  }

  async onStop() {
    // Close all watchers
    for (const watcher of this.watchers.values()) {
      await watcher.close()
    }
    this.watchers.clear()

    // Close WebSocket connections
    for (const client of this.clients) {
      client.close()
    }
    this.clients.clear()
  }

  setupFileWatcher() {
    const chokidar = require('chokidar')
    
    const watcher = chokidar.watch(this.options.watchPaths || ['src/**/*'], {
      ignored: this.options.ignored || /node_modules/,
      persistent: true
    })

    watcher.on('change', (path) => {
      this.handleFileChange(path)
    })

    this.watchers.set('main', watcher)
  }

  setupWebSocketServer() {
    const WebSocket = require('ws')
    
    this.wss = new WebSocket.Server({ port: this.options.hmrPort || 3001 })
    
    this.wss.on('connection', (ws) => {
      this.clients.add(ws)
      
      ws.on('close', () => {
        this.clients.delete(ws)
      })
    })
  }

  handleFileChange(filePath) {
    const changeData = {
      type: 'file-changed',
      path: filePath,
      timestamp: Date.now()
    }

    this.broadcastToClients(changeData)
    this.emit('file-changed', filePath)
  }

  broadcastToClients(data) {
    const message = JSON.stringify(data)
    
    for (const client of this.clients) {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(message)
      }
    }
  }
}

/**
 * Build Service for Development
 */
class DevelopmentBuildService extends DevelopmentService {
  constructor(options = {}) {
    super('build', options)
    this.buildQueue = []
    this.isBuilding = false
  }

  async onStart() {
    this.setupBuildQueue()
    this.startTime = Date.now()
  }

  async onStop() {
    this.buildQueue = []
    this.isBuilding = false
  }

  setupBuildQueue() {
    // Process build queue every 100ms
    this.buildInterval = setInterval(() => {
      if (!this.isBuilding && this.buildQueue.length > 0) {
        this.processBuildQueue()
      }
    }, 100)
  }

  async processBuildQueue() {
    if (this.isBuilding) return

    this.isBuilding = true
    const buildTasks = [...this.buildQueue]
    this.buildQueue = []

    try {
      const buildResult = await this.executeBuild(buildTasks)
      this.emit('build-complete', buildResult)
    } catch (error) {
      this.emit('build-error', error)
    } finally {
      this.isBuilding = false
    }
  }

  queueBuild(task) {
    this.buildQueue.push(task)
    this.emit('build-queued', task)
  }

  async executeBuild(tasks) {
    // Mock build execution
    return {
      tasks,
      duration: Math.random() * 1000,
      success: true,
      timestamp: Date.now()
    }
  }
}

/**
 * Static File Service
 */
class StaticFileService extends DevelopmentService {
  constructor(options = {}) {
    super('static-files', options)
    this.server = null
  }

  async onStart() {
    const express = require('express')
    const app = express()

    // Serve static files
    app.use(express.static(this.options.publicDir || 'public'))
    
    // Serve build output
    app.use('/_next', express.static(this.options.buildDir || '.next'))

    this.server = app.listen(this.options.port || 3002)
    this.startTime = Date.now()
  }

  async onStop() {
    if (this.server) {
      await new Promise((resolve) => this.server.close(resolve))
      this.server = null
    }
  }
}

/**
 * Development Server Orchestrator
 */
class DevelopmentServerOrchestrator extends EventEmitter {
  constructor(options = {}) {
    super()
    this.services = new Map()
    this.options = options
    this.isRunning = false
  }

  /**
   * Register a development service
   */
  registerService(service) {
    this.services.set(service.name, service)
    
    // Forward service events
    service.on('started', () => this.emit('service-started', service.name))
    service.on('stopped', () => this.emit('service-stopped', service.name))
    service.on('error', (error) => this.emit('service-error', error, service.name))
    
    return this
  }

  /**
   * Start all registered services
   */
  async startAll() {
    if (this.isRunning) return

    this.isRunning = true
    const startPromises = []

    for (const service of this.services.values()) {
      startPromises.push(service.start())
    }

    try {
      await Promise.all(startPromises)
      this.emit('all-services-started')
    } catch (error) {
      this.emit('startup-error', error)
      throw error
    }
  }

  /**
   * Stop all registered services
   */
  async stopAll() {
    if (!this.isRunning) return

    const stopPromises = []

    for (const service of this.services.values()) {
      stopPromises.push(service.stop())
    }

    await Promise.all(stopPromises)
    this.isRunning = false
    this.emit('all-services-stopped')
  }

  /**
   * Restart specific service
   */
  async restartService(serviceName) {
    const service = this.services.get(serviceName)
    if (service) {
      await service.restart()
    }
  }

  /**
   * Get status of all services
   */
  getServicesStatus() {
    const status = {}
    
    for (const [name, service] of this.services) {
      status[name] = service.getStatus()
    }

    return status
  }
}

/**
 * Next.js Development Server
 */
class NextJSDevelopmentServer extends DevelopmentServerOrchestrator {
  constructor(options = {}) {
    super(options)
    this.setupNextJSServices()
  }

  setupNextJSServices() {
    // Register Hot Reload Service
    this.registerService(new HotReloadService({
      watchPaths: ['src/**/*', 'pages/**/*', 'app/**/*'],
      hmrPort: 3001,
      ignored: /node_modules|\.next/
    }))

    // Register Build Service
    this.registerService(new DevelopmentBuildService({
      buildMode: 'development'
    }))

    // Register Static File Service
    this.registerService(new StaticFileService({
      publicDir: 'public',
      buildDir: '.next',
      port: 3002
    }))
  }

  /**
   * Handle file changes for Next.js specific logic
   */
  handleFileChange(filePath) {
    if (filePath.includes('/pages/') || filePath.includes('/app/')) {
      // Queue page rebuild
      const buildService = this.services.get('build')
      buildService.queueBuild({
        type: 'page',
        file: filePath
      })
    }

    if (filePath.includes('next.config.js')) {
      // Restart all services when config changes
      this.restartAllServices()
    }
  }

  async restartAllServices() {
    await this.stopAll()
    await this.startAll()
  }
}

module.exports = { 
  DevelopmentService,
  HotReloadService,
  DevelopmentBuildService,
  StaticFileService,
  DevelopmentServerOrchestrator,
  NextJSDevelopmentServer
}