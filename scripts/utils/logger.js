/**
 * Enterprise Logging Utility
 * Structured logging with levels, formatting, and output management
 */

const fs = require('fs').promises
const path = require('path')
const { performance } = require('perf_hooks')

/**
 * Log levels with numeric values for filtering
 */
const LOG_LEVELS = {
  TRACE: 10,
  DEBUG: 20,
  INFO: 30,
  WARN: 40,
  ERROR: 50,
  FATAL: 60
}

/**
 * ANSI color codes for console output
 */
const COLORS = {
  TRACE: '\x1b[90m',    // Gray
  DEBUG: '\x1b[36m',    // Cyan
  INFO: '\x1b[32m',     // Green
  WARN: '\x1b[33m',     // Yellow
  ERROR: '\x1b[31m',    // Red
  FATAL: '\x1b[35m',    // Magenta
  RESET: '\x1b[0m',
  BOLD: '\x1b[1m',
  DIM: '\x1b[2m'
}

/**
 * Log formatters for different output types
 */
class LogFormatter {
  static json(entry) {
    return JSON.stringify(entry) + '\n'
  }

  static text(entry) {
    const timestamp = new Date(entry.timestamp).toISOString()
    const level = entry.level.padEnd(5)
    const name = entry.name ? `[${entry.name}] ` : ''
    
    let message = `${timestamp} ${level} ${name}${entry.message}`
    
    if (entry.data && Object.keys(entry.data).length > 0) {
      message += ' ' + JSON.stringify(entry.data)
    }
    
    if (entry.error) {
      message += '\n' + entry.error.stack
    }
    
    return message + '\n'
  }

  static console(entry, useColors = true) {
    if (!useColors) {
      return LogFormatter.text(entry)
    }

    const color = COLORS[entry.level] || ''
    const reset = COLORS.RESET
    const timestamp = new Date(entry.timestamp).toISOString()
    const level = entry.level.padEnd(5)
    const name = entry.name ? `${COLORS.DIM}[${entry.name}]${reset} ` : ''
    
    let message = `${COLORS.DIM}${timestamp}${reset} ${color}${level}${reset} ${name}${entry.message}`
    
    if (entry.data && Object.keys(entry.data).length > 0) {
      message += ' ' + JSON.stringify(entry.data, null, 2)
    }
    
    if (entry.error) {
      message += '\n' + COLORS.ERROR + entry.error.stack + reset
    }
    
    return message + '\n'
  }

  static minimal(entry) {
    const level = entry.level.charAt(0).toUpperCase()
    const name = entry.name ? `[${entry.name}] ` : ''
    return `${level} ${name}${entry.message}\n`
  }
}

/**
 * Log transport for writing to various destinations
 */
class LogTransport {
  constructor(config = {}) {
    this.level = config.level || 'INFO'
    this.formatter = config.formatter || LogFormatter.console
    this.filter = config.filter || (() => true)
  }

  shouldLog(level) {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level]
  }

  async write(entry) {
    if (!this.shouldLog(entry.level) || !this.filter(entry)) {
      return
    }

    const formatted = this.formatter(entry)
    await this.output(formatted)
  }

  // Override in subclasses
  async output(formatted) {
    throw new Error('LogTransport.output must be implemented by subclasses')
  }
}

/**
 * Console transport
 */
class ConsoleTransport extends LogTransport {
  constructor(config = {}) {
    super({
      formatter: LogFormatter.console,
      ...config
    })
    this.useColors = config.useColors !== false && process.stdout.isTTY
  }

  async output(formatted) {
    if (this.level === 'ERROR' || this.level === 'FATAL') {
      process.stderr.write(formatted)
    } else {
      process.stdout.write(formatted)
    }
  }

  formatter(entry) {
    return super.formatter(entry, this.useColors)
  }
}

/**
 * File transport
 */
class FileTransport extends LogTransport {
  constructor(config = {}) {
    super({
      formatter: LogFormatter.json,
      ...config
    })
    this.filename = config.filename || 'app.log'
    this.maxSize = config.maxSize || 10 * 1024 * 1024 // 10MB
    this.maxFiles = config.maxFiles || 5
    this.buffer = []
    this.bufferSize = config.bufferSize || 100
    this.flushInterval = config.flushInterval || 5000
    
    this.setupFlushTimer()
  }

  async output(formatted) {
    this.buffer.push(formatted)
    
    if (this.buffer.length >= this.bufferSize) {
      await this.flush()
    }
  }

  async flush() {
    if (this.buffer.length === 0) return

    try {
      await this.rotateIfNeeded()
      await fs.appendFile(this.filename, this.buffer.join(''))
      this.buffer = []
    } catch (error) {
      console.error('Failed to write log file:', error.message)
    }
  }

