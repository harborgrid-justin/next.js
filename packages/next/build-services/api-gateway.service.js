/**
 * API Gateway Service
 * Centralized API routing and middleware service
 * SOA Improvement: Service layer for API request handling
 */

/**
 * API Gateway service for centralized request routing
 */
class APIGatewayService {
  constructor() {
    this.routes = new Map()
    this.middleware = []
    this.errorHandlers = []
  }

  /**
   * Register an API route with the gateway
   * @param {string} path - Route path pattern
   * @param {string} method - HTTP method
   * @param {Function} handler - Route handler function
   * @param {Object} options - Route options
   */
  registerRoute(path, method, handler, options = {}) {
    const routeKey = `${method.toLowerCase()}:${path}`
    this.routes.set(routeKey, {
      path,
      method: method.toLowerCase(),
      handler,
      middleware: options.middleware || [],
      auth: options.auth || false,
      rateLimit: options.rateLimit || null,
      cache: options.cache || null
    })
    return this
  }

  /**
   * Register middleware to be applied to all routes
   * @param {Function} middleware - Middleware function
   * @param {number} priority - Execution priority (lower = earlier)
   */
  registerMiddleware(middleware, priority = 100) {
    this.middleware.push({ middleware, priority })
    this.middleware.sort((a, b) => a.priority - b.priority)
    return this
  }

  /**
   * Register error handler
   * @param {Function} errorHandler - Error handling function
   */
  registerErrorHandler(errorHandler) {
    this.errorHandlers.push(errorHandler)
    return this
  }

  /**
   * Process incoming request through the gateway
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async processRequest(req, res) {
    try {
      // Apply global middleware
      for (const { middleware } of this.middleware) {
        await this.executeMiddleware(middleware, req, res)
      }

      // Find matching route
      const route = this.findRoute(req.url, req.method)
      if (!route) {
        return this.handleNotFound(res)
      }

      // Apply route-specific middleware
      for (const middleware of route.middleware) {
        await this.executeMiddleware(middleware, req, res)
      }

      // Handle authentication
      if (route.auth && !await this.authenticate(req)) {
        return this.handleUnauthorized(res)
      }

      // Handle rate limiting
      if (route.rateLimit && !await this.checkRateLimit(req, route.rateLimit)) {
        return this.handleRateLimit(res)
      }

      // Check cache
      if (route.cache) {
        const cachedResponse = await this.getFromCache(req, route.cache)
        if (cachedResponse) {
          return this.sendCachedResponse(res, cachedResponse)
        }
      }

      // Execute route handler
      const result = await route.handler(req, res)

      // Cache response if configured
      if (route.cache && result) {
        await this.cacheResponse(req, result, route.cache)
      }

      return result

    } catch (error) {
      await this.handleError(error, req, res)
    }
  }

  /**
   * Find matching route for request
   */
  findRoute(url, method) {
    const routeKey = `${method.toLowerCase()}:${url}`
    
    // Direct match first
    if (this.routes.has(routeKey)) {
      return this.routes.get(routeKey)
    }

    // Pattern matching for dynamic routes
    for (const [key, route] of this.routes) {
      if (key.startsWith(`${method.toLowerCase()}:`) && this.matchesPattern(url, route.path)) {
        return route
      }
    }

    return null
  }

  /**
   * Check if URL matches route pattern
   */
  matchesPattern(url, pattern) {
    // Simple pattern matching - can be enhanced with more complex regex
    const patternRegex = new RegExp('^' + pattern.replace(/:[^/]+/g, '([^/]+)') + '$')
    return patternRegex.test(url)
  }

  /**
   * Execute middleware function
   */
  async executeMiddleware(middleware, req, res) {
    return new Promise((resolve, reject) => {
      try {
        const result = middleware(req, res, (error) => {
          if (error) reject(error)
          else resolve()
        })
        if (result && typeof result.then === 'function') {
          result.then(resolve).catch(reject)
        } else if (!result && result !== undefined) {
          resolve()
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Handle authentication
   */
  async authenticate(req) {
    // Default implementation - should be overridden
    return true
  }

  /**
   * Handle rate limiting
   */
  async checkRateLimit(req, config) {
    // Default implementation - should be overridden
    return true
  }

  /**
   * Handle caching
   */
  async getFromCache(req, config) {
    // Default implementation - should be overridden
    return null
  }

  async cacheResponse(req, response, config) {
    // Default implementation - should be overridden
  }

  /**
   * Error handling methods
   */
  handleNotFound(res) {
    res.status(404).json({ error: 'Route not found' })
  }

  handleUnauthorized(res) {
    res.status(401).json({ error: 'Unauthorized' })
  }

  handleRateLimit(res) {
    res.status(429).json({ error: 'Rate limit exceeded' })
  }

  sendCachedResponse(res, cachedResponse) {
    res.json(cachedResponse)
  }

  async handleError(error, req, res) {
    console.error('API Gateway Error:', error)
    
    // Apply error handlers
    for (const handler of this.errorHandlers) {
      try {
        const handled = await handler(error, req, res)
        if (handled) return
      } catch (handlerError) {
        console.error('Error in error handler:', handlerError)
      }
    }

    // Default error response
    res.status(500).json({ error: 'Internal server error' })
  }
}

module.exports = { APIGatewayService }