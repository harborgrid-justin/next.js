/**
 * Enterprise Process Manager
 * Advanced process execution with retry, timeout, and monitoring
 */

const { spawn, exec } = require('child_process')
const { performance } = require('perf_hooks')
const { getLogger } = require('./logger')

/**
 * Process execution result
 */
class ProcessResult {
  constructor(command, exitCode, signal, stdout, stderr, duration) {
    this.command = command
    this.exitCode = exitCode
    this.signal = signal
    this.stdout = stdout
    this.stderr = stderr
    this.duration = duration
    this.success = exitCode === 0 && !signal
  }

  toString() {
    return `ProcessResult(${this.command}, exit=${this.exitCode}, signal=${this.signal}, duration=${this.duration}ms)`
  }
}

/**
 * Process execution error
 */
class ProcessError extends Error {
  constructor(message, result) {
    super(message)
    this.name = 'ProcessError'
    this.result = result
  }
}

/**
 * Process timeout error
 */
class ProcessTimeoutError extends ProcessError {
  constructor(message, result, timeout) {
    super(message)
    this.name = 'ProcessTimeoutError'
    this.timeout = timeout
  }
}

/**
 * Process execution options
 */
class ProcessOptions {
  constructor(options = {}) {
    this.cwd = options.cwd || process.cwd()
    this.env = { ...process.env, ...(options.env || {}) }
    this.timeout = options.timeout || 30000
    this.maxBuffer = options.maxBuffer || 10 * 1024 * 1024 // 10MB
    this.shell = options.shell !== false
    this.stdio = options.stdio || 'pipe'
    this.encoding = options.encoding || 'utf8'
    this.killSignal = options.killSignal || 'SIGTERM'
    this.windowsHide = options.windowsHide !== false
    
    // Retry configuration
    this.retries = Math.max(0, Math.min(10, options.retries || 0))
    this.retryDelay = Math.max(100, options.retryDelay || 1000)
    this.retryOn = options.retryOn || ['timeout', 'error']
    
    // Monitoring
    this.onStart = options.onStart
    this.onExit = options.onExit
    this.onStdout = options.onStdout
    this.onStderr = options.onStderr
    this.onProgress = options.onProgress
    
    // Validation
    this.validate()
  }

  validate() {
    if (this.timeout < 1000 || this.timeout > 600000) {
      throw new Error('Timeout must be between 1000ms and 600000ms (10 minutes)')
    }
    
    if (this.maxBuffer < 1024 || this.maxBuffer > 100 * 1024 * 1024) {
      throw new Error('Max buffer must be between 1KB and 100MB')
    }
  }

  shouldRetry(error, attempt) {
    if (attempt >= this.retries) return false
    
    if (error instanceof ProcessTimeoutError && this.retryOn.includes('timeout')) {
      return true
    }
    
    if (error instanceof ProcessError && this.retryOn.includes('error')) {
      // Don't retry on certain exit codes that indicate permanent failures
      if (error.result && [126, 127].includes(error.result.exitCode)) {
        return false // Command not found or not executable
      }
      return true
    }
    
    return this.retryOn.includes('any')
  }
}

/**
 * Advanced process manager
 */
class ProcessManager {
  constructor(name = 'default') {
    this.name = name
    this.logger = getLogger(`ProcessManager:${name}`)
    this.activeProcesses = new Map()
    this.processCounter = 0
    this.stats = {
      started: 0,
      completed: 0,
      failed: 0,
      timedOut: 0,
      retried: 0
    }
  }