  async rotateIfNeeded() {
    try {
      const stats = await fs.stat(this.filename)
      if (stats.size >= this.maxSize) {
        await this.rotate()
      }
    } catch (error) {
      // File doesn't exist yet, no rotation needed
    }
  }

  async rotate() {
    for (let i = this.maxFiles - 1; i > 0; i--) {
      const oldFile = `${this.filename}.${i}`
      const newFile = `${this.filename}.${i + 1}`
      
      try {
        await fs.rename(oldFile, newFile)
      } catch (error) {
        // File might not exist
      }
    }
    
    try {
      await fs.rename(this.filename, `${this.filename}.1`)
    } catch (error) {
      // Current file might not exist
    }
  }

  setupFlushTimer() {
    setInterval(() => {
      this.flush().catch(console.error)
    }, this.flushInterval)
  }

  async close() {
    await this.flush()
  }
}

/**
 * Main logger class
 */
class Logger {
  constructor(name = '', config = {}) {
    this.name = name
    this.transports = []
    this.context = {}
    this.startTime = performance.now()
    
    // Default console transport
    if (config.console !== false) {
      this.addTransport(new ConsoleTransport(config.console || {}))
    }
    
    // Optional file transport
    if (config.file) {
      this.addTransport(new FileTransport(config.file))
    }
  }

  addTransport(transport) {
    this.transports.push(transport)
  }

  setContext(key, value) {
    this.context[key] = value
  }

  clearContext() {
    this.context = {}
  }

  child(name, context = {}) {
    const childLogger = new Logger(`${this.name}:${name}`)
    childLogger.transports = this.transports
    childLogger.context = { ...this.context, ...context }
    return childLogger
  }

  async log(level, message, data = {}, error = null) {
    const entry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      name: this.name,
      message: String(message),
      data: { ...this.context, ...data },
      error: error,
      pid: process.pid,
      uptime: performance.now() - this.startTime
    }

    const writePromises = this.transports.map(transport => 
      transport.write(entry).catch(err => 
        console.error('Transport write failed:', err.message)
      )
    )

    await Promise.allSettled(writePromises)
  }

  // Convenience methods
  trace(message, data, error) { return this.log('TRACE', message, data, error) }
  debug(message, data, error) { return this.log('DEBUG', message, data, error) }
  info(message, data, error) { return this.log('INFO', message, data, error) }
  warn(message, data, error) { return this.log('WARN', message, data, error) }
  error(message, data, error) { return this.log('ERROR', message, data, error) }
  fatal(message, data, error) { return this.log('FATAL', message, data, error) }

  // Performance timing helpers
  time(label) {
    this.setContext(`timer_${label}`, performance.now())
  }

  timeEnd(label, message = `Timer ${label} completed`) {
    const startTime = this.context[`timer_${label}`]
    if (startTime) {
      const duration = performance.now() - startTime
      this.info(message, { duration: `${duration.toFixed(2)}ms`, label })
      delete this.context[`timer_${label}`]
    }
  }

  // Request logging helpers
  request(method, url, data = {}) {
    return this.info(`${method} ${url}`, { type: 'request', ...data })
  }

  response(status, duration, data = {}) {
    const level = status >= 400 ? 'ERROR' : status >= 300 ? 'WARN' : 'INFO'
    return this.log(level, `Response ${status}`, { 
      type: 'response', 
      status, 
      duration: `${duration.toFixed(2)}ms`,
      ...data 
    })
  }

  async close() {
    const closePromises = this.transports
      .filter(transport => transport.close)
      .map(transport => transport.close())
    
    await Promise.allSettled(closePromises)
  }
}

/**
 * Global logger factory
 */
const loggers = new Map()

function getLogger(name = 'default', config = {}) {
  if (!loggers.has(name)) {
    loggers.set(name, new Logger(name, config))
  }
  return loggers.get(name)
}

function createLogger(name, config = {}) {
  const logger = new Logger(name, config)
  loggers.set(name, logger)
  return logger
}

// Cleanup on process exit
process.on('exit', () => {
  loggers.forEach(logger => {
    logger.close().catch(() => {})
  })
})

process.on('SIGINT', async () => {
  await Promise.allSettled(
    Array.from(loggers.values()).map(logger => logger.close())
  )
  process.exit(130)
})

module.exports = {
  Logger,
  LogTransport,
  ConsoleTransport,
  FileTransport,
  LogFormatter,
  LOG_LEVELS,
  COLORS,
  getLogger,
  createLogger
}