/**
 * Enterprise Configuration Management Utility
 * Centralized configuration management for Next.js build scripts
 */

const path = require('path')
const fs = require('fs').promises

/**
 * Configuration validation schemas
 */
const CONFIG_SCHEMAS = {
  github: {
    required: ['token', 'repository'],
    optional: ['apiVersion', 'baseUrl', 'timeout'],
    defaults: {
      apiVersion: '2022-11-28',
      baseUrl: 'https://api.github.com',
      timeout: 30000
    }
  },
  turbo: {
    required: ['version'],
    optional: ['timeout', 'maxRetries', 'cacheDir'],
    defaults: {
      version: 'latest',
      timeout: 300000,
      maxRetries: 3,
      cacheDir: '.turbo'
    }
  },
  build: {
    required: [],
    optional: ['outputDir', 'sourceDir', 'verbose', 'dryRun'],
    defaults: {
      outputDir: 'dist',
      sourceDir: 'src',
      verbose: false,
      dryRun: false
    }
  }
}

/**
 * Configuration validation error
 */
class ConfigValidationError extends Error {
  constructor(message, field, value) {
    super(message)
    this.name = 'ConfigValidationError'
    this.field = field
    this.value = value
  }
}

/**
 * Configuration manager class
 */
class ConfigManager {
  constructor() {
    this.configs = new Map()
    this.watchers = new Map()
    this.environment = process.env.NODE_ENV || 'development'
  }

  /**
   * Load configuration from multiple sources with priority order:
   * 1. Environment variables
   * 2. Config files (.config/scriptname.json)
   * 3. Package.json script configurations
   * 4. Default values
   */
  async loadConfig(name, schema = null) {
    if (!schema && CONFIG_SCHEMAS[name]) {
      schema = CONFIG_SCHEMAS[name]
    }

    const config = {}
    const sources = []

    try {
      // 1. Load from environment variables
      const envConfig = this.loadFromEnvironment(name, schema)
      if (Object.keys(envConfig).length > 0) {
        Object.assign(config, envConfig)
        sources.push('environment')
      }

      // 2. Load from config files
      const fileConfig = await this.loadFromFile(name)
      if (fileConfig && Object.keys(fileConfig).length > 0) {
        Object.assign(config, fileConfig)
        sources.push('file')
      }

      // 3. Load from package.json
      const packageConfig = await this.loadFromPackageJson(name)
      if (packageConfig && Object.keys(packageConfig).length > 0) {
        Object.assign(config, packageConfig)
        sources.push('package.json')
      }

      // 4. Apply defaults
      if (schema?.defaults) {
        for (const [key, defaultValue] of Object.entries(schema.defaults)) {
          if (!(key in config)) {
            config[key] = defaultValue
          }
        }
        sources.push('defaults')
      }

      // Validate configuration
      if (schema) {
        this.validateConfig(config, schema, name)
      }

      // Cache the configuration
      this.configs.set(name, {
        data: config,
        sources,
        loadedAt: new Date(),
        schema
      })

      console.log(`✅ Loaded configuration '${name}' from: ${sources.join(', ')}`)
      return config

    } catch (error) {
      throw new ConfigValidationError(
        `Failed to load configuration '${name}': ${error.message}`,
        name,
        null
      )
    }
  }

