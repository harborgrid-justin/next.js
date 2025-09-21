# Next.js SOA Build Services

This directory contains the **Service-Oriented Architecture (SOA)** improvements to the Next.js build system. These services transform the monolithic `taskfile.js` approach into a modular, maintainable architecture.

## 📋 15 SOA Improvements Implemented

### 🏗️ Infrastructure & Build System
1. **[NCC Compilation Service](./ncc-compilation.service.js)** - Standardized compilation tasks
2. **[Build Orchestration Service](./build-orchestration.service.js)** - Coordinated build workflows
3. **[Bundling Services](./bundling.service.js)** - Modular bundling (NCC, Webpack, SWC)

### 🖥️ Server Architecture
4. **[API Gateway Service](./api-gateway.service.js)** - Centralized API routing and middleware
5. **[Server-Side Rendering Service](./ssr.service.js)** - Dedicated SSR logic
6. **[Server Components Service](./server-components.service.js)** - React Server Components management
7. **[Telemetry Service](./telemetry.service.js)** - Performance and usage analytics

### 🌐 Client Architecture
8. **[Client Bundling Service](./client-bundling.service.js)** - Client-side bundle generation
9. **[Asset Management Service](./asset-management.service.js)** - Static asset optimization
10. **[Development Server Service](./dev-server.service.js)** - Modular development server

### ⚙️ Configuration & Utilities
11. **[Configuration Service](./configuration.service.js)** - Centralized config management
12. **[Error Handling Service](./error-handling.service.js)** - Error aggregation and reporting
13. **[Compiler Services](./compiler.service.js)** - TypeScript/SWC compilation

### 🧪 Testing & Quality
14. **[Testing Orchestration Service](./testing.service.js)** - Centralized test execution
15. **[Linting Service Interface](./linting.service.js)** - Standardized linting API

## 🚀 Quick Start

### Basic Usage

```javascript
const { NextJSBuildSystemFacade } = require('./build-services')

async function build() {
  const buildSystem = new NextJSBuildSystemFacade()
  await buildSystem.initialize()
  
  // Build the project
  const result = await buildSystem.build({ 
    mode: 'production',
    target: 'server'
  })
  
  console.log(`Build completed in ${result.duration}ms`)
}

build()
```

### Individual Service Usage

```javascript
const { NextJSCompilerManager, NextJSLintingService } = require('./build-services')

// Use compiler service
const compiler = new NextJSCompilerManager()
const tsService = compiler.getTypeScriptService()
const result = await tsService.compile('const x: number = 42')

// Use linting service  
const linter = new NextJSLintingService()
const lintResults = await linter.lintProject()
```

### Service Registry with Dependency Injection

```javascript
const { NextJSServiceRegistry } = require('./build-services')

const registry = new NextJSServiceRegistry()
const services = await registry.getNextJSBuildSystem()

// All services are initialized with proper dependencies
const { config, compiler, buildOrchestrator } = services
```

## 🔄 Migration Strategy

### Option 1: Full SOA Migration
Replace `taskfile.js` completely with SOA services:

```javascript
const { ModernNextJSBuildSystem } = require('./build-services/soa-integration.example')

const buildSystem = new ModernNextJSBuildSystem()
await buildSystem.initialize()
await buildSystem.build(task, opts)
```

### Option 2: Hybrid Approach  
Gradual migration while maintaining backward compatibility:

```javascript
const { HybridBuildSystem } = require('./build-services/soa-integration.example')

const buildSystem = new HybridBuildSystem()
await buildSystem.initialize()

// Uses SOA services where available, falls back to legacy tasks
await buildSystem.build(task, { useSOA: true })
```

### Option 3: Legacy with SOA Features
Keep existing system but add SOA services for specific features:

```javascript
// In your existing taskfile.js
const { NextJSTelemetryService, NextJSErrorHandlingService } = require('./build-services')

const telemetry = new NextJSTelemetryService()
const errorHandler = new NextJSErrorHandlingService()

export async function build(task, opts) {
  await telemetry.trackBuildPerformance('build-start', 0)
  
  try {
    // existing build logic
    await originalBuildLogic(task, opts)
    await telemetry.trackBuildPerformance('build-complete', duration)
  } catch (error) {
    await errorHandler.handleError(error, { buildPhase: 'compilation' })
    throw error
  }
}
```

