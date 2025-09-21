/**
 * Enterprise Security Utilities
 * Comprehensive security features for Next.js build scripts and servers
 */

const crypto = require('crypto')
const path = require('path')
const fs = require('fs').promises

/**
 * Input validation and sanitization utilities
 */
class InputValidator {
  /**
   * Sanitize file paths to prevent directory traversal attacks
   */
  static sanitizePath(inputPath, basePath = process.cwd()) {
    if (typeof inputPath !== 'string' || inputPath.trim().length === 0) {
      throw new Error('Invalid path: must be a non-empty string')
    }

    // Remove null bytes and other dangerous characters
    const sanitized = inputPath.replace(/\0/g, '').trim()
    
    if (sanitized !== inputPath) {
      throw new Error('Path contains illegal characters')
    }

    // Resolve and normalize the path
    const resolvedPath = path.resolve(basePath, sanitized)
    const normalizedBase = path.normalize(basePath)
    
    // Ensure the resolved path is within the base path
    if (!resolvedPath.startsWith(normalizedBase)) {
      throw new Error('Path traversal attempt detected')
    }

    return resolvedPath
  }

  /**
   * Validate and sanitize URLs
   */
  static sanitizeUrl(url, allowedHosts = []) {
    if (typeof url !== 'string' || url.trim().length === 0) {
      throw new Error('Invalid URL: must be a non-empty string')
    }

    const sanitized = url.trim()
    
    if (sanitized.length > 2048) {
      throw new Error('URL too long')
    }

    try {
      const parsedUrl = new URL(sanitized)
      
      // Only allow HTTP and HTTPS
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Invalid protocol: only HTTP and HTTPS are allowed')
      }

      // Check against allowed hosts if specified
      if (allowedHosts.length > 0 && !allowedHosts.includes(parsedUrl.hostname)) {
        throw new Error(`Host not allowed: ${parsedUrl.hostname}`)
      }

      return sanitized
    } catch (error) {
      throw new Error(`Invalid URL format: ${error.message}`)
    }
  }

  /**
   * Validate command line arguments
   */
  static validateCommandArgs(args, maxArgs = 10, maxLength = 1000) {
    if (!Array.isArray(args)) {
      throw new Error('Arguments must be an array')
    }

    if (args.length > maxArgs) {
      throw new Error(`Too many arguments: ${args.length} > ${maxArgs}`)
    }

    for (const [index, arg] of args.entries()) {
      if (typeof arg !== 'string') {
        throw new Error(`Argument ${index} must be a string`)
      }

      if (arg.length > maxLength) {
        throw new Error(`Argument ${index} too long: ${arg.length} > ${maxLength}`)
      }

      // Check for shell injection patterns
      if (/[;&|`$(){}[\]<>]/.test(arg)) {
        throw new Error(`Argument ${index} contains potentially dangerous characters`)
      }
    }

    return args
  }

  /**
   * Validate environment variable names and values
   */
  static validateEnvVar(name, value, maxLength = 1000) {
    if (typeof name !== 'string' || !/^[A-Z_][A-Z0-9_]*$/i.test(name)) {
      throw new Error('Invalid environment variable name')
    }

    if (typeof value !== 'string') {
      throw new Error('Environment variable value must be a string')
    }

    if (value.length > maxLength) {
      throw new Error(`Environment variable value too long: ${value.length} > ${maxLength}`)
    }

    return { name, value }
  }
}

/**
 * Credential management with encryption
 */
class CredentialManager {
  constructor(keyPath = '.config/encryption.key') {
    this.keyPath = keyPath
    this.key = null
    this.algorithm = 'aes-256-gcm'
  }

  /**
   * Initialize encryption key
   */
  async initializeKey() {
    try {
      const keyData = await fs.readFile(this.keyPath)
      this.key = keyData
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.warn('🔐 Encryption key not found, generating new key...')
        await this.generateKey()
      } else {
        throw new Error(`Failed to load encryption key: ${error.message}`)
      }
    }
  }

  /**
   * Generate new encryption key
   */
  async generateKey() {
    this.key = crypto.randomBytes(32)
    
    // Ensure directory exists
    await fs.mkdir(path.dirname(this.keyPath), { recursive: true })
    
    // Save key with restricted permissions
    await fs.writeFile(this.keyPath, this.key, { mode: 0o600 })
    console.log(`🔑 New encryption key saved to ${this.keyPath}`)
  }

  /**
   * Encrypt sensitive data
   */
  encrypt(text) {
    if (!this.key) {
      throw new Error('Encryption key not initialized')
    }

    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipher(this.algorithm, this.key)
    
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    
    const authTag = cipher.getAuthTag()
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    }
  }

  /**
   * Decrypt sensitive data
   */
  decrypt(encryptedData) {
    if (!this.key) {
      throw new Error('Encryption key not initialized')
    }

    const { encrypted, iv, authTag } = encryptedData
    const decipher = crypto.createDecipher(this.algorithm, this.key)
    
    decipher.setAuthTag(Buffer.from(authTag, 'hex'))
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    
    return decrypted
  }

  /**
   * Store encrypted credential
   */
  async storeCredential(name, value) {
    const encrypted = this.encrypt(value)
    const credentialPath = path.join(path.dirname(this.keyPath), `${name}.cred`)
    
    await fs.writeFile(credentialPath, JSON.stringify(encrypted), { mode: 0o600 })
    console.log(`🔒 Credential '${name}' stored securely`)
  }

  /**
   * Retrieve decrypted credential
   */
  async getCredential(name) {
    const credentialPath = path.join(path.dirname(this.keyPath), `${name}.cred`)
    
    try {
      const encryptedData = JSON.parse(await fs.readFile(credentialPath, 'utf8'))
      return this.decrypt(encryptedData)
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null // Credential not found
      }
      throw new Error(`Failed to retrieve credential '${name}': ${error.message}`)
    }
  }
}

/**
 * Rate limiting implementation
 */
class RateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60000 // 1 minute
    this.maxRequests = options.maxRequests || 100
    this.store = new Map()
    this.cleanup()
  }

  /**
   * Check if request is within rate limit
   */
  isAllowed(key) {
    const now = Date.now()
    const windowStart = now - this.windowMs
    
    if (!this.store.has(key)) {
      this.store.set(key, [])
    }
    
    const requests = this.store.get(key)
    
    // Remove old requests outside the window
    const validRequests = requests.filter(timestamp => timestamp > windowStart)
    
    if (validRequests.length >= this.maxRequests) {
      return {
        allowed: false,
        retryAfter: Math.ceil((validRequests[0] + this.windowMs - now) / 1000)
      }
    }
    
    // Add current request
    validRequests.push(now)
    this.store.set(key, validRequests)
    
    return {
      allowed: true,
      remaining: this.maxRequests - validRequests.length
    }
  }

  /**
   * Clean up old entries periodically
   */
  cleanup() {
    setInterval(() => {
      const now = Date.now()
      const windowStart = now - this.windowMs
      
      for (const [key, requests] of this.store) {
        const validRequests = requests.filter(timestamp => timestamp > windowStart)
        
        if (validRequests.length === 0) {
          this.store.delete(key)
        } else {
          this.store.set(key, validRequests)
        }
      }
    }, this.windowMs)
  }

  /**
   * Get current statistics
   */
  getStats() {
    return {
      totalKeys: this.store.size,
      windowMs: this.windowMs,
      maxRequests: this.maxRequests
    }
  }
}

/**
 * Security headers manager
 */
class SecurityHeaders {
  static getDefaultHeaders() {
    return {
      // Prevent MIME type sniffing
      'X-Content-Type-Options': 'nosniff',
      
      // Prevent clickjacking
      'X-Frame-Options': 'DENY',
      
      // XSS protection
      'X-XSS-Protection': '1; mode=block',
      
      // Referrer policy
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      
      // Content Security Policy
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
      
      // HSTS (only for HTTPS)
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      
      // Permissions Policy
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
      
      // Remove server information
      'Server': 'Next.js'
    }
  }

  static apply(res, customHeaders = {}) {
    const headers = { ...this.getDefaultHeaders(), ...customHeaders }
    
    for (const [name, value] of Object.entries(headers)) {
      res.setHeader(name, value)
    }
  }
}

/**
 * Cache management with performance optimization
 */
class CacheManager {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 100 // Max number of items
    this.ttl = options.ttl || 300000 // 5 minutes default TTL
    this.cache = new Map()
    this.accessTimes = new Map()
    this.hitCount = 0
    this.missCount = 0
  }

  /**
   * Get item from cache
   */
  get(key) {
    if (this.cache.has(key)) {
      const item = this.cache.get(key)
      
      // Check if item has expired
      if (Date.now() - item.timestamp > this.ttl) {
        this.cache.delete(key)
        this.accessTimes.delete(key)
        this.missCount++
        return null
      }
      
      // Update access time for LRU
      this.accessTimes.set(key, Date.now())
      this.hitCount++
      return item.value
    }
    
    this.missCount++
    return null
  }

  /**
   * Set item in cache
   */
  set(key, value) {
    // If at max capacity, remove LRU item
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU()
    }
    
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    })
    this.accessTimes.set(key, Date.now())
  }

  /**
   * Remove least recently used item
   */
  evictLRU() {
    let oldestTime = Date.now()
    let oldestKey = null
    
    for (const [key, time] of this.accessTimes) {
      if (time < oldestTime) {
        oldestTime = time
        oldestKey = key
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey)
      this.accessTimes.delete(oldestKey)
    }
  }

  /**
   * Clear expired items
   */
  cleanup() {
    const now = Date.now()
    
    for (const [key, item] of this.cache) {
      if (now - item.timestamp > this.ttl) {
        this.cache.delete(key)
        this.accessTimes.delete(key)
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: this.hitCount / (this.hitCount + this.missCount) || 0,
      hits: this.hitCount,
      misses: this.missCount
    }
  }

  /**
   * Clear all cache
   */
  clear() {
    this.cache.clear()
    this.accessTimes.clear()
    this.hitCount = 0
    this.missCount = 0
  }
}

/**
 * Resource monitoring and cleanup
 */
class ResourceMonitor {
  constructor() {
    this.resources = new Set()
    this.cleanupCallbacks = []
    this.monitoring = false
    
    this.setupCleanupHandlers()
  }

  /**
   * Register a resource for cleanup
   */
  register(resource, cleanupFn) {
    this.resources.add({
      resource,
      cleanup: cleanupFn,
      created: Date.now()
    })
  }

  /**
   * Start monitoring resources
   */
  startMonitoring(interval = 30000) {
    if (this.monitoring) return
    
    this.monitoring = true
    this.monitorInterval = setInterval(() => {
      this.checkResources()
    }, interval)
  }

  /**
   * Check resource usage and cleanup if needed
   */
  checkResources() {
    const memUsage = process.memoryUsage()
    
    if (memUsage.heapUsed > 500 * 1024 * 1024) { // 500MB threshold
      console.warn('🚨 High memory usage detected, triggering cleanup...')
      this.cleanup()
      
      if (global.gc) {
        global.gc()
      }
    }
  }

  /**
   * Setup cleanup handlers for process termination
   */
  setupCleanupHandlers() {
    const cleanup = () => {
      this.cleanup()
      this.monitoring = false
      if (this.monitorInterval) {
        clearInterval(this.monitorInterval)
      }
    }
    
    process.on('exit', cleanup)
    process.on('SIGINT', cleanup)
    process.on('SIGTERM', cleanup)
    process.on('uncaughtException', (error) => {
      console.error('💥 Uncaught exception:', error)
      cleanup()
      process.exit(1)
    })
  }

  /**
   * Cleanup all registered resources
   */
  cleanup() {
    for (const item of this.resources) {
      try {
        if (typeof item.cleanup === 'function') {
          item.cleanup()
        }
      } catch (error) {
        console.warn('⚠️  Failed to cleanup resource:', error.message)
      }
    }
    
    this.resources.clear()
    
    // Run additional cleanup callbacks
    for (const callback of this.cleanupCallbacks) {
      try {
        callback()
      } catch (error) {
        console.warn('⚠️  Cleanup callback failed:', error.message)
      }
    }
  }

  /**
   * Add cleanup callback
   */
  onCleanup(callback) {
    this.cleanupCallbacks.push(callback)
  }
}

// Global instances
let globalCredentialManager = null
let globalResourceMonitor = null

/**
 * Get global credential manager
 */
async function getCredentialManager() {
  if (!globalCredentialManager) {
    globalCredentialManager = new CredentialManager()
    await globalCredentialManager.initializeKey()
  }
  return globalCredentialManager
}

/**
 * Get global resource monitor
 */
function getResourceMonitor() {
  if (!globalResourceMonitor) {
    globalResourceMonitor = new ResourceMonitor()
    globalResourceMonitor.startMonitoring()
  }
  return globalResourceMonitor
}

module.exports = {
  InputValidator,
  CredentialManager,
  RateLimiter,
  SecurityHeaders,
  CacheManager,
  ResourceMonitor,
  getCredentialManager,
  getResourceMonitor
}