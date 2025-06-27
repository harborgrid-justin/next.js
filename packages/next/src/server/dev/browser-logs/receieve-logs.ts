import { cyan, dim, red, yellow } from '../../../lib/picocolors'
import type { Project } from '../../../build/swc/types'
import util from 'util'
import {
  getConsoleLocation,
  getSourceMappedStackFrames,
  withStack,
  type MappingContext,
} from './source-map'
import {
  type LogEntry,
  type LogMethod,
  type ConsoleEntry,
  UNDEFINED_MARKER,
} from '../../../next-devtools/shared/forward-logs-shared'

export function restoreUndefined(x: any): any {
  if (x === UNDEFINED_MARKER) return undefined
  if (Array.isArray(x)) return x.map(restoreUndefined)
  if (x && typeof x === 'object') {
    for (let k in x) {
      x[k] = restoreUndefined(x[k])
    }
  }
  return x
}

const methods: Array<LogMethod> = [
  'log',
  'info',
  'warn',
  'debug',
  'table',
  'error',
  'assert',
  'dir',
  'dirxml',
  'group',
  'groupCollapsed',
  'groupEnd',
]

const methodsToSkipInspect = new Set([
  'table',
  'dir',
  'dirxml',
  'group',
  'groupCollapsed',
  'groupEnd',
])

const forwardConsole: typeof console = {
  ...console,
  ...Object.fromEntries(
    methods.map((method) => [
      method,
      (...args: Array<any>) =>
        (console[method] as any)(
          ...args.map((arg) =>
            methodsToSkipInspect.has(method) ||
            typeof arg !== 'object' ||
            arg === null
              ? arg
              : util.inspect(arg, { depth: Infinity, colors: true })
          )
        ),
    ])
  ),
}

async function deserializeArgData(arg: any) {
  try {
    // we want undefined to be represented as it would be in the browser from the user's perspective
    if (arg === UNDEFINED_MARKER) {
      return restoreUndefined(arg)
    }

    return restoreUndefined(JSON.parse(arg))
  } catch {
    return arg
  }
}

const colorError = (
  mapped: Awaited<ReturnType<typeof getSourceMappedStackFrames>>,
  config?: {
    prefix?: string
    applyColor?: boolean
  }
) => {
  const colorFn =
    config?.applyColor === undefined || config.applyColor ? red : <T>(x: T) => x
  switch (mapped.kind) {
    case 'mapped-stack':
    case 'stack': {
      return (
        (config?.prefix ? colorFn(config?.prefix) : '') +
        `\n${colorFn(mapped.stack)}`
      )
    }
    case 'with-frame-code': {
      return (
        (config?.prefix ? colorFn(config?.prefix) : '') +
        `\n${colorFn(mapped.stack)}\n${mapped.frameCode}`
      )
    }
    // we don't want to echo the gunk if it's just
    // a more sophisticated version of this allows the user to config if they want ignored frames (but we need to be sure to source map them)
    case 'all-ignored': {
      return config?.prefix ? colorFn(config?.prefix) : ''
    }
  }
  mapped satisfies never
}

async function prepareFormattedErrorArgs(
  entry: Extract<LogEntry, { kind: 'formatted-error' }>,
  ctx: MappingContext,
  distDir: string
) {
  const mapped = await getSourceMappedStackFrames(entry.stack, ctx, distDir)
  return [colorError(mapped, { prefix: entry.prefix })]
}

async function prepareConsoleArgs(
  entry: Extract<LogEntry, { kind: 'console' }>,
  ctx: MappingContext,
  distDir: string
) {
  const deserialized = await Promise.all(
    entry.args.map(async (arg) => {
      if (arg.kind === 'arg') {
        const data = await deserializeArgData(arg.data)
        if (entry.method === 'warn' && typeof data === 'string') {
          return yellow(data)
        }
        return data
      }
      if (!arg.stack) return red(arg.prefix)
      const mapped = await getSourceMappedStackFrames(arg.stack, ctx, distDir)
      return colorError(mapped, { prefix: arg.prefix, applyColor: false })
    })
  )
  return deserialized
}