## 🏛️ Architecture Principles

### Service-Oriented Design
- **Single Responsibility**: Each service has one focused purpose
- **Loose Coupling**: Services interact through well-defined interfaces
- **High Cohesion**: Related functionality grouped within services
- **Dependency Injection**: Clear, manageable service dependencies

### Key Benefits
- **Modularity**: Independent development and testing
- **Scalability**: Easy to extend and modify individual services  
- **Maintainability**: Clear separation of concerns
- **Testability**: Each service can be unit tested in isolation
- **Flexibility**: Easy to swap implementations

### Service Categories

```
📦 Infrastructure Services
├── Configuration Management
├── Error Handling & Logging  
├── Build Orchestration
└── Telemetry & Analytics

🖥️ Core Build Services  
├── Compilation (TypeScript, SWC)
├── Bundling (Webpack, Rollup, etc.)
├── Asset Processing & Optimization
└── Code Generation

🌐 Runtime Services
├── Server-Side Rendering
├── API Gateway & Routing
├── Development Server
└── Server Components

🧪 Quality Services
├── Testing Orchestration  
├── Linting & Code Style
├── Type Checking
└── Performance Analysis
```

## 📊 Service Dependencies

The service registry automatically manages dependencies:

```
Configuration Service (no deps)
├── Error Handling Service  
├── Compiler Services
├── Asset Management Service
└── Telemetry Service
    ├── Build Orchestration Service
    ├── Server Components Service  
    └── Development Server Service
        └── API Gateway Service
```

## 🔧 Extending the System

### Adding a New Service

```javascript
// 1. Create your service
class MyCustomService extends EventEmitter {
  constructor(options = {}) {
    super()
    this.options = options
  }
  
  async performTask() {
    // Service logic
    this.emit('task-complete')
  }
}

// 2. Register with the service registry  
const registry = new NextJSServiceRegistry()
registry.register('myService', (options) => new MyCustomService(options), ['config'])

// 3. Use the service
const services = await registry.getNextJSBuildSystem()
const myService = services.myService
```

### Creating Custom Build Workflows

```javascript
const { BuildOrchestrationService } = require('./build-services')

const orchestrator = new BuildOrchestrationService()

orchestrator
  .registerStep('clean', async (task, opts) => {
    await task.clear('dist')
  })
  .registerStep('compile', async (task, opts) => {
    // Compilation logic
  }, ['clean'])
  .registerStep('bundle', async (task, opts) => {
    // Bundling logic  
  }, ['compile'])

await orchestrator.execute(taskRunner, options)
```

## 📈 Performance Impact

The SOA services are designed for minimal performance overhead:

- **Lazy Loading**: Services initialize only when needed
- **Efficient Caching**: Built-in caching for compilation and asset processing
- **Parallel Execution**: Services can run independently where possible
- **Memory Management**: Services clean up resources appropriately

## 🧪 Testing

Each service is thoroughly tested:

```bash
# Test individual services
npm test -- build-services/compiler.service.test.js

# Test service integration
npm test -- build-services/integration.test.js

# Test migration compatibility  
npm test -- build-services/migration.test.js
```

## 📚 Advanced Usage

### Custom Service Implementations

```javascript
// Implement your own bundling service
class CustomBundlingService extends BundlingService {
  async bundle(task, config) {
    // Custom bundling logic
    return customBundleResult
  }
}

// Register with factory
BundlingServiceFactory.register('custom', CustomBundlingService)
const service = BundlingServiceFactory.create('custom', options)
```

### Event-Driven Architecture

```javascript
const telemetry = new NextJSTelemetryService()

// Listen to all service events
telemetry.on('build-performance', (data) => {
  console.log(`Build took ${data.duration}ms`)
})

telemetry.on('error', (error) => {
  console.error('Service error:', error)
})
```

## 🤝 Contributing

To contribute to the SOA services:

1. Follow the established service patterns
2. Add comprehensive tests for new services
3. Update this documentation
4. Ensure backward compatibility
5. Add performance benchmarks for new services

## 📄 License

Same as Next.js - MIT License