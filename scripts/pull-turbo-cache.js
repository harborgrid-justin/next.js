#!/usr/bin/env node
/**
 * Turbo Cache Pull Script - Enterprise Version
 * Pulls and manages Turbo cache for build optimization with enhanced architecture
 */

// @ts-check

const { spawn } = require('child_process')
const { performance } = require('perf_hooks')

/**
 * Configuration management with proper structure
 */
class TurboCacheConfig {
  constructor() {
    this.turboVersion = process.env.TURBO_VERSION || 'latest'
    this.timeout = parseInt(process.env.TURBO_TIMEOUT || '300000', 10) // 5 minutes default
    this.maxRetries = parseInt(process.env.TURBO_MAX_RETRIES || '3', 10)
    this.verbose = process.env.VERBOSE === 'true' || process.env.DEBUG === 'true'
    this.dryRun = process.env.DRY_RUN === 'true'
  }

  validate() {
    if (this.timeout < 1000 || this.timeout > 600000) {
      throw new ConfigurationError('TURBO_TIMEOUT must be between 1000ms and 600000ms (10 minutes)')
    }
    
    if (this.maxRetries < 1 || this.maxRetries > 10) {
      throw new ConfigurationError('TURBO_MAX_RETRIES must be between 1 and 10')
    }
    
    return true
  }

  getTurboCommand() {
    return `pnpm dlx turbo@${this.turboVersion}`
  }
}

/**
 * Custom error classes for better error categorization
 */
class TurboError extends Error {
  constructor(message, exitCode, signal) {
    super(message)
    this.name = 'TurboError'
    this.exitCode = exitCode
    this.signal = signal
  }
}

class ConfigurationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ConfigurationError'
  }
}

class ValidationError extends Error {
  constructor(message, data) {
    super(message)
    this.name = 'ValidationError'
    this.data = data
  }
}

/**
 * Process execution abstraction with proper error handling
 */
class ProcessExecutor {
  constructor(config) {
    this.config = config
    this.activeProcesses = new Set()
  }

  /**
   * Execute a command with proper error handling and timeout
   */
  async executeCommand(command, args, options = {}) {
    const startTime = performance.now()
    
    return new Promise((resolve, reject) => {
      if (this.config.verbose) {
        console.log(`🔧 Executing: ${command} ${args.join(' ')}`)
      }
      
      if (this.config.dryRun) {
        console.log(`🔍 [DRY RUN] Would execute: ${command} ${args.join(' ')}`)
        resolve({ stdout: '', stderr: '', exitCode: 0 })
        return
      }

      const child = spawn(command, args, {
        stdio: options.inheritStdio ? 'inherit' : 'pipe',
        timeout: this.config.timeout,
        ...options
      })

      this.activeProcesses.add(child)

      let stdout = ''
      let stderr = ''

      if (!options.inheritStdio) {
        child.stdout?.on('data', (data) => {
          const chunk = data.toString()
          stdout += chunk
          if (this.config.verbose) {
            process.stdout.write(chunk)
          }
        })

        child.stderr?.on('data', (data) => {
          const chunk = data.toString()
          stderr += chunk
          if (this.config.verbose) {
            process.stderr.write(chunk)
          }
        })
      }

      // Timeout handling
      const timeoutId = setTimeout(() => {
        child.kill('SIGTERM')
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL')
          }
        }, 5000)
      }, this.config.timeout)

      child.on('exit', (exitCode, signal) => {
        clearTimeout(timeoutId)
        this.activeProcesses.delete(child)
        
        const duration = performance.now() - startTime
        
        if (exitCode !== 0 || signal) {
          const error = new TurboError(
            `Command failed: ${command} ${args.join(' ')} (exit: ${exitCode}, signal: ${signal})`,
            exitCode,
            signal
          )
          error.stdout = stdout
          error.stderr = stderr
          reject(error)
        } else {
          if (this.config.verbose) {
            console.log(`✅ Command completed in ${duration.toFixed(2)}ms`)
          }
          resolve({ stdout, stderr, exitCode, duration })
        }
      })

      child.on('error', (error) => {
        clearTimeout(timeoutId)
        this.activeProcesses.delete(child)
        reject(error)
      })
    })
  }

  /**
   * Cleanup all active processes
   */
  cleanup() {
    this.activeProcesses.forEach(process => {
      if (!process.killed) {
        process.kill('SIGTERM')
      }
    })
    this.activeProcesses.clear()
  }
}

/**
 * Turbo cache task validation and processing
 */
class TurboTaskValidator {
  /**
   * Validate turbo dry run output
   */
  static validateTurboData(turboResult) {
    if (!turboResult || typeof turboResult !== 'string') {
      throw new ValidationError('Empty or invalid turbo result', turboResult)
    }

    let turboData
    try {
      turboData = JSON.parse(turboResult)
    } catch (error) {
      throw new ValidationError(`Invalid JSON in turbo result: ${error.message}`, turboResult)
    }

    if (!turboData || typeof turboData !== 'object') {
      throw new ValidationError('Turbo data is not an object', turboData)
    }

    if (!Array.isArray(turboData.tasks)) {
      throw new ValidationError('Turbo data missing tasks array', turboData)
    }

    return turboData
  }

