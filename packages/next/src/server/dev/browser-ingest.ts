import type { StackFrame } from 'next/dist/compiled/stacktrace-parser'
import type { OriginalStackFramesResponse } from '../../next-devtools/server/shared'
import { cyan, red } from '../../lib/picocolors'
import { parseStack } from '../lib/parse-stack'
import path from 'path'
import { getOriginalStackFrames as getOriginalStackFramesWebpack } from './middleware-webpack'
import { getOriginalStackFrames as getOriginalStackFramesTurbopack } from './middleware-turbopack'
import type { Project } from '../../build/swc/types'
// is this safe with edge stuff, idk, because the other edge check im sus, but we already used path soo
import util from 'util'

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

const levels: Array<LogLevel> = ['log', 'info', 'warn', 'debug', 'table']
const forwardConsole: typeof console = {
  ...console,
  ...Object.fromEntries(
    levels.map((method) => [
      method,
      (...args: any[]) =>
        (console[method] as any)(
          ...args.map((arg) =>
            typeof arg === 'object' && arg !== null
              ? util.inspect(arg, { depth: null, colors: true })
              : arg
          )
        ),
    ])
  ),
}

// const levelColors = {
//   log: white,
//   info: blue,
//   warn: yellow,
//   error: red,
//   debug: white,
//   table: white,
// } as const

// wtf is the point of this file
// not actually shared fire
export type LogLevel = 'log' | 'info' | 'warn' | 'debug' | 'table'

export type ConsoleEntry = {
  kind: 'console'
  level: LogLevel
  args: Array<
    | {
        kind: 'arg'
        data: string
      }
    | {
        kind: 'formatted-error-arg'
        prefix: string
        stack: string
      }
  >
}

export type ConsoleErrorEntry = {
  kind: 'console-error'
  level: 'error'
  consoleErrorStack: string
  args: Array<
    | {
        kind: 'arg'
        data: any
        isRejectionMessage?: boolean
      }
    | {
        kind: 'formatted-error-arg'
        prefix: string
        stack: string
      }
  >
}

export type FormattedErrorEntry = {
  kind: 'formatted-error'
  prefix: string
  stack: string
  level: 'error'
}

export type LogEntry = ConsoleEntry | ConsoleErrorEntry | FormattedErrorEntry

type WebpackMappingContext = {
  bundler: 'webpack'
  isServer: boolean
  isEdgeServer: boolean
  isAppDirectory: boolean
  clientStats: () => any
  serverStats: () => any
  edgeServerStats: () => any
  rootDirectory: string
}

type TurbopackMappingContext = {
  bundler: 'turbopack'
  isServer: boolean
  isEdgeServer: boolean
  isAppDirectory: boolean
  project: Project
  projectPath: string
}

type MappingContext = WebpackMappingContext | TurbopackMappingContext

async function mapFramesUsingBundler(
  frames: StackFrame[],
  ctx: MappingContext
) {
  switch (ctx.bundler) {
    case 'webpack': {
      const {
        isServer,
        isEdgeServer,
        isAppDirectory,
        clientStats,
        serverStats,
        edgeServerStats,
        rootDirectory,
      } = ctx
      // webpack is the problem
      const res = await getOriginalStackFramesWebpack({
        isServer,
        isEdgeServer,
        isAppDirectory,
        frames,
        clientStats,
        serverStats,
        edgeServerStats,
        rootDirectory,
      })
      return res
    }
    case 'turbopack': {
      const { project, projectPath, isServer, isEdgeServer, isAppDirectory } =
        ctx
      const res = await getOriginalStackFramesTurbopack({
        project,
        projectPath,
        frames,
        isServer,
        isEdgeServer,
        isAppDirectory,
      })

      return res
    }
  }
}

// converts _next/static/chunks/... to file:///.next/static/chunks/... for parseStack
// todo: where does next dev overlay handle this case and re-use that logic
function preprocessStackTrace(stackTrace: string, distDir?: string): string {
  return stackTrace
    .split('\n')
    .map((line) => {
      const match = line.match(/^(\s*at\s+.*?)\s+\(([^)]+)\)$/)
      if (match) {
        const [, prefix, location] = match

        if (location.startsWith('_next/static/') && distDir) {
          const normalizedDistDir = distDir
            .replace(/\\/g, '/')
            .replace(/\/$/, '')

          const absolutePath =
            normalizedDistDir + '/' + location.slice('_next/'.length)
          const fileUrl = `file://${path.resolve(absolutePath)}`

          return `${prefix} (${fileUrl})`
        }
      }

      return line
    })
    .join('\n')
}

