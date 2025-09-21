/**
 * Build Orchestration Service
 * Centralized service for coordinating build operations
 * SOA Improvement: Service abstraction for build processes
 */

/**
 * Build orchestration service for managing complex build workflows
 */
class BuildOrchestrationService {
  constructor() {
    this.buildSteps = []
    this.parallelTasks = []
    this.dependencies = new Map()
  }

  /**
   * Register a build step with dependencies
   * @param {string} name - Step name
   * @param {Function} task - Task function
   * @param {Array} dependencies - Step dependencies
   */
  registerStep(name, task, dependencies = []) {
    this.buildSteps.push({ name, task, dependencies })
    this.dependencies.set(name, dependencies)
    return this
  }

  /**
   * Register parallel tasks for concurrent execution
   * @param {Array} tasks - Array of task names or functions
   */
  registerParallelTasks(tasks) {
    this.parallelTasks.push(tasks)
    return this
  }

  /**
   * Execute build workflow with dependency resolution
   * @param {Object} taskRunner - Task runner instance
   * @param {Object} opts - Build options
   */
  async execute(taskRunner, opts = {}) {
    // Execute parallel tasks first
    if (this.parallelTasks.length > 0) {
      await taskRunner.parallel(this.parallelTasks.flat(), opts)
    }

    // Execute build steps with dependency resolution
    const executed = new Set()
    
    for (const step of this.buildSteps) {
      await this.executeStep(step, taskRunner, opts, executed)
    }
  }

  /**
   * Execute individual step with dependency checking
   */
  async executeStep(step, taskRunner, opts, executed) {
    if (executed.has(step.name)) {
      return
    }

    // Execute dependencies first
    for (const depName of step.dependencies) {
      const dep = this.buildSteps.find(s => s.name === depName)
      if (dep && !executed.has(depName)) {
        await this.executeStep(dep, taskRunner, opts, executed)
      }
    }

    // Execute the step
    await step.task(taskRunner, opts)
    executed.add(step.name)
  }

  /**
   * Clear all registered steps and tasks
   */
  reset() {
    this.buildSteps = []
    this.parallelTasks = []
    this.dependencies.clear()
    return this
  }
}

/**
 * Pre-configured build orchestration for common Next.js build patterns
 */
class NextJSBuildService extends BuildOrchestrationService {
  constructor() {
    super()
    this.setupCommonSteps()
  }

  setupCommonSteps() {
    // Common Next.js build workflow
    this.registerStep('clean', async (task) => {
      await task.clear('dist')
    })

    this.registerStep('compile-core', async (task, opts) => {
      // Core compilation step
    }, ['clean'])

    this.registerStep('generate-types', async (task, opts) => {
      // Type generation step
    }, ['compile-core'])
  }
}

module.exports = { BuildOrchestrationService, NextJSBuildService }