  /**
   * Find relevant task from turbo data
   */
  static findRelevantTask(turboData, target) {
    const task = turboData.tasks.find(t => t.command && t.command !== '<NONEXISTENT>')
    
    if (!task) {
      throw new ValidationError('No valid turbo task found', { 
        availableTasks: turboData.tasks.map(t => ({ 
          taskId: t.taskId, 
          command: t.command 
        })),
        target 
      })
    }

    // Validate task structure
    if (!task.taskId || !task.hash) {
      throw new ValidationError('Task missing required fields (taskId, hash)', task)
    }

    if (!task.cache || typeof task.cache !== 'object') {
      throw new ValidationError('Task missing cache information', task)
    }

    return task
  }
}

/**
 * Main Turbo Cache Manager with proper architecture
 */
class TurboCacheManager {
  constructor() {
    this.config = new TurboCacheConfig()
    this.executor = new ProcessExecutor(this.config)
    this.startTime = performance.now()
  }

  /**
   * Initialize and validate configuration
   */
  async initialize() {
    console.log('🚀 Turbo Cache Manager Starting...')
    
    try {
      this.config.validate()
      
      if (this.config.verbose) {
        console.log('⚙️  Configuration:')
        console.log(`   Turbo Version: ${this.config.turboVersion}`)
        console.log(`   Timeout: ${this.config.timeout}ms`)
        console.log(`   Max Retries: ${this.config.maxRetries}`)
        console.log(`   Dry Run: ${this.config.dryRun}`)
      }
      
    } catch (error) {
      throw new ConfigurationError(`Configuration validation failed: ${error.message}`)
    }
  }

  /**
   * Get the target from command line arguments
   */
  parseTarget() {
    const target = process.argv[process.argv.length - 1]
    
    if (!target || target.startsWith('--') || target === __filename.split('/').pop()) {
      throw new ConfigurationError('Missing target argument. Usage: pull-turbo-cache.js <target>')
    }
    
    return target
  }

  /**
   * Execute turbo dry run to get cache information
   */
  async getTurboCacheInfo(target) {
    console.log(`📊 Checking turbo cache for target: ${target}`)
    
    const result = await this.executor.executeCommand(
      '/bin/bash',
      ['-c', `${this.config.getTurboCommand()} run cache-build-native --dry=json -- ${target}`],
      { inheritStdio: false }
    )

    const turboData = TurboTaskValidator.validateTurboData(result.stdout)
    const task = TurboTaskValidator.findRelevantTask(turboData, target)
    
    console.log(`📋 Task found: ${task.taskId} (hash: ${task.hash})`)
    
    return { turboData, task }
  }

  /**
   * Pull cache if available
   */
  async pullCache(target, task) {
    if (task.cache.local || task.cache.remote) {
      console.log(`💾 Cache Status: ${JSON.stringify(task.cache)}`)
      console.log(`🔄 Pulling cache for task: ${task.taskId}`)
      
      await this.executor.executeCommand(
        '/bin/bash',
        ['-c', `${this.config.getTurboCommand()} run cache-build-native -- ${target}`],
        { inheritStdio: true }
      )
      
      console.log('✅ Cache pull completed successfully')
    } else {
      console.log('⚠️  No turbo cache available, continuing without cache...')
      if (this.config.verbose) {
        console.log('📄 Task details:', JSON.stringify(task, null, 2))
      }
    }
  }

  /**
   * Main execution method
   */
  async run() {
    try {
      await this.initialize()
      
      const target = this.parseTarget()
      const { task } = await this.getTurboCacheInfo(target)
      await this.pullCache(target, task)
      
      const duration = performance.now() - this.startTime
      console.log(`\n🎉 Turbo cache operation completed successfully in ${duration.toFixed(2)}ms`)
      
    } catch (error) {
      const duration = performance.now() - this.startTime
      console.error(`\n💥 Turbo cache operation failed after ${duration.toFixed(2)}ms`)
      
      if (error instanceof ConfigurationError) {
        console.error(`⚙️  Configuration Error: ${error.message}`)
      } else if (error instanceof ValidationError) {
        console.error(`📋 Validation Error: ${error.message}`)
        if (this.config.verbose && error.data) {
          console.error('📄 Error Data:', JSON.stringify(error.data, null, 2))
        }
      } else if (error instanceof TurboError) {
        console.error(`🔧 Turbo Error: ${error.message}`)
        if (error.stderr && this.config.verbose) {
          console.error('📄 Error Output:', error.stderr)
        }
      } else {
        console.error(`❌ Unexpected Error: ${error.message}`)
        if (this.config.verbose) {
          console.error('📍 Stack trace:', error.stack)
        }
      }
      
      throw error
    } finally {
      this.executor.cleanup()
    }
  }
}

/**
 * Enhanced main execution with proper architecture
 */
async function main() {
  const manager = new TurboCacheManager()
  
  // Graceful shutdown handling
  process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, cleaning up...')
    manager.executor.cleanup()
    process.exit(130)
  })
  
  process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, cleaning up...')
    manager.executor.cleanup()
    process.exit(143)
  })
  
  await manager.run()
}

// Enhanced error handling for main execution
if (require.main === module) {
  main().catch((error) => {
    console.error('\n💥 Fatal error in turbo cache manager:')
    console.error(error.message)
    
    if (process.env.DEBUG === 'true') {
      console.error('Stack trace:', error.stack)
    }
    
    process.exit(1)
  })
}

// Export for testing and reuse
module.exports = {
  TurboCacheManager,
  TurboCacheConfig,
  ProcessExecutor,
  TurboTaskValidator,
  TurboError,
  ConfigurationError,
  ValidationError
}