  /**
   * Execute a command with advanced options and retry logic
   */
  async execute(command, args = [], options = {}) {
    const opts = new ProcessOptions(options)
    const processId = `${this.name}-${++this.processCounter}`
    
    this.logger.debug(`Starting process ${processId}`, { command, args, options: opts })
    
    let lastError
    let attempt = 0
    
    while (attempt <= opts.retries) {
      try {
        const result = await this.executeOnce(processId, command, args, opts)
        
        if (attempt > 0) {
          this.logger.info(`Process ${processId} succeeded after ${attempt} retries`)
          this.stats.retried++
        }
        
        return result
        
      } catch (error) {
        lastError = error
        attempt++
        
        if (opts.shouldRetry(error, attempt)) {
          const delay = opts.retryDelay * Math.pow(2, attempt - 1) // Exponential backoff
          this.logger.warn(`Process ${processId} failed, retrying in ${delay}ms (attempt ${attempt}/${opts.retries + 1})`, {
            error: error.message
          })
          
          await this.delay(delay)
          continue
        }
        
        break
      }
    }
    
    this.logger.error(`Process ${processId} failed after ${attempt} attempts`, {
      error: lastError.message
    })
    
    throw lastError
  }

  /**
   * Execute a single process attempt
   */
  async executeOnce(processId, command, args, options) {
    const startTime = performance.now()
    this.stats.started++
    
    return new Promise((resolve, reject) => {
      let stdout = ''
      let stderr = ''
      let isTimeout = false
      let child
      
      try {
        // Spawn the process
        child = spawn(command, args, {
          cwd: options.cwd,
          env: options.env,
          stdio: options.stdio,
          shell: options.shell,
          windowsHide: options.windowsHide
        })
        
        this.activeProcesses.set(processId, child)
        
        if (options.onStart) {
          options.onStart(child, processId)
        }
        
        this.logger.trace(`Process ${processId} spawned with PID ${child.pid}`)
        
      } catch (error) {
        const result = new ProcessResult(command, -1, null, '', error.message, 0)
        const processError = new ProcessError(`Failed to spawn process: ${error.message}`, result)
        this.stats.failed++
        return reject(processError)
      }
      
      // Set up timeout
      const timeoutId = setTimeout(() => {
        isTimeout = true
        this.logger.warn(`Process ${processId} timed out after ${options.timeout}ms, attempting graceful shutdown`)
        
        // Attempt graceful shutdown first
        child.kill(options.killSignal)
        
        // Force kill after grace period
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL')
          }
        }, 5000)
      }, options.timeout)
      
      // Handle stdout
      if (child.stdout) {
        child.stdout.setEncoding(options.encoding)
        child.stdout.on('data', (data) => {
          stdout += data
          if (options.onStdout) {
            options.onStdout(data, processId)
          }
          if (options.onProgress) {
            options.onProgress({ type: 'stdout', data }, processId)
          }
        })
      }
      
      // Handle stderr
      if (child.stderr) {
        child.stderr.setEncoding(options.encoding)
        child.stderr.on('data', (data) => {
          stderr += data
          if (options.onStderr) {
            options.onStderr(data, processId)
          }
          if (options.onProgress) {
            options.onProgress({ type: 'stderr', data }, processId)
          }
        })
      }
      
      // Handle process exit
      child.on('exit', (exitCode, signal) => {
        clearTimeout(timeoutId)
        this.activeProcesses.delete(processId)
        
        const duration = performance.now() - startTime
        const result = new ProcessResult(command, exitCode, signal, stdout, stderr, duration)
        
        if (options.onExit) {
          options.onExit(result, processId)
        }
        
        this.logger.trace(`Process ${processId} exited`, {
          exitCode,
          signal,
          duration: `${duration.toFixed(2)}ms`
        })
        
        if (result.success) {
          this.stats.completed++
          resolve(result)
        } else {
          this.stats.failed++
          
          if (isTimeout) {
            this.stats.timedOut++
            const error = new ProcessTimeoutError(
              `Process timed out after ${options.timeout}ms`,
              result,
              options.timeout
            )
            reject(error)
          } else {
            const error = new ProcessError(
              `Process failed with exit code ${exitCode} and signal ${signal}`,
              result
            )
            reject(error)
          }
        }
      })
      
