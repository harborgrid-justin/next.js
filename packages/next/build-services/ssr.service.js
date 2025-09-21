/**
 * Server-Side Rendering Service
 * Dedicated service for SSR operations and management
 * SOA Improvement: Modular SSR service extraction
 */

/**
 * Server-Side Rendering service abstraction
 */
class SSRService {
  constructor(options = {}) {
    this.renderMode = options.renderMode || 'sync'
    this.cacheStrategy = options.cacheStrategy || 'memory'
    this.renderOptions = options.renderOptions || {}
    this.renderCache = new Map()
  }

  /**
   * Render page component to HTML string
   * @param {Object} page - Page component and metadata
   * @param {Object} props - Page props
   * @param {Object} context - Rendering context
   */
  async renderToHTML(page, props = {}, context = {}) {
    const cacheKey = this.generateCacheKey(page, props, context)
    
    // Check cache first
    if (this.shouldUseCache(context) && this.renderCache.has(cacheKey)) {
      return this.getCachedRender(cacheKey)
    }

    try {
      const rendered = await this.performRender(page, props, context)
      
      // Cache the result if applicable
      if (this.shouldCache(context)) {
        this.cacheRender(cacheKey, rendered, context)
      }

      return rendered
    } catch (error) {
      await this.handleRenderError(error, page, props, context)
      throw error
    }
  }

  /**
   * Render page component with streaming support
   * @param {Object} page - Page component and metadata
   * @param {Object} props - Page props
   * @param {Object} context - Rendering context
   */
  async renderToStream(page, props = {}, context = {}) {
    // Implementation for streaming SSR
    const renderStream = await this.createRenderStream(page, props, context)
    return renderStream
  }

  /**
   * Pre-render pages for static generation
   * @param {Array} pages - Array of pages to pre-render
   * @param {Object} options - Pre-rendering options
   */
  async preRenderPages(pages, options = {}) {
    const preRendered = new Map()

    for (const page of pages) {
      try {
        const html = await this.renderToHTML(page.component, page.props, {
          isStaticGeneration: true,
          ...options.context
        })
        
        preRendered.set(page.path, {
          html,
          props: page.props,
          metadata: page.metadata
        })
      } catch (error) {
        console.error(`Failed to pre-render page: ${page.path}`, error)
        if (options.failOnError) {
          throw error
        }
      }
    }

    return preRendered
  }

  /**
   * Perform the actual rendering
   */
  async performRender(page, props, context) {
    // This would integrate with React's server-side rendering
    // Implementation depends on the specific rendering library
    
    if (this.renderMode === 'streaming') {
      return this.renderToStream(page, props, context)
    }

    // Synchronous rendering
    return this.renderSync(page, props, context)
  }

  /**
   * Synchronous rendering implementation
   */
  async renderSync(page, props, context) {
    // Mock implementation - would integrate with actual React SSR
    return {
      html: `<html><body>Rendered ${page.name || 'page'}</body></html>`,
      renderTime: Date.now(),
      context
    }
  }

  /**
   * Create render stream for streaming SSR
   */
  async createRenderStream(page, props, context) {
    // Mock implementation for streaming
    const { Readable } = require('stream')
    
    return new Readable({
      read() {
        this.push(`<html><body>Streaming ${page.name || 'page'}</body></html>`)
        this.push(null) // End stream
      }
    })
  }

  /**
   * Generate cache key for rendered content
   */
  generateCacheKey(page, props, context) {
    const keyData = {
      pageName: page.name || page.path,
      propsHash: this.hashObject(props),
      contextHash: this.hashObject(context)
    }
    return JSON.stringify(keyData)
  }

  /**
   * Simple object hashing for cache keys
   */
  hashObject(obj) {
    return JSON.stringify(obj, Object.keys(obj).sort())
  }

  /**
   * Check if render result should use cache
   */
  shouldUseCache(context) {
    return !context.isDevelopment && !context.isServerRequest
  }

  /**
   * Check if render result should be cached
   */
  shouldCache(context) {
    return !context.isDevelopment && !context.hasErrors
  }

  /**
   * Get cached render result
   */
  getCachedRender(cacheKey) {
    const cached = this.renderCache.get(cacheKey)
    if (cached && !this.isCacheExpired(cached)) {
      return cached.result
    }
    return null
  }

  /**
   * Cache render result
   */
  cacheRender(cacheKey, result, context) {
    const ttl = context.cacheTTL || 60000 // 1 minute default
    this.renderCache.set(cacheKey, {
      result,
      timestamp: Date.now(),
      ttl
    })
  }

  /**
   * Check if cache entry is expired
   */
  isCacheExpired(cacheEntry) {
    return Date.now() - cacheEntry.timestamp > cacheEntry.ttl
  }

  /**
   * Handle rendering errors
   */
  async handleRenderError(error, page, props, context) {
    console.error('SSR Error:', {
      page: page.name || page.path,
      error: error.message,
      stack: error.stack
    })

    // Could integrate with error reporting service
    if (context.errorReporter) {
      await context.errorReporter.report(error, { page, props, context })
    }
  }

  /**
   * Clear render cache
   */
  clearCache() {
    this.renderCache.clear()
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.renderCache.size,
      entries: Array.from(this.renderCache.keys())
    }
  }
}

/**
 * Specialized SSR service for Next.js applications
 */
class NextJSSSRService extends SSRService {
  constructor(options = {}) {
    super(options)
    this.appDir = options.appDir
    this.pageExtensions = options.pageExtensions || ['.js', '.jsx', '.ts', '.tsx']
  }

  /**
   * Next.js specific rendering with App Router support
   */
  async renderNextJSPage(pageData, request, context = {}) {
    const { page, params, searchParams } = pageData
    
    // Handle App Router vs Pages Router
    if (context.isAppRouter) {
      return this.renderAppRouterPage(page, params, searchParams, context)
    } else {
      return this.renderPagesRouterPage(page, params, searchParams, context)
    }
  }

  /**
   * App Router specific rendering
   */
  async renderAppRouterPage(page, params, searchParams, context) {
    // Implementation would integrate with Next.js App Router
    return this.renderToHTML(page, { params, searchParams }, {
      ...context,
      renderType: 'app-router'
    })
  }

  /**
   * Pages Router specific rendering
   */
  async renderPagesRouterPage(page, params, searchParams, context) {
    // Implementation would integrate with Next.js Pages Router
    return this.renderToHTML(page, { ...params, ...searchParams }, {
      ...context,
      renderType: 'pages-router'
    })
  }
}

module.exports = { SSRService, NextJSSSRService }