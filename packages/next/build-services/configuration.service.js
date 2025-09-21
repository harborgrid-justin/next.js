/**
 * Configuration Service
 * Centralized configuration management service
 * SOA Improvement: Modular configuration management
 */

const path = require('path')
const fs = require('fs').promises

/**
 * Configuration Service
 */
class ConfigurationService {
  constructor(options = {}) {
    this.configs = new Map()
    this.watchers = new Map()
    this.validators = new Map()
    this.transformers = new Map()
    this.defaults = new Map()
    this.basePath = options.basePath || process.cwd()
    this.autoReload = options.autoReload !== false
  }

  /**
   * Register a configuration source
   * @param {string} name - Configuration name
   * @param {string} filePath - Path to config file
   * @param {Object} options - Configuration options
   */
  registerConfig(name, filePath, options = {}) {
    const configData = {
      name,
      filePath: path.resolve(this.basePath, filePath),
      format: options.format || this.detectFormat(filePath),
      required: options.required !== false,
      validator: options.validator,
      transformer: options.transformer,
      defaults: options.defaults || {},
      cache: options.cache !== false,
      lastModified: null,
      data: null
    }

    this.configs.set(name, configData)

    // Set up file watcher if auto-reload is enabled
    if (this.autoReload) {
      this.setupConfigWatcher(name, configData)
    }

    return this
  }

  /**
   * Register a configuration validator
   * @param {string} configName - Configuration name
   * @param {Function} validator - Validation function
   */
  registerValidator(configName, validator) {
    this.validators.set(configName, validator)
    return this
  }

  /**
   * Register a configuration transformer
   * @param {string} configName - Configuration name
   * @param {Function} transformer - Transformation function
   */
  registerTransformer(configName, transformer) {
    this.transformers.set(configName, transformer)
    return this
  }

  /**
   * Load configuration
   * @param {string} name - Configuration name
   */
  async loadConfig(name) {
    const configData = this.configs.get(name)
    if (!configData) {
      throw new Error(`Configuration not registered: ${name}`)
    }

    try {
      // Check if file exists
      const stats = await fs.stat(configData.filePath)
      
      // Check if cached version is up to date
      if (configData.cache && 
          configData.data && 
          configData.lastModified && 
          stats.mtime <= configData.lastModified) {
        return configData.data
      }

      // Read configuration file
      const content = await fs.readFile(configData.filePath, 'utf-8')
      
      // Parse based on format
      let parsedConfig = await this.parseConfig(content, configData.format)
      
      // Apply defaults
      parsedConfig = { ...configData.defaults, ...parsedConfig }

      // Transform if transformer is registered
      if (this.transformers.has(name)) {
        const transformer = this.transformers.get(name)
        parsedConfig = await transformer(parsedConfig)
      }

      // Validate if validator is registered
      if (this.validators.has(name)) {
        const validator = this.validators.get(name)
        const validationResult = await validator(parsedConfig)
        if (validationResult !== true) {
          throw new Error(`Configuration validation failed for ${name}: ${validationResult}`)
        }
      }

      // Cache the result
      configData.data = parsedConfig
      configData.lastModified = stats.mtime

      return parsedConfig

    } catch (error) {
      if (configData.required) {
        throw error
      }
      
      // Return defaults for non-required configs
      return configData.defaults
    }
  }

  /**
   * Get configuration value with dot notation support
   * @param {string} configName - Configuration name
   * @param {string} keyPath - Key path (e.g., 'server.port')
   * @param {*} defaultValue - Default value if key not found
   */
  async get(configName, keyPath, defaultValue) {
    const config = await this.loadConfig(configName)
    return this.getNestedValue(config, keyPath, defaultValue)
  }

  /**
   * Set configuration value
   * @param {string} configName - Configuration name
   * @param {string} keyPath - Key path
   * @param {*} value - Value to set
   */
  async set(configName, keyPath, value) {
    const config = await this.loadConfig(configName)
    this.setNestedValue(config, keyPath, value)
    
    // Clear cache to force reload
    const configData = this.configs.get(configName)
    if (configData) {
      configData.data = config
    }
  }

  /**
   * Parse configuration based on format
   */
  async parseConfig(content, format) {
    switch (format) {
      case 'json':
        return JSON.parse(content)
      
      case 'js':
      case 'mjs':
        // Dynamically import JS config
        const tempFile = path.join(__dirname, `temp-config-${Date.now()}.mjs`)
        await fs.writeFile(tempFile, content)
        try {
          const module = await import(`file://${tempFile}`)
          return module.default || module
        } finally {
          await fs.unlink(tempFile).catch(() => {})
        }
      
      case 'yaml':
      case 'yml':
        const yaml = require('yaml')
        return yaml.parse(content)
      
      case 'toml':
        const toml = require('toml')
        return toml.parse(content)
      
      default:
        throw new Error(`Unsupported config format: ${format}`)
    }
  }

