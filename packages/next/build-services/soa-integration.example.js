/**
 * SOA Integration Example
 * Demonstrates integration of new service-oriented architecture with existing taskfile.js
 * This shows how to gradually migrate to the new SOA services
 */

const { NextJSBuildSystemFacade, NextJSServiceRegistry } = require('./build-services')

// Import the existing taskfile functions that we're gradually replacing
const taskfile = require('./taskfile')

/**
 * Modern Next.js Build System with SOA Services
 * This replaces the monolithic taskfile.js approach
 */
class ModernNextJSBuildSystem {
  constructor(options = {}) {
    this.facade = new NextJSBuildSystemFacade(options)
    this.services = null
  }

  /**
   * Initialize the modern build system
   */
  async initialize() {
    await this.facade.initialize()
    this.services = this.facade.services
    return this
  }

  /**
   * Modern replacement for the 'build' task in taskfile.js
   */
  async build(task, opts) {
    console.log('🚀 Starting SOA-based Next.js build...')
    
    const buildResult = await this.facade.build({
      mode: opts.dev ? 'development' : 'production',
      target: opts.target || 'server',
      ...opts
    })

    console.log(`✅ Build completed in ${buildResult.duration}ms`)
    return buildResult
  }

  /**
   * Modern replacement for NCC compilation tasks
   */
  async ncc(task, opts) {
    console.log('📦 Starting SOA-based NCC compilation...')
    
    const { compiler } = this.services
    const swcService = compiler.getSWCService()
    
    // Use the new bundling service instead of individual ncc_* functions
    const bundlingService = this.services.clientBundling
    
    // This replaces all the individual ncc_* tasks with a service-oriented approach
    const packages = [
      'amp-optimizer',
      'node-html-parser', 
      'p-limit',
      'p-queue',
      'raw-body',
      'image-size',
      // ... add more packages as needed
    ]

    const results = []
    for (const pkg of packages) {
      try {
        const result = await bundlingService.bundle(task, {
          packageName: pkg,
          source: pkg,
          target: `src/compiled/${pkg}`
        })
        results.push({ package: pkg, success: true, result })
        console.log(`✅ Compiled ${pkg}`)
      } catch (error) {
        results.push({ package: pkg, success: false, error: error.message })
        console.error(`❌ Failed to compile ${pkg}:`, error.message)
      }
    }

    return results
  }

  /**
   * Modern development server
   */
  async dev(task, opts) {
    console.log('🔧 Starting SOA-based development server...')
    
    return this.facade.startDev(opts)
  }

  /**
   * Modern testing with orchestration
   */
  async test(task, opts) {
    console.log('🧪 Running SOA-based tests...')
    
    return this.facade.test(opts)
  }

  /**
   * Modern linting with multiple services
   */
  async lint(task, opts) {
    console.log('🔍 Running SOA-based linting...')
    
    return this.facade.lint(opts)
  }
}

/**
 * Hybrid approach: Use new services while maintaining backward compatibility
 */
class HybridBuildSystem {
  constructor() {
    this.modernSystem = new ModernNextJSBuildSystem()
    this.legacyTasks = taskfile
  }

  async initialize() {
    await this.modernSystem.initialize()
    return this
  }

  /**
   * Enhanced build task that uses both old and new systems
   */
  async build(task, opts) {
    // Use modern SOA services for new functionality
    const modernResult = await this.modernSystem.build(task, opts)
    
    // Fall back to legacy tasks for specific operations not yet migrated
    // Example: Keep existing server tasks until fully migrated
    if (opts.includeServer) {
      await this.legacyTasks.server(task, opts)
    }

    return modernResult
  }

  /**
   * Gradually replace NCC tasks
   */
  async ncc(task, opts) {
    const useModern = opts.useSOA !== false
    
    if (useModern) {
      console.log('Using modern SOA-based NCC compilation')
      return this.modernSystem.ncc(task, opts)
    } else {
      console.log('Using legacy NCC compilation')
      return this.legacyTasks.ncc(task, opts)
    }
  }
}

// Export both systems for different migration strategies
module.exports = {
  ModernNextJSBuildSystem,
  HybridBuildSystem,
  
  // Factory function to create the appropriate system
  createBuildSystem: (options = {}) => {
    const { useSOA = true, hybrid = false } = options
    
    if (hybrid) {
      return new HybridBuildSystem()
    } else if (useSOA) {
      return new ModernNextJSBuildSystem(options)
    } else {
      // Return wrapper around legacy system
      return {
        build: taskfile.build,
        ncc: taskfile.ncc,
        // ... other legacy methods
      }
    }
  }
}

/**
 * Usage Example:
 * 
 * // In your build script:
 * const { createBuildSystem } = require('./soa-integration')
 * 
 * async function main() {
 *   const buildSystem = createBuildSystem({ useSOA: true })
 *   await buildSystem.initialize()
 *   
 *   // Modern SOA-based build
 *   await buildSystem.build(task, { dev: false })
 * }
 * 
 * // Or for hybrid approach:
 * const buildSystem = createBuildSystem({ hybrid: true })
 * await buildSystem.initialize()
 * 
 * // This will use SOA services where available, legacy elsewhere
 * await buildSystem.build(task, { useSOA: true })
 */