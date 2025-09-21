/**
 * Linting Service Interface
 * Standardized linting service API
 * SOA Improvement: Modular linting service abstraction
 */

const EventEmitter = require('events')
const path = require('path')

/**
 * Linting Rule
 */
class LintingRule {
  constructor(name, severity = 'error', options = {}) {
    this.name = name
    this.severity = severity // 'error', 'warning', 'info', 'off'
    this.options = options
  }
}

/**
 * Linting Result
 */
class LintingResult {
  constructor(filePath) {
    this.filePath = filePath
    this.messages = []
    this.errorCount = 0
    this.warningCount = 0
    this.fixableErrorCount = 0
    this.fixableWarningCount = 0
  }

  addMessage(message) {
    this.messages.push(message)
    
    if (message.severity === 'error') {
      this.errorCount++
      if (message.fixable) this.fixableErrorCount++
    } else if (message.severity === 'warning') {
      this.warningCount++
      if (message.fixable) this.fixableWarningCount++
    }
  }

  get hasErrors() {
    return this.errorCount > 0
  }

  get hasWarnings() {
    return this.warningCount > 0
  }

  get hasIssues() {
    return this.hasErrors || this.hasWarnings
  }
}

/**
 * Base Linting Service
 */
class LintingService extends EventEmitter {
  constructor(name, options = {}) {
    super()
    this.name = name
    this.rules = new Map()
    this.config = options.config || {}
    this.extensions = options.extensions || []
    this.ignorePatterns = options.ignorePatterns || []
    this.autoFix = options.autoFix === true
  }

  /**
   * Register a linting rule
   * @param {LintingRule} rule - Linting rule to register
   */
  registerRule(rule) {
    this.rules.set(rule.name, rule)
    return this
  }

  /**
   * Lint files or directories
   * @param {string|Array} targets - File paths or patterns to lint
   * @param {Object} options - Linting options
   */
  async lint(targets, options = {}) {
    const files = await this.resolveFiles(targets)
    const results = []

    this.emit('lint-start', { files: files.length, targets })

    for (const file of files) {
      try {
        const result = await this.lintFile(file, options)
        results.push(result)
        
        if (result.hasIssues) {
          this.emit('file-linted', result)
        }
      } catch (error) {
        this.emit('lint-error', { file, error })
        
        const errorResult = new LintingResult(file)
        errorResult.addMessage({
          line: 1,
          column: 1,
          message: `Linting failed: ${error.message}`,
          severity: 'error',
          ruleId: 'lint-error',
          fixable: false
        })
        results.push(errorResult)
      }
    }

    const summary = this.createSummary(results)
    this.emit('lint-complete', summary)

    return summary
  }

  /**
   * Lint individual file
   * @param {string} filePath - Path to file
   * @param {Object} options - Linting options
   */
  async lintFile(filePath, options = {}) {
    // Abstract method to be implemented by concrete services
    throw new Error('lintFile must be implemented by subclasses')
  }

  /**
   * Fix linting issues in files
   * @param {string|Array} targets - File paths or patterns to fix
   * @param {Object} options - Fix options
   */
  async fix(targets, options = {}) {
    const lintingResults = await this.lint(targets, { ...options, autoFix: true })
    
    const fixResults = {
      fixedFiles: [],
      unfixedFiles: [],
      totalFixed: 0
    }

    for (const result of lintingResults.results) {
      const fixableIssues = result.fixableErrorCount + result.fixableWarningCount
      
      if (fixableIssues > 0) {
        try {
          const fixed = await this.applyFixes(result.filePath, options)
          if (fixed) {
            fixResults.fixedFiles.push({
              filePath: result.filePath,
              issuesFixed: fixableIssues
            })
            fixResults.totalFixed += fixableIssues
          }
        } catch (error) {
          fixResults.unfixedFiles.push({
            filePath: result.filePath,
            error: error.message
          })
        }
      }
    }

    return fixResults
  }

  /**
   * Apply fixes to a file
   * @param {string} filePath - Path to file
   * @param {Object} options - Fix options
   */
  async applyFixes(filePath, options = {}) {
    // Abstract method to be implemented by concrete services
    throw new Error('applyFixes must be implemented by subclasses')
  }