  /**
   * Detect configuration format from file extension
   */
  detectFormat(filePath) {
    const ext = path.extname(filePath).toLowerCase()
    
    switch (ext) {
      case '.json':
        return 'json'
      case '.js':
        return 'js'
      case '.mjs':
        return 'mjs'
      case '.yaml':
      case '.yml':
        return 'yaml'
      case '.toml':
        return 'toml'
      default:
        return 'json'
    }
  }

  /**
   * Setup file watcher for configuration
   */
  setupConfigWatcher(name, configData) {
    const chokidar = require('chokidar')
    
    const watcher = chokidar.watch(configData.filePath)
    
    watcher.on('change', async () => {
      try {
        // Invalidate cache
        configData.data = null
        configData.lastModified = null
        
        // Reload config
        await this.loadConfig(name)
        
        // Emit change event
        this.emit('config-changed', name, configData.data)
      } catch (error) {
        this.emit('config-error', name, error)
      }
    })

    this.watchers.set(name, watcher)
  }

  /**
   * Get nested value from object using dot notation
   */
  getNestedValue(obj, keyPath, defaultValue) {
    const keys = keyPath.split('.')
    let current = obj

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key]
      } else {
        return defaultValue
      }
    }

    return current
  }

  /**
   * Set nested value in object using dot notation
   */
  setNestedValue(obj, keyPath, value) {
    const keys = keyPath.split('.')
    const lastKey = keys.pop()
    let current = obj

    for (const key of keys) {
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {}
      }
      current = current[key]
    }

    current[lastKey] = value
  }

  /**
   * Reload all configurations
   */
  async reloadAll() {
    const reloadPromises = []
    
    for (const [name, configData] of this.configs) {
      // Invalidate cache
      configData.data = null
      configData.lastModified = null
      
      reloadPromises.push(this.loadConfig(name))
    }

    return Promise.all(reloadPromises)
  }

  /**
   * Close all file watchers
   */
  async close() {
    for (const watcher of this.watchers.values()) {
      await watcher.close()
    }
    this.watchers.clear()
  }
}

/**
 * Next.js Configuration Service
 */
class NextJSConfigurationService extends ConfigurationService {
  constructor(options = {}) {
    super(options)
    this.setupNextJSConfigs()
  }

  setupNextJSConfigs() {
    // Register next.config.js
    this.registerConfig('next', 'next.config.js', {
      required: false,
      defaults: {
        reactStrictMode: false,
        poweredByHeader: true,
        generateEtags: true,
        compress: true
      },
      validator: this.validateNextConfig.bind(this),
      transformer: this.transformNextConfig.bind(this)
    })

    // Register package.json
    this.registerConfig('package', 'package.json', {
      required: true,
      format: 'json'
    })

    // Register tsconfig.json
    this.registerConfig('typescript', 'tsconfig.json', {
      required: false,
      format: 'json',
      defaults: {
        compilerOptions: {
          target: 'es5',
          lib: ['dom', 'dom.iterable', 'esnext'],
          allowJs: true,
          skipLibCheck: true,
          strict: true,
          esModuleInterop: true,
          module: 'esnext',
          moduleResolution: 'node',
          resolveJsonModule: true,
          isolatedModules: true,
          noEmit: true,
          jsx: 'preserve'
        },
        include: ['next-env.d.ts', '**/*.ts', '**/*.tsx'],
        exclude: ['node_modules']
      }
    })
  }

  /**
   * Validate Next.js configuration
   */
  async validateNextConfig(config) {
    // Basic validation for Next.js config
    if (config.experimental && typeof config.experimental !== 'object') {
      return 'experimental must be an object'
    }

    if (config.images && typeof config.images !== 'object') {
      return 'images must be an object'
    }

    return true
  }

  /**
   * Transform Next.js configuration
   */
  async transformNextConfig(config) {
    // Ensure experimental object exists
    if (!config.experimental) {
      config.experimental = {}
    }

    // Transform webpack function if it exists
    if (typeof config.webpack === 'function') {
      const originalWebpack = config.webpack
      config.webpack = (webpackConfig, context) => {
        // Add custom webpack modifications here if needed
        return originalWebpack(webpackConfig, context)
      }
    }

    return config
  }

  /**
   * Get Next.js specific configuration
   */
  async getNextConfig() {
    return this.loadConfig('next')
  }

  /**
   * Get build configuration
   */
  async getBuildConfig() {
    const nextConfig = await this.getNextConfig()
    const packageConfig = await this.loadConfig('package')

    return {
      output: nextConfig.output || 'standalone',
      distDir: nextConfig.distDir || '.next',
      buildId: nextConfig.generateBuildId ? await nextConfig.generateBuildId() : null,
      env: nextConfig.env || {},
      experimental: nextConfig.experimental || {},
      typescript: await this.loadConfig('typescript')
    }
  }
}

module.exports = { ConfigurationService, NextJSConfigurationService }