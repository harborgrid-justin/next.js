/**
 * Client Bundling Service
 * Dedicated service for client-side bundle generation
 * SOA Improvement: Extract client-side bundle generation
 */

/**
 * Client Bundle Service
 */
class ClientBundlingService {
  constructor(options = {}) {
    this.bundleMode = options.bundleMode || 'production'
    this.optimization = options.optimization || {}
    this.plugins = []
    this.loaders = new Map()
    this.externals = options.externals || {}
  }

  /**
   * Register a bundling plugin
   * @param {Object} plugin - Bundling plugin
   */
  registerPlugin(plugin) {
    this.plugins.push(plugin)
    return this
  }

  /**
   * Register a file loader
   * @param {string} pattern - File pattern (e.g., '*.css', '*.js')
   * @param {Object} loader - Loader configuration
   */
  registerLoader(pattern, loader) {
    this.loaders.set(pattern, loader)
    return this
  }

  /**
   * Create client bundle
   * @param {Object} config - Bundle configuration
   */
  async createBundle(config) {
    const {
      entry,
      output,
      target = 'web',
      optimization = this.optimization,
      ...otherConfig
    } = config

    const bundleConfig = {
      mode: this.bundleMode,
      entry,
      output,
      target,
      optimization: this.mergeOptimization(optimization),
      externals: { ...this.externals, ...config.externals },
      module: {
        rules: this.generateLoaderRules()
      },
      plugins: [...this.plugins, ...(config.plugins || [])],
      ...otherConfig
    }

    return this.executeBundling(bundleConfig)
  }

  /**
   * Create multiple bundles for different targets
   * @param {Array} configs - Array of bundle configurations
   */
  async createMultipleTargetBundles(configs) {
    const bundlePromises = configs.map(config => this.createBundle(config))
    return Promise.all(bundlePromises)
  }

  /**
   * Execute the bundling process
   */
  async executeBundling(config) {
    // Mock implementation - would integrate with actual bundler (webpack, rollup, etc.)
    return {
      chunks: this.generateChunkInfo(config),
      assets: this.generateAssetInfo(config),
      stats: this.generateBundleStats(config),
      config
    }
  }

  /**
   * Generate loader rules from registered loaders
   */
  generateLoaderRules() {
    const rules = []
    
    for (const [pattern, loader] of this.loaders) {
      rules.push({
        test: this.patternToRegex(pattern),
        use: Array.isArray(loader) ? loader : [loader]
      })
    }

    return rules
  }

  /**
   * Convert file pattern to regex
   */
  patternToRegex(pattern) {
    return new RegExp(pattern.replace(/\*/g, '.*').replace(/\./g, '\\.') + '$')
  }

  /**
   * Merge optimization configurations
   */
  mergeOptimization(optimization) {
    return {
      minimize: this.bundleMode === 'production',
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendor',
            chunks: 'all'
          }
        }
      },
      ...this.optimization,
      ...optimization
    }
  }

  /**
   * Generate chunk information
   */
  generateChunkInfo(config) {
    return [
      {
        name: 'main',
        size: 50000,
        files: ['main.js', 'main.css']
      },
      {
        name: 'vendor',
        size: 150000,
        files: ['vendor.js']
      }
    ]
  }

  /**
   * Generate asset information
   */
  generateAssetInfo(config) {
    return [
      {
        name: 'main.js',
        size: 50000,
        type: 'javascript'
      },
      {
        name: 'main.css',
        size: 10000,
        type: 'stylesheet'
      }
    ]
  }

  /**
   * Generate bundle statistics
   */
  generateBundleStats(config) {
    return {
      totalSize: 210000,
      chunkCount: 2,
      assetCount: 2,
      buildTime: 5000,
      warnings: [],
      errors: []
    }
  }
}

/**
 * React Client Bundle Service
 */
class ReactClientBundlingService extends ClientBundlingService {
  constructor(options = {}) {
    super(options)
    this.setupReactLoaders()
    this.setupReactPlugins()
  }

  setupReactLoaders() {
    // JSX/TSX loader
    this.registerLoader('*.jsx', {
      loader: 'babel-loader',
      options: {
        presets: ['@babel/preset-react']
      }
    })

    this.registerLoader('*.tsx', {
      loader: 'ts-loader',
      options: {
        compilerOptions: {
          jsx: 'react-jsx'
        }
      }
    })

    // CSS modules loader
    this.registerLoader('*.module.css', [
      'style-loader',
      {
        loader: 'css-loader',
        options: {
          modules: true
        }
      }
    ])
  }

  setupReactPlugins() {
    // Mock React-specific plugins
    this.registerPlugin({
      name: 'ReactRefreshPlugin',
      apply: (compiler) => {
        // React refresh logic
      }
    })

    this.registerPlugin({
      name: 'ReactDeduplicationPlugin',
      apply: (compiler) => {
        // React deduplication logic
      }
    })
  }

  /**
   * Create React application bundle
   */
  async createReactBundle(config) {
    const reactConfig = {
      ...config,
      resolve: {
        alias: {
          'react': 'react',
          'react-dom': 'react-dom'
        },
        ...config.resolve
      }
    }

    return this.createBundle(reactConfig)
  }
}

/**
 * Next.js Client Bundle Service
 */
class NextJSClientBundlingService extends ReactClientBundlingService {
  constructor(options = {}) {
    super(options)
    this.setupNextJSLoaders()
    this.setupNextJSPlugins()
  }

  setupNextJSLoaders() {
    // Next.js specific loaders
    this.registerLoader('*.module.scss', [
      'style-loader',
      {
        loader: 'css-loader',
        options: {
          modules: true
        }
      },
      'sass-loader'
    ])

    // Next.js image loader
    this.registerLoader('*.(png|jpg|jpeg|gif|svg)', {
      loader: 'next-image-loader',
      options: {
        optimize: true
      }
    })
  }

  setupNextJSPlugins() {
    // Next.js specific plugins
    this.registerPlugin({
      name: 'NextJSChunkPlugin',
      apply: (compiler) => {
        // Next.js chunk generation logic
      }
    })

    this.registerPlugin({
      name: 'NextJSRuntimePlugin',
      apply: (compiler) => {
        // Next.js runtime injection logic
      }
    })
  }

  /**
   * Create Next.js specific client bundle
   */
  async createNextJSClientBundle(config) {
    const nextConfig = {
      ...config,
      externals: {
        'next/router': 'next/router',
        'next/link': 'next/link',
        'next/image': 'next/image',
        ...config.externals
      }
    }

    return this.createBundle(nextConfig)
  }

  /**
   * Create page-specific bundles
   */
  async createPageBundles(pages) {
    const bundlePromises = pages.map(page => {
      return this.createNextJSClientBundle({
        entry: page.entry,
        output: {
          path: page.outputPath,
          filename: `${page.name}.js`
        },
        optimization: {
          splitChunks: {
            chunks: 'all',
            cacheGroups: {
              commons: {
                name: 'commons',
                chunks: 'all',
                minChunks: 2
              }
            }
          }
        }
      })
    })

    return Promise.all(bundlePromises)
  }
}

module.exports = { 
  ClientBundlingService, 
  ReactClientBundlingService,
  NextJSClientBundlingService 
}