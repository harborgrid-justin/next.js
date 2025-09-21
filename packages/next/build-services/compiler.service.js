/**
 * Compiler Services
 * Modular TypeScript/SWC compilation services
 * SOA Improvement: Split compilation services
 */

const path = require('path')
const EventEmitter = require('events')

/**
 * Base Compiler Service
 */
class CompilerService extends EventEmitter {
  constructor(name, options = {}) {
    super()
    this.name = name
    this.options = options
    this.cache = new Map()
    this.diagnostics = []
    this.isCompiling = false
  }

  /**
   * Compile source code
   * @param {string} source - Source code or file path
   * @param {Object} compileOptions - Compilation options
   */
  async compile(source, compileOptions = {}) {
    this.isCompiling = true
    this.emit('compile-start', { source, options: compileOptions })

    try {
      const result = await this.performCompilation(source, compileOptions)
      this.emit('compile-success', result)
      return result
    } catch (error) {
      this.emit('compile-error', error)
      throw error
    } finally {
      this.isCompiling = false
    }
  }

  /**
   * Abstract compilation method
   */
  async performCompilation(source, options) {
    throw new Error('performCompilation must be implemented by subclasses')
  }

  /**
   * Get compiler diagnostics
   */
  getDiagnostics() {
    return [...this.diagnostics]
  }

  /**
   * Clear diagnostics
   */
  clearDiagnostics() {
    this.diagnostics = []
  }

  /**
   * Check if source should be cached
   */
  shouldCache(source, options) {
    return options.cache !== false && !options.watch
  }

  /**
   * Generate cache key
   */
  generateCacheKey(source, options) {
    const content = typeof source === 'string' && source.length < 1000 ? source : 'file'
    return `${content}_${JSON.stringify(options)}`
  }
}

/**
 * TypeScript Compiler Service
 */
class TypeScriptCompilerService extends CompilerService {
  constructor(options = {}) {
    super('typescript', options)
    this.ts = null
    this.program = null
    this.configFile = options.configFile || 'tsconfig.json'
    this.compilerOptions = options.compilerOptions || {}
  }

  /**
   * Initialize TypeScript compiler
   */
  async initialize() {
    if (!this.ts) {
      this.ts = require('typescript')
    }

    // Load TypeScript configuration
    await this.loadTypeScriptConfig()
  }

  /**
   * Load TypeScript configuration
   */
  async loadTypeScriptConfig() {
    const configPath = path.resolve(process.cwd(), this.configFile)
    
    try {
      const configFile = this.ts.readConfigFile(configPath, this.ts.sys.readFile)
      
      if (configFile.error) {
        throw new Error(this.ts.formatDiagnostic(configFile.error, this.ts.createCompilerHost({})))
      }

      const parsedConfig = this.ts.parseJsonConfigFileContent(
        configFile.config,
        this.ts.sys,
        path.dirname(configPath)
      )

      this.compilerOptions = { ...parsedConfig.options, ...this.compilerOptions }
      
    } catch (error) {
      console.warn(`Could not load TypeScript config: ${error.message}`)
      // Use default options
      this.compilerOptions = {
        target: this.ts.ScriptTarget.ES2018,
        module: this.ts.ModuleKind.ESNext,
        lib: ['ES2018', 'DOM'],
        jsx: this.ts.JsxEmit.ReactJSX,
        ...this.compilerOptions
      }
    }
  }

  /**
   * Perform TypeScript compilation
   */
  async performCompilation(source, options = {}) {
    if (!this.ts) {
      await this.initialize()
    }

    const cacheKey = this.generateCacheKey(source, options)
    
    // Check cache
    if (this.shouldCache(source, options) && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)
    }

    const compilerOptions = { ...this.compilerOptions, ...options.compilerOptions }
    
    let sourceText, fileName
    