async function getSourceMappedStackFrames(
  stackTrace: string,
  ctx: MappingContext,
  distDir?: string
) {
  try {
    const normalizedStack = preprocessStackTrace(stackTrace, distDir)
    const frames = parseStack(normalizedStack, distDir)

    if (frames.length === 0) {
      return {
        kind: 'stack' as const,
        stack: stackTrace,
      }
    }

    const mappingResults = await mapFramesUsingBundler(frames, ctx)

    const processedFrames = mappingResults
      .map((result, index) => ({
        result,
        originalFrame: frames[index],
      }))
      .map(({ result, originalFrame }) => {
        if (result.status === 'rejected') {
          return {
            kind: 'rejected' as const,
            frameText: formatStackFrame(originalFrame),
            codeFrame: null,
          }
        }

        const { originalStackFrame, originalCodeFrame } = result.value
        if (originalStackFrame?.ignored) {
          return {
            kind: 'ignored' as const,
          }
        }

        return {
          kind: 'success' as const,
          // invariant: if result is not rejected and not ignored, then original stack frame exists
          // verifiable by tracing `getOriginalStackFrame`. The invariant exists because of bad types
          frameText: formatStackFrame(originalStackFrame!),
          codeFrame: originalCodeFrame,
        }
      })

    const allIgnored = processedFrames.every(
      (frame) => frame.kind === 'ignored'
    )

    // we want to handle **all** ignored vs all/some rejected differently
    // if all are ignored we should show no frames
    // if all are rejected, we want to fallback to showing original stack frames
    if (allIgnored) {
      return {
        kind: 'all-ignored' as const,
      }
    }

    const filteredFrames = processedFrames.filter(
      (frame) => frame.kind !== 'ignored'
    )

    if (filteredFrames.length === 0) {
      return {
        kind: 'stack' as const,
        stack: stackTrace,
      }
    }

    const stackOutput = filteredFrames
      .map((frame) => frame.frameText)
      .join('\n')
    const firstFrameCode = filteredFrames.find(
      (frame) => frame.codeFrame
    )?.codeFrame

    if (firstFrameCode) {
      return {
        kind: 'with-frame-code' as const,
        frameCode: firstFrameCode,
        stack: stackOutput,
      }
    }

    return {
      kind: 'stack' as const,
      stack: stackOutput,
    }
  } catch (error) {
    return {
      kind: 'stack' as const,
      stack: stackTrace,
    }
  }
}

function formatStackFrame(frame: StackFrame): string {
  const functionName = frame.methodName || '<anonymous>'
  const location =
    frame.file && frame.lineNumber
      ? `${frame.file}:${frame.lineNumber}${frame.column ? `:${frame.column}` : ''}`
      : frame.file || '<unknown>'

  return `    at ${functionName} (${location})`
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

const colorSourceMappedStackFrames = (
  mapped: Awaited<ReturnType<typeof getSourceMappedStackFrames>>,
  config?: {
    prefix?: string
    applyColor?: boolean
  }
) => {
  const colorFn =
    config?.applyColor === undefined || config.applyColor ? red : <T>(x: T) => x
  // console.log('WHAT IS THIS', {
  //   config,
  //   mapped,
  // })
  switch (mapped.kind) {
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

async function enhanceErrors(
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
      return [
        colorSourceMappedStackFrames(mappedStack, { prefix: entry.prefix }),
      ]
    }
    case 'console': {
      const deserializedArgs = await Promise.all(
        entry.args.map(async (arg) => {
          switch (arg.kind) {
            case 'arg': {
              return deserializeArgData(arg.data)
            }
            case 'formatted-error-arg': {
              const mappedStack = await getSourceMappedStackFrames(
                arg.stack,
                ctx,
                distDir
              )
              return colorSourceMappedStackFrames(mappedStack, {
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
              // hm
              if (arg.isRejectionMessage) {
                // if we want it to look like our server output we would just color the red x, idk todo i kinda like the full red, but maybe should sync other message then?
                return red(arg.data)
              }
              // return red(inspectDeep(arg.data))
              return deserializeArgData(arg.data)
            }
            case 'formatted-error-arg': {
              const mappedStack = await getSourceMappedStackFrames(
                arg.stack,
                ctx,
                distDir
              )
              return colorSourceMappedStackFrames(mappedStack, {
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

      return [...deserializedArgs, colorSourceMappedStackFrames(mappedStack)]
    }
  }
  entry satisfies never
}

export async function receiveEvent(
  entries: LogEntry[],
  ctx: MappingContext,
  distDir: string
): Promise<void> {
  const browserPrefix = cyan('[browser]')

  for (const entry of entries) {
    try {
      switch (entry.kind) {
        case 'console': {
          if (entry.level === 'table') {
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
            continue
          }

          const loggableEntry = await enhanceErrors(entry, ctx, distDir)
          const consoleMethod =
            forwardConsole[entry.level] || forwardConsole.log
          consoleMethod(browserPrefix, ...loggableEntry)
          break
        }
        case 'console-error':
        case 'formatted-error': {
          const consoleErrorArgs = await enhanceErrors(entry, ctx, distDir)
          forwardConsole.error(browserPrefix, ...consoleErrorArgs)
          break
        }
      }
    } catch {
      switch (entry.kind) {
        case 'console-error':
        case 'console': {
          const consoleMethod =
            forwardConsole[entry.level] || forwardConsole.log
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
