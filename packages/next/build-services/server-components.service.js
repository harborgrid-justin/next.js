/**
 * Server Components Service
 * Modular service for handling React Server Components
 * SOA Improvement: Independent server component services
 */

/**
 * Base Server Component service
 */
class ServerComponentService {
  constructor(options = {}) {
    this.componentRegistry = new Map()
    this.renderCache = new Map()
    this.options = options
  }

  /**
   * Register a server component
   * @param {string} name - Component name
   * @param {Function} component - Component function
   * @param {Object} metadata - Component metadata
   */
  registerComponent(name, component, metadata = {}) {
    this.componentRegistry.set(name, {
      component,
      metadata: {
        isServerComponent: true,
        cacheable: metadata.cacheable || false,
        ...metadata
      }
    })
    return this
  }

  /**
   * Render server component
   * @param {string} name - Component name
   * @param {Object} props - Component props
   * @param {Object} context - Render context
   */
  async renderComponent(name, props = {}, context = {}) {
    const componentData = this.componentRegistry.get(name)
    if (!componentData) {
      throw new Error(`Server component not found: ${name}`)
    }

    const cacheKey = this.generateCacheKey(name, props, context)
    
    // Check cache if component is cacheable
    if (componentData.metadata.cacheable && this.renderCache.has(cacheKey)) {
      return this.renderCache.get(cacheKey)
    }

    try {
      const rendered = await this.executeComponentRender(componentData, props, context)
      
      // Cache result if applicable
      if (componentData.metadata.cacheable) {
        this.renderCache.set(cacheKey, rendered)
      }

      return rendered
    } catch (error) {
      await this.handleComponentError(error, name, props, context)
      throw error
    }
  }

  /**
   * Execute component rendering
   */
  async executeComponentRender(componentData, props, context) {
    const { component, metadata } = componentData

    // Handle async server components
    if (metadata.async) {
      return await component(props, context)
    }

    return component(props, context)
  }

  /**
   * Batch render multiple server components
   * @param {Array} components - Array of component render requests
   */
  async batchRender(components) {
    const renderPromises = components.map(({ name, props, context }) =>
      this.renderComponent(name, props, context).catch(error => ({ error, name }))
    )

    return Promise.all(renderPromises)
  }

  /**
   * Generate cache key for component render
   */
  generateCacheKey(name, props, context) {
    return `${name}:${JSON.stringify(props)}:${JSON.stringify(context)}`
  }

  /**
   * Handle component rendering errors
   */
  async handleComponentError(error, name, props, context) {
    console.error(`Server component error [${name}]:`, error)
    
    // Could integrate with error reporting
    if (this.options.errorReporter) {
      await this.options.errorReporter.report(error, { name, props, context })
    }
  }

  /**
   * Clear component cache
   */
  clearCache() {
    this.renderCache.clear()
  }

  /**
   * Get registered components
   */
  getRegisteredComponents() {
    return Array.from(this.componentRegistry.keys())
  }
}

/**
 * Server Component Factory service
 */
class ServerComponentFactory {
  constructor() {
    this.services = new Map()
  }

  /**
   * Create or get a server component service
   * @param {string} namespace - Service namespace
   * @param {Object} options - Service options
   */
  getService(namespace = 'default', options = {}) {
    if (!this.services.has(namespace)) {
      this.services.set(namespace, new ServerComponentService(options))
    }
    return this.services.get(namespace)
  }

  /**
   * Register component across all services
   * @param {string} name - Component name
   * @param {Function} component - Component function
   * @param {Object} metadata - Component metadata
   */
  registerGlobalComponent(name, component, metadata = {}) {
    for (const service of this.services.values()) {
      service.registerComponent(name, component, metadata)
    }
  }
}

/**
 * Next.js specific Server Components service
 */
class NextJSServerComponentService extends ServerComponentService {
  constructor(options = {}) {
    super(options)
    this.setupNextJSComponents()
  }

  /**
   * Setup Next.js specific server components
   */
  setupNextJSComponents() {
    // Register built-in Next.js server components
    this.registerComponent('NextImage', this.createNextImageComponent(), {
      cacheable: true,
      async: false
    })

    this.registerComponent('NextLink', this.createNextLinkComponent(), {
      cacheable: false,
      async: false
    })
  }

  /**
   * Create Next.js Image server component
   */
  createNextImageComponent() {
    return (props, context) => {
      // Implementation would integrate with Next.js Image optimization
      return {
        type: 'img',
        props: {
          src: props.src,
          alt: props.alt || '',
          width: props.width,
          height: props.height,
          loading: props.loading || 'lazy'
        }
      }
    }
  }

  /**
   * Create Next.js Link server component
   */
  createNextLinkComponent() {
    return (props, context) => {
      // Implementation would integrate with Next.js routing
      return {
        type: 'a',
        props: {
          href: props.href,
          rel: props.external ? 'noopener noreferrer' : undefined,
          target: props.external ? '_blank' : undefined
        },
        children: props.children
      }
    }
  }

  /**
   * Handle Next.js specific component rendering
   */
  async renderNextJSComponent(name, props, context) {
    // Add Next.js specific context
    const nextContext = {
      ...context,
      isNextJS: true,
      router: context.router || {},
      config: context.config || {}
    }

    return this.renderComponent(name, props, nextContext)
  }
}

module.exports = { 
  ServerComponentService, 
  ServerComponentFactory,
  NextJSServerComponentService 
}