    if (typeof source === 'string' && source.endsWith('.ts') || source.endsWith('.tsx')) {
      // File path
      fileName = source
      sourceText = require('fs').readFileSync(source, 'utf-8')
    } else {
      // Source code
      fileName = options.fileName || 'input.tsx'
      sourceText = source
    }

    // Create source file
    const sourceFile = this.ts.createSourceFile(
      fileName,
      sourceText,
      compilerOptions.target || this.ts.ScriptTarget.ES2018,
      true
    )

    // Compile
    const result = this.ts.transpileModule(sourceText, {
      compilerOptions,
      fileName,
      reportDiagnostics: true
    })

    // Process diagnostics
    if (result.diagnostics && result.diagnostics.length > 0) {
      const formattedDiagnostics = result.diagnostics.map(diagnostic =>
        this.ts.formatDiagnostic(diagnostic, this.ts.createCompilerHost(compilerOptions))
      )
      
      this.diagnostics.push(...formattedDiagnostics)
      
      // Emit diagnostic events
      result.diagnostics.forEach(diagnostic => {
        const severity = diagnostic.category === this.ts.DiagnosticCategory.Error ? 'error' : 'warning'
        this.emit('diagnostic', { severity, diagnostic, formatted: this.ts.formatDiagnostic(diagnostic, this.ts.createCompilerHost(compilerOptions)) })
      })
    }

    const compilationResult = {
      code: result.outputText,
      map: result.sourceMapText,
      diagnostics: result.diagnostics || [],
      fileName,
      compilerOptions
    }

    // Cache result
    if (this.shouldCache(source, options)) {
      this.cache.set(cacheKey, compilationResult)
    }

    return compilationResult
  }

  /**
   * Type check without compilation
   */
  async typeCheck(source, options = {}) {
    if (!this.ts) {
      await this.initialize()
    }

    const fileName = options.fileName || 'input.ts'
    const compilerOptions = { ...this.compilerOptions, noEmit: true }

    const program = this.ts.createProgram([fileName], compilerOptions, {
      getSourceFile: (name) => {
        if (name === fileName) {
          return this.ts.createSourceFile(name, source, compilerOptions.target, true)
        }
        return undefined
      },
      writeFile: () => {},
      getCurrentDirectory: () => process.cwd(),
      getDirectories: () => [],
      fileExists: () => true,
      readFile: () => '',
      getCanonicalFileName: (fileName) => fileName,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => '\n'
    })

    const diagnostics = this.ts.getPreEmitDiagnostics(program)
    
    return {
      diagnostics,
      hasErrors: diagnostics.some(d => d.category === this.ts.DiagnosticCategory.Error)
    }
  }
}

/**
 * SWC Compiler Service
 */
class SWCCompilerService extends CompilerService {
  constructor(options = {}) {
    super('swc', options)
    this.swc = null
    this.defaultOptions = {
      jsc: {
        parser: {
          syntax: 'typescript',
          tsx: true,
          decorators: true,
          dynamicImport: true
        },
        target: 'es2018',
        transform: {
          react: {
            runtime: 'automatic'
          }
        }
      },
      module: {
        type: 'es6'
      },
      ...options.swcOptions
    }
  }

  /**
   * Initialize SWC compiler
   */
  async initialize() {
    if (!this.swc) {
      this.swc = require('@swc/core')
    }
  }

  /**
   * Perform SWC compilation
   */
  async performCompilation(source, options = {}) {
    if (!this.swc) {
      await this.initialize()
    }

    const cacheKey = this.generateCacheKey(source, options)
    
    // Check cache
    if (this.shouldCache(source, options) && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)
    }

    let sourceCode, fileName

    if (typeof source === 'string' && (source.endsWith('.ts') || source.endsWith('.tsx') || source.endsWith('.js') || source.endsWith('.jsx'))) {
      // File path
      fileName = source
      sourceCode = require('fs').readFileSync(source, 'utf-8')
    } else {
      // Source code
      fileName = options.fileName || 'input.tsx'
      sourceCode = source
    }

