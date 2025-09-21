/**
 * Bundling Service Factory
 * Service-oriented approach to handle different bundling strategies
 * SOA Improvement: Modular bundling services per bundler type
 */

const { resolve, relative } = require('path')

/**
 * Abstract base bundling service
 */
class BundlingService {
  constructor(options = {}) {
    this.options = options
    this.externals = options.externals || {}
  }

  /**
   * Abstract method for bundling - to be implemented by concrete services
   */
  async bundle(task, config) {
    throw new Error('Bundle method must be implemented by concrete service')
  }

  /**
   * Common bundling configuration setup
   */
  createBaseConfig(packageName, options = {}) {
    return {
      packageName,
      externals: { ...this.externals, ...options.externals },
      mainFields: options.mainFields || ['browser', 'main'],
      target: options.target || 'es5',
      ...options
    }
  }
}

/**
 * NCC (Node.js Compilation Collection) bundling service
 */
class NCCBundlingService extends BundlingService {
  async bundle(task, config) {
    const { packageName, source, target, ...nccConfig } = config
    
    return task
      .source(relative(__dirname, require.resolve(`${source || packageName}/`)))
      .ncc(this.createBaseConfig(packageName, nccConfig))
      .target(target || `src/compiled/${packageName}`)
  }

  /**
   * Bundle multiple packages in parallel
   */
  async bundleParallel(task, packages, baseOptions = {}) {
    const bundleTasks = packages.map(pkg => {
      const config = typeof pkg === 'string' ? { packageName: pkg } : pkg
      return this.bundle(task, { ...baseOptions, ...config })
    })

    return Promise.all(bundleTasks)
  }
}

/**
 * Webpack bundling service
 */
class WebpackBundlingService extends BundlingService {
  async bundle(task, config) {
    const { entry, output, ...webpackConfig } = config
    
    return task
      .source(entry)
      .webpack({ ...this.createBaseConfig(config.packageName, webpackConfig), output })
      .target(output)
  }
}

/**
 * SWC bundling service
 */
class SWCBundlingService extends BundlingService {
  async bundle(task, config) {
    const { source, target, ...swcConfig } = config
    
    return task
      .source(source)
      .swc(this.options.swcType || 'server', { 
        ...this.options.swcOptions,
        ...swcConfig 
      })
      .target(target)
  }
}

/**
 * Bundling service factory
 */
class BundlingServiceFactory {
  static services = new Map([
    ['ncc', NCCBundlingService],
    ['webpack', WebpackBundlingService],
    ['swc', SWCBundlingService]
  ])

  static create(type, options = {}) {
    const ServiceClass = this.services.get(type)
    if (!ServiceClass) {
      throw new Error(`Unknown bundling service type: ${type}`)
    }
    return new ServiceClass(options)
  }

  static register(type, serviceClass) {
    this.services.set(type, serviceClass)
  }
}

module.exports = { 
  BundlingService,
  NCCBundlingService,
  WebpackBundlingService,
  SWCBundlingService,
  BundlingServiceFactory
}