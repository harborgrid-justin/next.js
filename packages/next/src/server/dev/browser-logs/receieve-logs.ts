import { cyan, dim, gray, red, yellow } from '../../../lib/picocolors'
import type { Project } from '../../../build/swc/types'
import util from 'util'
import {
  getConsoleLocation,
  getSourceMappedStackFrames,
  withStack,
  type MappingContext,
} from './source-map'
import type {
  LogEntry,
  LogMethod,
} from '../../../next-devtools/shared/forward-logs-types'

// todo: share with client
const UNDEFINED_MARKER = '__next_tagged_undefined'

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

// todo: use react impl sebbie posted
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

async function prepareArgs(
  entry: LogEntry,
  ctx: MappingContext,
  distDir: string
) {
  switch (entry.kind) {
    case 'formatted-error': {
      const mappedStack = await getSourceMappedStackFrames(
        entry.stack,
        ctx,
        distDir
      )
      return [colorError(mappedStack, { prefix: entry.prefix })]
    }
    case 'console': {
      const deserializedArgs = await Promise.all(
        entry.args.map(async (arg) => {
          switch (arg.kind) {
            case 'arg': {
              const deserialized = await deserializeArgData(arg.data)
              if (entry.method === 'warn' && typeof deserialized === 'string') {
                return yellow(deserialized)
              }
              return deserialized
            }
            case 'formatted-error-arg': {
              if (!arg.stack) {
                return red(arg.prefix)
              }
              const mappedStack = await getSourceMappedStackFrames(
                arg.stack,
                ctx,
                distDir
              )
              return colorError(mappedStack, {
                prefix: arg.prefix,
                applyColor: false,
              })
            }
          }
        })
      )
      return deserializedArgs
    }
    case 'console-error': {
      const deserializedArgs = await Promise.all(
        entry.args.map(async (arg) => {
          switch (arg.kind) {
            case 'arg': {
              if (arg.isRejectionMessage) {
                // if we want it to look like our server output we would just color the red x, idk todo i kinda like the full red, but maybe should sync other message then?
                return red(arg.data) // already a string
              }
              // return red(inspectDeep(arg.data))
              return deserializeArgData(arg.data)
            }
            case 'formatted-error-arg': {
              if (!arg.stack) {
                return red(arg.prefix)
              }
              const mappedStack = await getSourceMappedStackFrames(
                arg.stack,
                ctx,
                distDir
              )
              return colorError(mappedStack, {
                prefix: arg.prefix,
              })
            }
          }
        })
      )

      if (entry.args.some((arg) => arg.kind === 'formatted-error-arg')) {
        // then we already are showing the pretty stack, we don't need to show it twice (though the console stack has slightly different info than the error stack)
        return deserializedArgs
      }
      const mappedStack = await getSourceMappedStackFrames(
        entry.consoleErrorStack,
        ctx,
        distDir
      )

      return [...deserializedArgs, colorError(mappedStack)]
    }
  }
  entry satisfies never
}

export async function receiveEvent(
  entries: LogEntry[],
  ctx: MappingContext,
  distDir: string
): Promise<void> {
  const baseBrowserPrefix = cyan('[browser]')

  for (const entry of entries) {
    try {
      switch (entry.kind) {
        case 'console': {
          const browserPrefix = baseBrowserPrefix

          switch (entry.method) {
            case 'table': {
              const deserializedArgs = await Promise.all(
                entry.args.map(async (arg) => {
                  // browser behavior when console.table(new Error) is showing stack in table
                  if (arg.kind === 'formatted-error-arg') {
                    return {
                      stack: arg.stack,
                    }
                  }

                  return deserializeArgData(arg.data)
                })
              )
              // can't inline a browser prefix to console table
              forwardConsole.log(browserPrefix)
              forwardConsole.table(...deserializedArgs)
              break
            }
            case 'trace': {
              const deserializedArgs = await Promise.all(
                entry.args.map(async (arg) => {
                  // browser behavior when console.table(new Error) is showing stack in table
                  if (arg.kind === 'formatted-error-arg') {
                    if (!arg.stack) {
                      return red(arg.prefix)
                    }
                    const mappedStack = await getSourceMappedStackFrames(
                      arg.stack,
                      ctx,
                      distDir
                    )
                    return colorError(mappedStack, {
                      prefix: arg.prefix,
                    })
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
                break
              }

              // this is pretty bad but its fine
              // i should see how expensive this fn is :think
              const [mapped, mappedIgnored] = await Promise.all([
                getSourceMappedStackFrames(
                  entry.consoleMethodStack,
                  ctx,
                  distDir,
                  false
                ),
                getSourceMappedStackFrames(
                  entry.consoleMethodStack,
                  ctx,
                  distDir
                ),
              ])

              const location = getConsoleLocation(mappedIgnored)

              // console.trace on server will show the trace of console.trace, which is useless to the user and not whats shown in browser
              forwardConsole.log(
                browserPrefix,
                ...deserializedArgs,
                `\n${mapped.stack}`,
                ...(location ? [`\n${location}`] : [])
              )
              break
            }
            case 'dir': {
              const loggableEntry = await prepareArgs(entry, ctx, distDir)
              const consoleMethod =
                forwardConsole[entry.method] || forwardConsole.log

              process.stdout.write(browserPrefix)
              consoleMethod(...loggableEntry)

              if (entry.consoleMethodStack) {
                const mapped = await getSourceMappedStackFrames(
                  entry.consoleMethodStack,
                  ctx,
                  distDir
                )
                const location = dim(`(${getConsoleLocation(mapped)})`)
                if (location) {
                  process.stdout.write('\x1b[1A')
                  process.stdout.write(' ' + location + '\n')
                  break
                }
              }
            }
            default: {
              const loggableEntry = await prepareArgs(entry, ctx, distDir)
              const loggableEntryWithStack = await withStack(
                {
                  original: loggableEntry,
                  stack: entry.consoleMethodStack,
                },
                ctx,
                distDir
              )
              const consoleMethod =
                forwardConsole[entry.method] || forwardConsole.log
              consoleMethod(browserPrefix, ...loggableEntryWithStack)
            }
          }
          break
        }
        case 'console-error':
        case 'formatted-error': {
          const browserPrefix = baseBrowserPrefix
          const consoleErrorArgs = await prepareArgs(entry, ctx, distDir)
          forwardConsole.error(browserPrefix, ...consoleErrorArgs)
          break
        }
      }
    } catch {
      switch (entry.kind) {
        case 'console-error':
        case 'console': {
          const browserPrefix = baseBrowserPrefix
          const consoleMethod =
            forwardConsole[entry.method] || forwardConsole.log
          // @ts-expect-error todo fix this its wrong, its completely random data and type erroring
          consoleMethod(browserPrefix, ...entry.args)
          break
        }
        case 'formatted-error': {
          const browserPrefix = baseBrowserPrefix
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

  await receiveEvent(entries, ctx, distDir)
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

  await receiveEvent(entries, ctx, distDir)
}
