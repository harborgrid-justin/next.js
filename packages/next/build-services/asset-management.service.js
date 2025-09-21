/**
 * Asset Management Service
 * Independent static asset handling service
 * SOA Improvement: Modular asset management
 */

const path = require('path')
const fs = require('fs').promises

/**
 * Asset Management Service
 */
class AssetManagementService {
  constructor(options = {}) {
    this.assetRegistry = new Map()
    this.processors = new Map()
    this.outputDir = options.outputDir || 'dist'
    this.publicPath = options.publicPath || '/'
    this.cacheStrategy = options.cacheStrategy || 'memory'
    this.optimizations = options.optimizations || {}
  }

  /**
   * Register an asset processor
   * @param {string} type - Asset type (image, css, js, font, etc.)
   * @param {Function} processor - Processing function
   */
  registerProcessor(type, processor) {
    this.processors.set(type, processor)
    return this
  }

  /**
   * Register an asset
   * @param {string} id - Asset identifier
   * @param {Object} assetData - Asset information
   */
  registerAsset(id, assetData) {
    const asset = {
      id,
      type: assetData.type,
      source: assetData.source,
      destination: assetData.destination,
      metadata: assetData.metadata || {},
      processed: false,
      optimized: false,
      hash: null,
      size: null
    }

    this.assetRegistry.set(id, asset)
    return asset
  }

  /**
   * Process all registered assets
   */
  async processAssets() {
    const processingPromises = []

    for (const [id, asset] of this.assetRegistry) {
      if (!asset.processed) {
        processingPromises.push(this.processAsset(id))
      }
    }

    return Promise.all(processingPromises)
  }

  /**
   * Process individual asset
   * @param {string} assetId - Asset identifier
   */
  async processAsset(assetId) {
    const asset = this.assetRegistry.get(assetId)
    if (!asset) {
      throw new Error(`Asset not found: ${assetId}`)
    }

    try {
      // Load asset content
      const content = await this.loadAssetContent(asset)
      asset.originalSize = content.length

      // Process with registered processor
      let processedContent = content
      if (this.processors.has(asset.type)) {
        const processor = this.processors.get(asset.type)
        processedContent = await processor(content, asset)
      }

      // Optimize if enabled
      if (this.shouldOptimize(asset)) {
        processedContent = await this.optimizeAsset(processedContent, asset)
        asset.optimized = true
      }

      // Generate hash for cache busting
      asset.hash = this.generateAssetHash(processedContent)
      asset.size = processedContent.length

      // Save processed asset
      await this.saveAsset(asset, processedContent)
      
      asset.processed = true
      return asset

    } catch (error) {
      console.error(`Failed to process asset ${assetId}:`, error)
      throw error
    }
  }

  /**
   * Load asset content from source
   */
  async loadAssetContent(asset) {
    if (typeof asset.source === 'string' && asset.source.startsWith('http')) {
      // Load from URL
      const response = await fetch(asset.source)
      return Buffer.from(await response.arrayBuffer())
    } else {
      // Load from file system
      return fs.readFile(asset.source)
    }
  }