async function prepareConsoleErrorArgs(
  entry: Extract<LogEntry, { kind: 'any-logged-error' }>,
  ctx: MappingContext,
  distDir: string
) {
  const deserialized = await Promise.all(
    entry.args.map(async (arg) => {
      if (arg.kind === 'arg') {
        if (arg.isRejectionMessage) return red(arg.data)
        return deserializeArgData(arg.data)
      }
      // formatted-error-arg
      if (!arg.stack) return red(arg.prefix)
      const mapped = await getSourceMappedStackFrames(arg.stack, ctx, distDir)
      return colorError(mapped, { prefix: arg.prefix })
    })
  )

  if (entry.args.some((a) => a.kind === 'formatted-error-arg')) {
    return deserialized
  }
  const mappedStack = await getSourceMappedStackFrames(
    entry.consoleErrorStack,
    ctx,
    distDir
  )
  return [...deserialized, colorError(mappedStack)]
}

// Helper functions for specific console methods
async function handleTable(entry: ConsoleEntry, browserPrefix: string) {
  const deserializedArgs = await Promise.all(
    entry.args.map(async (arg: any) => {
      if (arg.kind === 'formatted-error-arg') {
        return { stack: arg.stack }
      }
      return deserializeArgData(arg.data)
    })
  )
  // console.table cannot have prefix inline, mimic original behavior
  forwardConsole.log(browserPrefix)
  forwardConsole.table(...deserializedArgs)
}

async function handleTrace(
  entry: ConsoleEntry,
  browserPrefix: string,
  ctx: MappingContext,
  distDir: string
) {
  const deserializedArgs = await Promise.all(
    entry.args.map(async (arg: any) => {
      if (arg.kind === 'formatted-error-arg') {
        if (!arg.stack) return red(arg.prefix)
        const mapped = await getSourceMappedStackFrames(arg.stack, ctx, distDir)
        return colorError(mapped, { prefix: arg.prefix })
      }
      return deserializeArgData(arg.data)
    })
  )

  if (!entry.consoleMethodStack) {
    forwardConsole.log(
      browserPrefix,
      ...deserializedArgs,
      '[Trace unavailable]'
    )
    return
  }

  const [mapped, mappedIgnored] = await Promise.all([
    getSourceMappedStackFrames(entry.consoleMethodStack, ctx, distDir, false),
    getSourceMappedStackFrames(entry.consoleMethodStack, ctx, distDir),
  ])
  const location = getConsoleLocation(mappedIgnored)
  forwardConsole.log(
    browserPrefix,
    ...deserializedArgs,
    `\n${mapped.stack}`,
    ...(location ? [`\n${location}`] : [])
  )
}

async function handleDir(
  entry: ConsoleEntry,
  browserPrefix: string,
  ctx: MappingContext,
  distDir: string
) {
  const loggableEntry = await prepareConsoleArgs(entry, ctx, distDir)
  const consoleMethod =
    (forwardConsole as any)[entry.method] || forwardConsole.log

  if (entry.consoleMethodStack) {
    const mapped = await getSourceMappedStackFrames(
      entry.consoleMethodStack,
      ctx,
      distDir
    )
    const location = dim(`(${getConsoleLocation(mapped)})`)
    const originalWrite = process.stdout.write.bind(process.stdout)
    let captured = ''
    // intercept stdout to prepend prefix later
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(process.stdout.write as any) = (chunk: any) => {
      captured += chunk
      return true
    }
    try {
      consoleMethod(...loggableEntry)
    } finally {
      // restore
      ;(process.stdout.write as any) = originalWrite
    }
    const preserved = captured.replace(/\r?\n$/, '')
    originalWrite(`${browserPrefix}${preserved} ${location}\n`)
    return
  }
  consoleMethod(browserPrefix, ...loggableEntry)
}