    const swcOptions = {
      ...this.defaultOptions,
      ...options.swcOptions,
      filename: fileName
    }

    try {
      const result = await this.swc.transform(sourceCode, swcOptions)
      
      const compilationResult = {
        code: result.code,
        map: result.map,
        fileName,
        swcOptions
      }

      // Cache result
      if (this.shouldCache(source, options)) {
        this.cache.set(cacheKey, compilationResult)
      }

      return compilationResult

    } catch (error) {
      // Convert SWC errors to standardized format
      const formattedError = new Error(`SWC compilation failed: ${error.message}`)
      formattedError.fileName = fileName
      formattedError.originalError = error
      
      throw formattedError
    }
  }

  /**
   * Transform JavaScript/TypeScript with SWC
   */
  async transform(source, transformOptions = {}) {
    const options = {
      swcOptions: {
        jsc: {
          ...this.defaultOptions.jsc,
          ...transformOptions.jsc
        }
      }
    }

    return this.compile(source, options)
  }
}

/**
 * Compiler Service Factory
 */
class CompilerServiceFactory {
  constructor() {
    this.services = new Map()
  }

  /**
   * Get or create compiler service
   * @param {string} type - Compiler type ('typescript', 'swc')
   * @param {Object} options - Compiler options
   */
  getService(type, options = {}) {
    const key = `${type}_${JSON.stringify(options)}`
    
    if (!this.services.has(key)) {
      let service
      
      switch (type) {
        case 'typescript':
          service = new TypeScriptCompilerService(options)
          break
        case 'swc':
          service = new SWCCompilerService(options)
          break
        default:
          throw new Error(`Unknown compiler type: ${type}`)
      }
      
      this.services.set(key, service)
    }
    
    return this.services.get(key)
  }

  /**
   * Clear all compiler caches
   */
  clearAllCaches() {
    for (const service of this.services.values()) {
      service.cache.clear()
    }
  }
}

/**
 * Next.js Compiler Service Manager
 */
class NextJSCompilerManager {
  constructor(options = {}) {
    this.factory = new CompilerServiceFactory()
    this.options = options
  }

  /**
   * Get TypeScript service for Next.js
   */
  getTypeScriptService() {
    return this.factory.getService('typescript', {
      compilerOptions: {
        jsx: 'preserve', // Let Next.js handle JSX
        module: 'esnext',
        target: 'es2018',
        lib: ['dom', 'dom.iterable', 'es6'],
        allowJs: true,
        skipLibCheck: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        forceConsistentCasingInFileNames: true,
        moduleResolution: 'node',
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true
      }
    })
  }

  /**
   * Get SWC service for Next.js
   */
  getSWCService() {
    return this.factory.getService('swc', {
      swcOptions: {
        jsc: {
          parser: {
            syntax: 'typescript',
            tsx: true
          },
          transform: {
            react: {
              runtime: 'automatic'
            }
          }
        },
        module: {
          type: 'es6'
        }
      }
    })
  }

  /**
   * Compile for Next.js pages
   */
  async compileForPages(source, options = {}) {
    const service = options.useTypeScript ? this.getTypeScriptService() : this.getSWCService()
    return service.compile(source, options)
  }

  /**
   * Compile for Next.js app directory
   */
  async compileForApp(source, options = {}) {
    const service = this.getSWCService() // App directory prefers SWC
    
    const appOptions = {
      ...options,
      swcOptions: {
        ...options.swcOptions,
        jsc: {
          ...options.swcOptions?.jsc,
          experimental: {
            ...options.swcOptions?.jsc?.experimental,
            useServerComponents: true
          }
        }
      }
    }

    return service.compile(source, appOptions)
  }
}

module.exports = { 
  CompilerService,
  TypeScriptCompilerService,
  SWCCompilerService,
  CompilerServiceFactory,
  NextJSCompilerManager
}