  /**
   * Save processed asset
   */
  async saveAsset(asset, content) {
    const outputPath = path.join(this.outputDir, asset.destination)
    const outputDir = path.dirname(outputPath)

    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true })

    // Save the asset
    await fs.writeFile(outputPath, content)
  }

  /**
   * Check if asset should be optimized
   */
  shouldOptimize(asset) {
    return this.optimizations[asset.type] !== false
  }

  /**
   * Optimize asset content
   */
  async optimizeAsset(content, asset) {
    const optimization = this.optimizations[asset.type]
    
    if (typeof optimization === 'function') {
      return optimization(content, asset)
    }

    // Default optimizations by type
    switch (asset.type) {
      case 'image':
        return this.optimizeImage(content, asset)
      case 'css':
        return this.optimizeCSS(content, asset)
      case 'js':
        return this.optimizeJS(content, asset)
      default:
        return content
    }
  }

  /**
   * Generate asset hash for cache busting
   */
  generateAssetHash(content) {
    const crypto = require('crypto')
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 8)
  }

  /**
   * Get asset URL with public path
   */
  getAssetURL(assetId) {
    const asset = this.assetRegistry.get(assetId)
    if (!asset) return null

    const filename = asset.hash ? 
      `${path.basename(asset.destination, path.extname(asset.destination))}.${asset.hash}${path.extname(asset.destination)}` :
      asset.destination

    return path.join(this.publicPath, filename).replace(/\\/g, '/')
  }

  /**
   * Get asset manifest for client
   */
  generateAssetManifest() {
    const manifest = {}

    for (const [id, asset] of this.assetRegistry) {
      manifest[id] = {
        url: this.getAssetURL(id),
        size: asset.size,
        type: asset.type,
        hash: asset.hash
      }
    }

    return manifest
  }

  /**
   * Image optimization
   */
  async optimizeImage(content, asset) {
    // Mock implementation - would use actual image optimization library
    return content
  }

  /**
   * CSS optimization
   */
  async optimizeCSS(content, asset) {
    // Mock implementation - would use cssnano or similar
    return content.toString().replace(/\s+/g, ' ').trim()
  }

  /**
   * JavaScript optimization
   */
  async optimizeJS(content, asset) {
    // Mock implementation - would use terser or similar
    return content
  }
}

/**
 * Next.js Asset Management Service
 */
class NextJSAssetManagementService extends AssetManagementService {
  constructor(options = {}) {
    super(options)
    this.setupNextJSProcessors()
  }

  setupNextJSProcessors() {
    // Next.js Image processor
    this.registerProcessor('image', async (content, asset) => {
      // Integration with Next.js Image optimization
      if (asset.metadata.nextImageConfig) {
        return this.processNextJSImage(content, asset.metadata.nextImageConfig)
      }
      return content
    })

    // Next.js CSS processor
    this.registerProcessor('css', async (content, asset) => {
      // Process CSS modules, PostCSS, etc.
      return this.processNextJSCSS(content, asset)
    })

    // Next.js Font processor
    this.registerProcessor('font', async (content, asset) => {
      // Handle web font optimization
      return this.processNextJSFont(content, asset)
    })
  }

  /**
   * Process Next.js optimized images
   */
  async processNextJSImage(content, config) {
    // Mock implementation for Next.js image processing
    return content
  }

  /**
   * Process Next.js CSS with PostCSS and CSS modules
   */
  async processNextJSCSS(content, asset) {
    // Mock implementation for CSS processing
    let processedCSS = content.toString()

    // Handle CSS modules
    if (asset.destination.includes('.module.')) {
      processedCSS = this.processCSSModules(processedCSS)
    }

    return processedCSS
  }

  /**
   * Process CSS modules
   */
  processCSSModules(css) {
    // Mock CSS modules processing
    return css
  }

  /**
   * Process Next.js fonts
   */
  async processNextJSFont(content, asset) {
    // Mock font processing
    return content
  }

  /**
   * Register Next.js specific assets
   */
  registerNextJSAssets(buildManifest) {
    // Register pages
    if (buildManifest.pages) {
      for (const [page, files] of Object.entries(buildManifest.pages)) {
        files.forEach((file, index) => {
          this.registerAsset(`page:${page}:${index}`, {
            type: path.extname(file).substring(1),
            source: file,
            destination: file,
            metadata: { page, isPageAsset: true }
          })
        })
      }
    }

    // Register chunks
    if (buildManifest.chunks) {
      for (const [chunk, files] of Object.entries(buildManifest.chunks)) {
        files.forEach((file, index) => {
          this.registerAsset(`chunk:${chunk}:${index}`, {
            type: path.extname(file).substring(1),
            source: file,
            destination: file,
            metadata: { chunk, isChunkAsset: true }
          })
        })
      }
    }
  }
}

module.exports = { AssetManagementService, NextJSAssetManagementService }