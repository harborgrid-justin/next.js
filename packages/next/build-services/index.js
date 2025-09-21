/**
 * Build Services Index
 * Central export for all SOA services
 * SOA Improvement: Service registry and orchestration
 */

// Import all services
const { NCCCompilationService } = require('./ncc-compilation.service')
const { BuildOrchestrationService, NextJSBuildService } = require('./build-orchestration.service')
const { BundlingServiceFactory, NextJSClientBundlingService } = require('./bundling.service')
const { APIGatewayService } = require('./api-gateway.service')
const { SSRService, NextJSSSRService } = require('./ssr.service')
const { ServerComponentService, NextJSServerComponentService } = require('./server-components.service')
const { TelemetryService, NextJSTelemetryService } = require('./telemetry.service')
const { ClientBundlingService } = require('./client-bundling.service')
const { AssetManagementService, NextJSAssetManagementService } = require('./asset-management.service')
const { DevelopmentServerOrchestrator, NextJSDevelopmentServer } = require('./dev-server.service')
const { ConfigurationService, NextJSConfigurationService } = require('./configuration.service')
const { ErrorHandlingService, NextJSErrorHandlingService } = require('./error-handling.service')
const { CompilerServiceFactory, NextJSCompilerManager } = require('./compiler.service')
const { TestingOrchestrationService, NextJSTestingService } = require('./testing.service')
const { LintingServiceManager, NextJSLintingService } = require('./linting.service')

/**
 * Service Registry
 * Central registry for all build services
 */
class ServiceRegistry {
  constructor() {
    this.services = new Map()
    this.dependencies = new Map()
    this.initialized = new Set()
  }

  /**
   * Register a service with optional dependencies
   * @param {string} name - Service name
   * @param {Function} serviceFactory - Service factory function
   * @param {Array} dependencies - Service dependencies
   */
  register(name, serviceFactory, dependencies = []) {
    this.services.set(name, serviceFactory)
    this.dependencies.set(name, dependencies)
    return this
  }

  /**
   * Get service instance with dependency injection
   * @param {string} name - Service name
   * @param {Object} options - Service options
   */
  async get(name, options = {}) {
    if (this.initialized.has(name)) {
      return this.initialized.get(name)
    }

    const serviceFactory = this.services.get(name)
    if (!serviceFactory) {
      throw new Error(`Service not registered: ${name}`)
    }

    // Initialize dependencies first
    const dependencies = this.dependencies.get(name) || []
    const resolvedDependencies = {}

    for (const depName of dependencies) {
      resolvedDependencies[depName] = await this.get(depName)
    }

    // Initialize the service
    const service = await serviceFactory({ ...options, dependencies: resolvedDependencies })
    this.initialized.set(name, service)

    return service
  }

  /**
   * Initialize all services
   */
  async initializeAll(options = {}) {
    const initPromises = []
    
    for (const serviceName of this.services.keys()) {
      initPromises.push(this.get(serviceName, options[serviceName] || {}))
    }

    return Promise.all(initPromises)
  }

  /**
   * Clear all services
   */
  clear() {
    this.services.clear()
    this.dependencies.clear()
    this.initialized.clear()
  }
}

/**
 * Next.js Service Registry
 * Pre-configured service registry for Next.js
 */
class NextJSServiceRegistry extends ServiceRegistry {
  constructor() {
    super()
    this.setupNextJSServices()
  }

