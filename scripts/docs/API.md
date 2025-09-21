# Next.js Build Scripts - Enterprise Utilities API Documentation

## Overview

This documentation covers the enterprise-grade utilities and improvements made to the Next.js build scripts. These utilities provide enhanced error handling, security, performance optimization, configuration management, and comprehensive testing capabilities.

## Table of Contents

1. [Configuration Manager](#configuration-manager)
2. [Logger](#logger)
3. [Process Manager](#process-manager)
4. [Security Utilities](#security-utilities)
5. [Performance Utilities](#performance-utilities)
6. [Testing Framework](#testing-framework)
7. [Enhanced Scripts](#enhanced-scripts)

## Configuration Manager

### Overview

The Configuration Manager provides centralized configuration management with support for multiple sources, validation, and environment-specific settings.

### Usage

```javascript
const { loadConfig, getConfig } = require('./utils/config-manager')

// Load configuration
await loadConfig('github', {
  required: ['token', 'repository'],
  defaults: {
    apiVersion: '2022-11-28',
    baseUrl: 'https://api.github.com'
  }
})

// Get configuration
const config = getConfig('github')
console.log(config.token) // Retrieved from env vars, config files, or defaults
```

### Configuration Sources (Priority Order)

1. **Environment Variables**: `CONFIGNAME_FIELDNAME` format
2. **Configuration Files**: `.config/name.json`, `.namerc.json`, `name.config.json`
3. **Package.json**: Under `config.name` section
4. **Default Values**: Specified in schema

### API Reference

#### `loadConfig(name, schema)`
- **Parameters**: 
  - `name` (string): Configuration name
  - `schema` (object): Validation schema
- **Returns**: Promise<object> - Loaded configuration
- **Throws**: ConfigValidationError

## Logger

### Overview

Enterprise logging system with multiple transports, structured logging, and performance monitoring capabilities.

### Usage

```javascript
const { getLogger } = require('./utils/logger')

const logger = getLogger('MyScript', {
  console: { level: 'INFO', useColors: true },
  file: { filename: 'app.log', level: 'DEBUG' }
})

// Basic logging
logger.info('Operation completed', { userId: 123, duration: '500ms' })
logger.error('Operation failed', { error: 'Connection timeout' }, error)

// Performance monitoring
logger.time('database-query')
await performDatabaseQuery()
logger.timeEnd('database-query')
```

### Log Levels

- **TRACE** (10): Very detailed debug information
- **DEBUG** (20): Debug information
- **INFO** (30): General information
- **WARN** (40): Warning messages
- **ERROR** (50): Error messages
- **FATAL** (60): Fatal errors

## Process Manager

### Overview

Advanced process execution with retry logic, timeout handling, concurrency control, and comprehensive monitoring.

### Usage

```javascript
const { getProcessManager } = require('./utils/process-manager')

const pm = getProcessManager('build')

// Execute single command
const result = await pm.execute('npm', ['run', 'build'], {
  timeout: 300000,
  retries: 3,
  retryOn: ['timeout', 'error']
})

// Parallel execution
const results = await pm.parallel([
  'npm run lint',
  'npm run test'
], { maxConcurrency: 2 })
```

## Security Utilities

### Overview

Comprehensive security utilities including input validation, credential management, rate limiting, and security headers.

### Usage

```javascript
const { 
  InputValidator, 
  CredentialManager, 
  RateLimiter,
  SecurityHeaders 
} = require('./utils/security')

// Input validation
const safePath = InputValidator.sanitizePath(userInput, '/safe/base/path')
const safeUrl = InputValidator.sanitizeUrl(urlInput, ['api.github.com'])

// Rate limiting
const rateLimiter = new RateLimiter({ windowMs: 60000, maxRequests: 100 })
const result = rateLimiter.isAllowed(clientIP)
```

## Performance Utilities

### Overview

Advanced performance monitoring, memory optimization, CPU optimization, and I/O optimization utilities.

### Usage

```javascript
const { getPerformanceManager } = require('./utils/performance')

const perf = getPerformanceManager()

// Performance timing
const timer = perf.collector.timer('database-query')
await performQuery()
timer.end()

// Memory optimization
const pool = perf.memoryOptimizer.createPool('objects', () => ({}), 100)
const obj = perf.memoryOptimizer.getFromPool('objects')
```

## Testing Framework

### Overview

Comprehensive testing framework with unit tests, integration tests, mocking capabilities, and detailed reporting.

### Usage

```javascript
const { TestRunner, assert } = require('./utils/testing')

const runner = new TestRunner({ verbose: true })

runner.describe('Configuration Manager', () => {
  runner.it('should load configuration', async () => {
    const result = await loadConfig('test')
    assert.assertEqual(result.apiKey, 'test-key')
  })
})

const stats = await runner.run()
```

## Enhanced Scripts

### check-error-codes.js

Enhanced error code processing with comprehensive validation and performance monitoring.

```bash
VERBOSE=true node packages/next/check-error-codes.js
```

### code-freeze.js

GitHub branch protection management with enhanced error handling.

```bash
CODE_FREEZE_TOKEN=ghp_... node scripts/code-freeze.js --type enable --verbose
```

### generate-release-log.mjs

Enhanced release log generation with validation and timeout handling.

```bash
OUTPUT_JSON=true node scripts/generate-release-log.mjs
```

### rm.mjs

Enhanced file removal utility with security validation.

```bash
DRY_RUN=true VERBOSE=true node scripts/rm.mjs path1 path2
```

### minimal-server.js

Enterprise-grade minimal Next.js server with security and monitoring.

```bash
PORT=4000 LOG_REQUIRE=true node scripts/minimal-server.js /path/to/app
```

### pull-turbo-cache.js

Enhanced Turbo cache management with enterprise architecture.

```bash
TURBO_VERSION=latest VERBOSE=true node scripts/pull-turbo-cache.js target-name
```

### merge-errors-json/merge.mjs

Enterprise Git merge driver with comprehensive security features.

```bash
VERBOSE=true node scripts/merge-errors-json/merge.mjs current base other
```

## Environment Variables

### Global Settings
- `NODE_ENV` - Environment (development, production, test)
- `DEBUG` - Enable debug logging
- `VERBOSE` - Enable verbose logging  
- `DRY_RUN` - Enable dry-run mode

### Performance Settings
- `MAX_CONCURRENT_OPERATIONS` - Maximum concurrent operations
- `REQUEST_TIMEOUT` - Request timeout in milliseconds
- `MAX_RETRIES` - Maximum retry attempts

## Error Handling

All utilities implement comprehensive error handling with custom error classes:

### Error Types
- `ConfigValidationError` - Configuration validation errors
- `ProcessError` - Process execution errors  
- `ProcessTimeoutError` - Process timeout errors
- `ValidationError` - Input validation errors
- `FileOperationError` - File operation errors
- `GitHubAPIError` - GitHub API errors

## Best Practices

### Configuration
1. Use environment-specific configuration files
2. Validate all configuration inputs
3. Provide sensible defaults

### Logging
1. Use appropriate log levels
2. Include structured context data
3. Log performance metrics

### Security
1. Validate all inputs
2. Use encryption for sensitive data
3. Implement rate limiting

### Performance
1. Monitor key metrics
2. Use caching strategically
3. Profile performance bottlenecks

### Testing
1. Write comprehensive unit tests
2. Include integration tests
3. Test error conditions

## Support and Troubleshooting

### Debug Mode

Enable debug mode for detailed troubleshooting:

```bash
DEBUG=true VERBOSE=true node script.js
```

### Performance Monitoring

Monitor performance with built-in metrics:

```bash
PERFORMANCE_MONITORING=true node script.js
```