      // Handle process errors
      child.on('error', (error) => {
        clearTimeout(timeoutId)
        this.activeProcesses.delete(processId)
        
        const duration = performance.now() - startTime
        const result = new ProcessResult(command, -1, null, stdout, stderr, duration)
        
        this.logger.error(`Process ${processId} error: ${error.message}`)
        this.stats.failed++
        
        reject(new ProcessError(`Process error: ${error.message}`, result))
      })
    })
  }

  /**
   * Execute a shell command (convenience method)
   */
  async shell(command, options = {}) {
    return this.execute('/bin/sh', ['-c', command], { shell: true, ...options })
  }

  /**
   * Execute multiple commands in parallel
   */
  async parallel(commands, options = {}) {
    const maxConcurrency = options.maxConcurrency || 5
    const results = []
    const errors = []
    
    // Create semaphore for concurrency control
    const semaphore = Array.from({ length: maxConcurrency }, () => Promise.resolve())
    let semaphoreIndex = 0
    
    const executeCommand = async (cmd, index) => {
      // Wait for available slot
      await semaphore[semaphoreIndex]
      const currentIndex = semaphoreIndex
      semaphoreIndex = (semaphoreIndex + 1) % maxConcurrency
      
      try {
        let result
        if (typeof cmd === 'string') {
          result = await this.shell(cmd, options)
        } else {
          result = await this.execute(cmd.command, cmd.args || [], cmd.options || options)
        }
        
        results[index] = result
        return result
      } catch (error) {
        errors[index] = error
        if (options.failFast !== false) {
          throw error
        }
        return error
      } finally {
        semaphore[currentIndex] = Promise.resolve()
      }
    }
    
    const commandPromises = commands.map((cmd, index) => executeCommand(cmd, index))
    
    if (options.failFast !== false) {
      await Promise.all(commandPromises)
    } else {
      await Promise.allSettled(commandPromises)
    }
    
    return { results, errors }
  }

  /**
   * Execute commands in sequence
   */
  async sequence(commands, options = {}) {
    const results = []
    
    for (const [index, cmd] of commands.entries()) {
      try {
        let result
        if (typeof cmd === 'string') {
          result = await this.shell(cmd, options)
        } else {
          result = await this.execute(cmd.command, cmd.args || [], cmd.options || options)
        }
        
        results.push(result)
        
        if (options.onStep) {
          options.onStep(result, index, commands.length)
        }
        
      } catch (error) {
        if (options.continueOnError) {
          results.push(error)
          continue
        }
        throw error
      }
    }
    
    return results
  }

  /**
   * Kill all active processes
   */
  killAll(signal = 'SIGTERM') {
    this.logger.info(`Killing ${this.activeProcesses.size} active processes with ${signal}`)
    
    for (const [processId, child] of this.activeProcesses) {
      try {
        child.kill(signal)
        this.logger.debug(`Killed process ${processId}`)
      } catch (error) {
        this.logger.warn(`Failed to kill process ${processId}: ${error.message}`)
      }
    }
    
    // Force kill after grace period
    if (signal !== 'SIGKILL') {
      setTimeout(() => {
        for (const [processId, child] of this.activeProcesses) {
          if (!child.killed) {
            try {
              child.kill('SIGKILL')
              this.logger.debug(`Force killed process ${processId}`)
            } catch (error) {
              // Process might already be dead
            }
          }
        }
      }, 5000)
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      active: this.activeProcesses.size
    }
  }

  /**
   * Wait for a specified delay
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// Global process manager instance
let globalProcessManager = null

/**
 * Get global process manager
 */
function getProcessManager(name = 'global') {
  if (!globalProcessManager || globalProcessManager.name !== name) {
    globalProcessManager = new ProcessManager(name)
  }
  return globalProcessManager
}

// Cleanup on process exit
process.on('SIGINT', () => {
  if (globalProcessManager) {
    globalProcessManager.killAll('SIGINT')
  }
  process.exit(130)
})

process.on('SIGTERM', () => {
  if (globalProcessManager) {
    globalProcessManager.killAll('SIGTERM')
  }
  process.exit(143)
})

module.exports = {
  ProcessManager,
  ProcessOptions,
  ProcessResult,
  ProcessError,
  ProcessTimeoutError,
  getProcessManager
}