  setupNextJSServices() {
    // Configuration service (no dependencies)
    this.register('config', (options) => new NextJSConfigurationService(options))

    // Error handling service (no dependencies)
    this.register('errorHandler', (options) => new NextJSErrorHandlingService(options))

    // Telemetry service (depends on config and errorHandler)
    this.register('telemetry', (options) => new NextJSTelemetryService(options), ['config', 'errorHandler'])

    // Compiler service (depends on config)
    this.register('compiler', (options) => new NextJSCompilerManager(options), ['config'])

    // Build orchestration (depends on config, telemetry, compiler)
    this.register('buildOrchestrator', (options) => new NextJSBuildService(options), ['config', 'telemetry', 'compiler'])

    // Client bundling (depends on compiler, config)
    this.register('clientBundling', (options) => new NextJSClientBundlingService(options), ['compiler', 'config'])

    // Asset management (depends on config)
    this.register('assetManager', (options) => new NextJSAssetManagementService(options), ['config'])

    // Server components (depends on config, telemetry)
    this.register('serverComponents', (options) => new NextJSServerComponentService(options), ['config', 'telemetry'])

    // SSR service (depends on serverComponents, config)
    this.register('ssr', (options) => new NextJSSSRService(options), ['serverComponents', 'config'])

    // API Gateway (depends on config, errorHandler)
    this.register('apiGateway', (options) => new APIGatewayService(options), ['config', 'errorHandler'])

    // Development server (depends on multiple services)
    this.register('devServer', (options) => new NextJSDevelopmentServer(options), 
      ['config', 'clientBundling', 'assetManager', 'telemetry'])

    // Testing service (depends on config, compiler)
    this.register('testing', (options) => new NextJSTestingService(options), ['config', 'compiler'])

    // Linting service (depends on config)
    this.register('linting', (options) => new NextJSLintingService(options), ['config'])
  }

  /**
   * Get complete Next.js build system
   */
  async getNextJSBuildSystem(options = {}) {
    const services = {}
    
    const serviceNames = [
      'config',
      'errorHandler', 
      'telemetry',
      'compiler',
      'buildOrchestrator',
      'clientBundling',
      'assetManager',
      'serverComponents',
      'ssr',
      'apiGateway',
      'devServer',
      'testing',
      'linting'
    ]

    for (const serviceName of serviceNames) {
      services[serviceName] = await this.get(serviceName, options[serviceName] || {})
    }

    return services
  }
}

/**
 * Build System Facade
 * Simplified interface for the entire build system
 */
class NextJSBuildSystemFacade {
  constructor(options = {}) {
    this.registry = new NextJSServiceRegistry()
    this.services = null
    this.options = options
  }

  /**
   * Initialize the build system
   */
  async initialize() {
    this.services = await this.registry.getNextJSBuildSystem(this.options)
    return this
  }

  /**
   * Build the project
   */
  async build(buildOptions = {}) {
    if (!this.services) {
      await this.initialize()
    }

    const { buildOrchestrator, telemetry } = this.services
    
    await telemetry.trackBuildPerformance('build-start', 0)
    const startTime = Date.now()
    
    try {
      const result = await buildOrchestrator.execute(buildOrchestrator, buildOptions)
      const duration = Date.now() - startTime
      
      await telemetry.trackBuildPerformance('build-complete', duration)
      
      return {
        success: true,
        duration,
        result
      }
    } catch (error) {
      const duration = Date.now() - startTime
      await telemetry.trackBuildPerformance('build-error', duration)
      
      throw error
    }
  }

  /**
   * Start development server
   */
  async startDev(devOptions = {}) {
    if (!this.services) {
      await this.initialize()
    }

    const { devServer } = this.services
    return devServer.startAll()
  }

  /**
   * Run tests
   */
  async test(testOptions = {}) {
    if (!this.services) {
      await this.initialize()
    }

    const { testing } = this.services
    return testing.runAll()
  }

  /**
   * Lint project
   */
  async lint(lintOptions = {}) {
    if (!this.services) {
      await this.initialize()
    }

    const { linting } = this.services
    return linting.lintProject(lintOptions)
  }

  /**
   * Get service by name
   */
  getService(serviceName) {
    return this.services?.[serviceName]
  }
}

// Export everything
module.exports = {
  // Individual services
  NCCCompilationService,
  BuildOrchestrationService,
  NextJSBuildService,
  BundlingServiceFactory,
  NextJSClientBundlingService,
  APIGatewayService,
  SSRService,
  NextJSSSRService,
  ServerComponentService,
  NextJSServerComponentService,
  TelemetryService,
  NextJSTelemetryService,
  ClientBundlingService,
  AssetManagementService,
  NextJSAssetManagementService,
  DevelopmentServerOrchestrator,
  NextJSDevelopmentServer,
  ConfigurationService,
  NextJSConfigurationService,
  ErrorHandlingService,
  NextJSErrorHandlingService,
  CompilerServiceFactory,
  NextJSCompilerManager,
  TestingOrchestrationService,
  NextJSTestingService,
  LintingServiceManager,
  NextJSLintingService,

  // Service management
  ServiceRegistry,
  NextJSServiceRegistry,
  NextJSBuildSystemFacade
}