  /**
   * Resolve files from targets
   * @param {string|Array} targets - File paths or patterns
   */
  async resolveFiles(targets) {
    const glob = require('glob')
    const fs = require('fs').promises
    
    const targetArray = Array.isArray(targets) ? targets : [targets]
    const allFiles = new Set()

    for (const target of targetArray) {
      try {
        const stat = await fs.stat(target)
        
        if (stat.isFile()) {
          if (this.shouldLintFile(target)) {
            allFiles.add(path.resolve(target))
          }
        } else if (stat.isDirectory()) {
          const pattern = path.join(target, '**', `*.{${this.extensions.join(',')}}`)
          const files = await new Promise((resolve, reject) => {
            glob(pattern, { ignore: this.ignorePatterns }, (err, matches) => {
              if (err) reject(err)
              else resolve(matches)
            })
          })
          
          files.forEach(file => allFiles.add(path.resolve(file)))
        }
      } catch (error) {
        // Try as glob pattern
        const files = await new Promise((resolve) => {
          glob(target, { ignore: this.ignorePatterns }, (err, matches) => {
            resolve(err ? [] : matches)
          })
        })
        
        files
          .filter(file => this.shouldLintFile(file))
          .forEach(file => allFiles.add(path.resolve(file)))
      }
    }

    return Array.from(allFiles)
  }

  /**
   * Check if file should be linted
   */
  shouldLintFile(filePath) {
    const ext = path.extname(filePath)
    return this.extensions.includes(ext) || this.extensions.includes(ext.substring(1))
  }

  /**
   * Create summary from linting results
   */
  createSummary(results) {
    const summary = {
      results,
      totalFiles: results.length,
      totalErrors: 0,
      totalWarnings: 0,
      totalFixableErrors: 0,
      totalFixableWarnings: 0,
      filesWithErrors: 0,
      filesWithWarnings: 0
    }

    for (const result of results) {
      summary.totalErrors += result.errorCount
      summary.totalWarnings += result.warningCount
      summary.totalFixableErrors += result.fixableErrorCount
      summary.totalFixableWarnings += result.fixableWarningCount
      
      if (result.hasErrors) summary.filesWithErrors++
      if (result.hasWarnings) summary.filesWithWarnings++
    }

    summary.success = summary.totalErrors === 0

    return summary
  }
}

/**
 * ESLint Service
 */
class ESLintService extends LintingService {
  constructor(options = {}) {
    super('eslint', {
      extensions: ['js', 'jsx', 'ts', 'tsx', 'mjs'],
      ...options
    })
    this.eslint = null
  }

  async initialize() {
    if (!this.eslint) {
      const { ESLint } = require('eslint')
      this.eslint = new ESLint({
        baseConfig: this.config,
        useEslintrc: this.config.useEslintrc !== false,
        extensions: this.extensions,
        fix: this.autoFix,
        ...this.config.eslintOptions
      })
    }
  }

  async lintFile(filePath, options = {}) {
    if (!this.eslint) {
      await this.initialize()
    }

    const results = await this.eslint.lintFiles([filePath])
    const eslintResult = results[0]

    const result = new LintingResult(filePath)

    if (eslintResult && eslintResult.messages) {
      for (const message of eslintResult.messages) {
        result.addMessage({
          line: message.line,
          column: message.column,
          message: message.message,
          severity: message.severity === 2 ? 'error' : 'warning',
          ruleId: message.ruleId,
          fixable: Boolean(message.fix)
        })
      }
    }

    return result
  }

  async applyFixes(filePath, options = {}) {
    if (!this.eslint) {
      await this.initialize()
    }

    const results = await this.eslint.lintFiles([filePath])
    
    if (results[0] && results[0].output) {
      const fs = require('fs').promises
      await fs.writeFile(filePath, results[0].output)
      return true
    }

    return false
  }
}

/**
 * Prettier Service
 */
class PrettierService extends LintingService {
  constructor(options = {}) {
    super('prettier', {
      extensions: ['js', 'jsx', 'ts', 'tsx', 'json', 'css', 'scss', 'md'],
      ...options
    })
    this.prettier = null
  }

  async initialize() {
    if (!this.prettier) {
      this.prettier = require('prettier')
    }
  }

  async lintFile(filePath, options = {}) {
    if (!this.prettier) {
      await this.initialize()
    }

    const fs = require('fs').promises
    const source = await fs.readFile(filePath, 'utf-8')
    
    const prettierOptions = {
      ...this.config.prettierOptions,
      filepath: filePath
    }

    const result = new LintingResult(filePath)
    
    try {
      const formatted = await this.prettier.format(source, prettierOptions)
      
      if (formatted !== source) {
        result.addMessage({
          line: 1,
          column: 1,
          message: 'Code style issues found',
          severity: 'warning',
          ruleId: 'prettier/prettier',
          fixable: true
        })
      }
    } catch (error) {
      result.addMessage({
        line: 1,
        column: 1,
        message: `Prettier formatting error: ${error.message}`,
        severity: 'error',
        ruleId: 'prettier/error',
        fixable: false
      })
    }

    return result
  }