  /**
   * Load configuration from environment variables
   */
  loadFromEnvironment(name, schema) {
    const config = {}
    const prefix = name.toUpperCase() + '_'

    // Get all environment variables with the prefix
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(prefix)) {
        const configKey = key.substring(prefix.length).toLowerCase()
        
        // Parse value based on type
        let parsedValue = value
        if (value === 'true') parsedValue = true
        else if (value === 'false') parsedValue = false
        else if (/^\d+$/.test(value)) parsedValue = parseInt(value, 10)
        else if (/^\d+\.\d+$/.test(value)) parsedValue = parseFloat(value)
        
        config[configKey] = parsedValue
      }
    }

    // Also check some common environment variable names
    if (name === 'github' && process.env.GITHUB_TOKEN) {
      config.token = process.env.GITHUB_TOKEN
    }
    if (name === 'turbo' && process.env.TURBO_VERSION) {
      config.version = process.env.TURBO_VERSION
    }

    return config
  }

  /**
   * Load configuration from file
   */
  async loadFromFile(name) {
    const configPaths = [
      path.join(process.cwd(), '.config', `${name}.json`),
      path.join(process.cwd(), `.${name}rc.json`),
      path.join(process.cwd(), `${name}.config.json`)
    ]

    for (const configPath of configPaths) {
      try {
        const content = await fs.readFile(configPath, 'utf8')
        const config = JSON.parse(content)
        
        // Support environment-specific configs
        if (config[this.environment]) {
          return { ...config.default, ...config[this.environment] }
        }
        
        return config.default || config
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.warn(`Warning: Failed to load config from ${configPath}: ${error.message}`)
        }
      }
    }

    return null
  }

  /**
   * Load configuration from package.json
   */
  async loadFromPackageJson(name) {
    try {
      const packagePath = path.join(process.cwd(), 'package.json')
      const content = await fs.readFile(packagePath, 'utf8')
      const packageJson = JSON.parse(content)
      
      return packageJson.config?.[name] || packageJson[name] || null
    } catch (error) {
      return null
    }
  }

  /**
   * Validate configuration against schema
   */
  validateConfig(config, schema, name) {
    // Check required fields
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in config) || config[field] === null || config[field] === undefined) {
          throw new ConfigValidationError(
            `Missing required field '${field}' in configuration '${name}'`,
            field,
            config[field]
          )
        }
      }
    }

    // Validate field types and constraints
    for (const [field, value] of Object.entries(config)) {
      this.validateField(field, value, name, schema)
    }
  }

  /**
   * Validate individual field
   */
  validateField(field, value, configName, schema) {
    // Common validations
    if (field.includes('timeout') && typeof value === 'number') {
      if (value < 1000 || value > 600000) {
        throw new ConfigValidationError(
          `Timeout '${field}' must be between 1000ms and 600000ms (10 minutes)`,
          field,
          value
        )
      }
    }

    if (field.includes('retry') && typeof value === 'number') {
      if (value < 0 || value > 10) {
        throw new ConfigValidationError(
          `Retry count '${field}' must be between 0 and 10`,
          field,
          value
        )
      }
    }

    if (field === 'token' && typeof value === 'string') {
      if (value.length < 10) {
        throw new ConfigValidationError(
          `Token '${field}' appears to be too short to be valid`,
          field,
          '[REDACTED]'
        )
      }
    }
  }

  /**
   * Get cached configuration
   */
  getConfig(name) {
    const cached = this.configs.get(name)
    if (!cached) {
      throw new Error(`Configuration '${name}' not loaded. Call loadConfig('${name}') first.`)
    }
    return cached.data
  }

  /**
   * Check if configuration exists
   */
  hasConfig(name) {
    return this.configs.has(name)
  }

  /**
   * Reload configuration
   */
  async reloadConfig(name) {
    const cached = this.configs.get(name)
    if (cached) {
      return this.loadConfig(name, cached.schema)
    }
    throw new Error(`Configuration '${name}' not found to reload`)
  }

  /**
   * Create example configuration file
   */
  async createExampleConfig(name, schema = null) {
    if (!schema && CONFIG_SCHEMAS[name]) {
      schema = CONFIG_SCHEMAS[name]
    }

    if (!schema) {
      throw new Error(`No schema available for configuration '${name}'`)
    }

    const configDir = path.join(process.cwd(), '.config')
    const configPath = path.join(configDir, `${name}.json`)

    // Create .config directory if it doesn't exist
    try {
      await fs.mkdir(configDir, { recursive: true })
    } catch (error) {
      // Directory might already exist
    }

    // Generate example configuration
    const exampleConfig = {
      default: { ...schema.defaults },
      development: {},
      production: {},
      comment: `Configuration for ${name}. Environment-specific values override defaults.`
    }

    // Add required fields with placeholder values
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in exampleConfig.default)) {
          exampleConfig.default[field] = `YOUR_${field.toUpperCase()}_HERE`
        }
      }
    }

    await fs.writeFile(configPath, JSON.stringify(exampleConfig, null, 2))
    console.log(`📝 Created example configuration at: ${configPath}`)
    return configPath
  }

  /**
   * Cleanup watchers
   */
  cleanup() {
    for (const [name, watchers] of this.watchers) {
      for (const watcher of watchers) {
        watcher.close()
      }
    }
    this.watchers.clear()
    console.log('🧹 Configuration watchers cleaned up')
  }
}

// Singleton instance
let globalConfigManager = null

/**
 * Get global configuration manager instance
 */
function getConfigManager() {
  if (!globalConfigManager) {
    globalConfigManager = new ConfigManager()
  }
  return globalConfigManager
}

/**
 * Convenience functions for common operations
 */
async function loadConfig(name, schema) {
  return getConfigManager().loadConfig(name, schema)
}

function getConfig(name) {
  return getConfigManager().getConfig(name)
}

function hasConfig(name) {
  return getConfigManager().hasConfig(name)
}

// Cleanup on process exit
process.on('exit', () => {
  if (globalConfigManager) {
    globalConfigManager.cleanup()
  }
})

module.exports = {
  ConfigManager,
  ConfigValidationError,
  CONFIG_SCHEMAS,
  getConfigManager,
  loadConfig,
  getConfig,
  hasConfig
}