async function handleDefaultConsole(
  entry: ConsoleEntry,
  browserPrefix: string,
  ctx: MappingContext,
  distDir: string
) {
  const loggableEntry = await prepareConsoleArgs(entry, ctx, distDir)
  const withStackEntry = await withStack(
    {
      original: loggableEntry,
      stack: (entry as any).consoleMethodStack || null,
    },
    ctx,
    distDir
  )
  const consoleMethod =
    (forwardConsole as any)[(entry as any).method] || forwardConsole.log
  consoleMethod(browserPrefix, ...withStackEntry)
}

export async function handleLog(
  entries: LogEntry[],
  ctx: MappingContext,
  distDir: string
): Promise<void> {
  const browserPrefix = cyan('[browser]')

  for (const entry of entries) {
    try {
      switch (entry.kind) {
        case 'console': {
          switch (entry.method) {
            case 'table': {
              await handleTable(entry, browserPrefix)
              break
            }
            case 'trace': {
              await handleTrace(entry, browserPrefix, ctx, distDir)
              break
            }
            case 'dir': {
              await handleDir(entry, browserPrefix, ctx, distDir)
              break
            }
            default: {
              await handleDefaultConsole(entry, browserPrefix, ctx, distDir)
            }
          }
          break
        }
        // any logged errors are anything that are logged as "red" in the browser but aren't only an Error (console.error, Promise.reject(100))
        case 'any-logged-error': {
          const consoleArgs = await prepareConsoleErrorArgs(entry, ctx, distDir)
          forwardConsole.error(browserPrefix, ...consoleArgs)
          break
        }
        // formatted error is an explicit error event (rejections, uncaught errors)
        case 'formatted-error': {
          const formattedArgs = await prepareFormattedErrorArgs(
            entry,
            ctx,
            distDir
          )
          forwardConsole.error(browserPrefix, ...formattedArgs)
          break
        }
      }
    } catch {
      switch (entry.kind) {
        case 'any-logged-error':
        case 'console': {
          const consoleMethod =
            forwardConsole[entry.method] || forwardConsole.log
          // @ts-expect-error todo fix this its wrong, its completely random data and type erroring
          consoleMethod(browserPrefix, ...entry.args)
          break
        }
        case 'formatted-error': {
          forwardConsole.error(browserPrefix, `${entry.prefix}\n`, entry.stack)
          break
        }
      }
    }
  }
}

export async function receiveBrowserLogsWebpack(opts: {
  entries: LogEntry[]
  router: 'app' | 'pages'
  sourceType?: 'server' | 'edge-server'
  clientStats: () => any
  serverStats: () => any
  edgeServerStats: () => any
  rootDirectory: string
  distDir: string
}): Promise<void> {
  const {
    entries,
    router,
    sourceType,
    clientStats,
    serverStats,
    edgeServerStats,
    rootDirectory,
    distDir,
  } = opts

  const isAppDirectory = router === 'app'
  const isServer = sourceType === 'server'
  const isEdgeServer = sourceType === 'edge-server'

  const ctx: MappingContext = {
    bundler: 'webpack',
    isServer,
    isEdgeServer,
    isAppDirectory,
    clientStats,
    serverStats,
    edgeServerStats,
    rootDirectory,
  }

  await handleLog(entries, ctx, distDir)
}

export async function receiveBrowserLogsTurbopack(opts: {
  entries: LogEntry[]
  router: 'app' | 'pages'
  sourceType?: 'server' | 'edge-server'
  project: Project
  projectPath: string
  distDir: string
}): Promise<void> {
  const { entries, router, sourceType, project, projectPath, distDir } = opts

  const isAppDirectory = router === 'app'
  const isServer = sourceType === 'server'
  const isEdgeServer = sourceType === 'edge-server'

  const ctx: MappingContext = {
    bundler: 'turbopack',
    project,
    projectPath,
    isServer,
    isEdgeServer,
    isAppDirectory,
  }

  await handleLog(entries, ctx, distDir)
}
