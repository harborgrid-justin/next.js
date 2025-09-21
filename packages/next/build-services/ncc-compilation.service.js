/**
 * NCC Compilation Service
 * Service-oriented module for handling Next.js NCC compilation tasks
 * SOA Improvement: Extracted from monolithic taskfile.js
 */

const { relative } = require('path')

/**
 * Base NCC compilation service configuration
 */
class NCCCompilationService {
  constructor(externals = {}) {
    this.externals = externals
  }

  /**
   * Creates a standardized NCC compilation task
   * @param {Object} task - Task runner instance
   * @param {string} packageName - Package name to compile
   * @param {Object} options - Compilation options
   */
  async createCompilationTask(task, packageName, options = {}) {
    const {
      source = packageName,
      target = `src/compiled/${packageName}`,
      externals = this.externals,
      mainFields = ['browser', 'main'],
      targetES = 'es5',
      ...otherOptions
    } = options

    return task
      .source(relative(__dirname, require.resolve(`${source}/`)))
      .ncc({
        packageName,
        externals,
        mainFields,
        target: targetES,
        ...otherOptions,
      })
      .target(target)
  }

  /**
   * Utility method to create browser-specific compilation
   */
  async createBrowserCompilation(task, packageName, options = {}) {
    return this.createCompilationTask(task, packageName, {
      mainFields: ['browser', 'main'],
      target: 'es5',
      ...options,
    })
  }

  /**
   * Utility method to create Node.js specific compilation
   */
  async createNodeCompilation(task, packageName, options = {}) {
    return this.createCompilationTask(task, packageName, {
      mainFields: ['main'],
      target: 'node',
      ...options,
    })
  }
}

module.exports = { NCCCompilationService }