  async applyFixes(filePath, options = {}) {
    if (!this.prettier) {
      await this.initialize()
    }

    const fs = require('fs').promises
    const source = await fs.readFile(filePath, 'utf-8')
    
    try {
      const formatted = await this.prettier.format(source, {
        ...this.config.prettierOptions,
        filepath: filePath
      })
      
      if (formatted !== source) {
        await fs.writeFile(filePath, formatted)
        return true
      }
    } catch (error) {
      throw error
    }

    return false
  }
}

/**
 * Linting Service Manager
 */
class LintingServiceManager extends EventEmitter {
  constructor() {
    super()
    this.services = new Map()
  }

  /**
   * Register a linting service
   * @param {LintingService} service - Linting service to register
   */
  registerService(service) {
    this.services.set(service.name, service)
    
    // Forward service events
    service.on('lint-start', (data) => this.emit('service-lint-start', service.name, data))
    service.on('lint-complete', (data) => this.emit('service-lint-complete', service.name, data))
    service.on('lint-error', (data) => this.emit('service-lint-error', service.name, data))
    
    return this
  }

  /**
   * Lint with all registered services
   * @param {string|Array} targets - Files to lint
   * @param {Object} options - Linting options
   */
  async lintAll(targets, options = {}) {
    const results = {}
    
    for (const [name, service] of this.services) {
      try {
        results[name] = await service.lint(targets, options)
      } catch (error) {
        results[name] = { error: error.message }
      }
    }

    return results
  }

  /**
   * Lint with specific service
   * @param {string} serviceName - Service name
   * @param {string|Array} targets - Files to lint
   * @param {Object} options - Linting options
   */
  async lintWith(serviceName, targets, options = {}) {
    const service = this.services.get(serviceName)
    if (!service) {
      throw new Error(`Linting service not found: ${serviceName}`)
    }

    return service.lint(targets, options)
  }
}

/**
 * Next.js Linting Service
 */
class NextJSLintingService extends LintingServiceManager {
  constructor(options = {}) {
    super()
    this.setupNextJSServices(options)
  }

  setupNextJSServices(options) {
    // ESLint with Next.js configuration
    const eslintService = new ESLintService({
      config: {
        extends: [
          'next',
          'next/core-web-vitals'
        ],
        rules: {
          '@next/next/no-img-element': 'error',
          '@next/next/no-page-custom-font': 'warn',
          ...options.eslintRules
        }
      }
    })

    // Prettier service
    const prettierService = new PrettierService({
      config: {
        prettierOptions: {
          semi: true,
          singleQuote: true,
          trailingComma: 'es5',
          ...options.prettierOptions
        }
      }
    })

    this.registerService(eslintService)
    this.registerService(prettierService)
  }

  /**
   * Lint Next.js project
   */
  async lintProject(options = {}) {
    const targets = [
      'pages/**/*.{js,jsx,ts,tsx}',
      'app/**/*.{js,jsx,ts,tsx}',
      'components/**/*.{js,jsx,ts,tsx}',
      'lib/**/*.{js,jsx,ts,tsx}',
      'src/**/*.{js,jsx,ts,tsx}',
      '*.{js,jsx,ts,tsx}'
    ]

    return this.lintAll(targets, options)
  }

  /**
   * Lint and fix Next.js project
   */
  async fixProject(options = {}) {
    const services = Array.from(this.services.values())
    const results = {}

    for (const service of services) {
      try {
        results[service.name] = await service.fix([
          'pages/**/*.{js,jsx,ts,tsx}',
          'app/**/*.{js,jsx,ts,tsx}',
          'components/**/*.{js,jsx,ts,tsx}',
          'lib/**/*.{js,jsx,ts,tsx}',
          'src/**/*.{js,jsx,ts,tsx}'
        ], options)
      } catch (error) {
        results[service.name] = { error: error.message }
      }
    }

    return results
  }
}

module.exports = { 
  LintingRule,
  LintingResult,
  LintingService,
  ESLintService,
  PrettierService,
  LintingServiceManager,
  NextJSLintingService 
}