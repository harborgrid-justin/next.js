import { configure } from 'next/dist/compiled/safe-stable-stringify'
import {
  getOwnerStack,
  setOwnerStackIfAvailable,
} from './errors/stitched-error'
import { getErrorSource } from '../../../shared/lib/error-source'
import { getTerminalLoggingConfig } from './terminal-logging-config'
import {
  type ConsoleEntry,
  type ConsoleErrorEntry,
  type FormattedErrorEntry,
  type LogEntry,
  type LogMethod,
  UNDEFINED_MARKER,
} from '../../shared/forward-logs-shared'

export const PROMISE_MARKER = 'Promise {}'
export const UNAVAILABLE_MARKER = '[Unable to view]'
/**
 * allows us to:
 * - revive the undefined log in the server as it would look in the browser
 * - not read/attempt to serialize promises (next will console error if you do that, and will cause this program to infinitely recurse)
 * - if we read a proxy that throws (no way to detect if something is a proxy), explain to the user we can't read this data
 */
export function safeClone<T>(value: T, seen = new WeakMap()): any {
  if (value === undefined) return UNDEFINED_MARKER
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value as object)) return seen.get(value as object)

  try {
    if (typeof (value as any)?.then === 'function') return PROMISE_MARKER
  } catch {
    /* not an important case */
  }

  if (Array.isArray(value)) {
    const out: any[] = []
    seen.set(value, out)
    for (const item of value) {
      try {
        out.push(safeClone(item, seen))
      } catch {
        out.push(UNAVAILABLE_MARKER)
      }
    }
    return out
  }

  const proto = Object.getPrototypeOf(value)
  if (proto === Object.prototype || proto === null) {
    const out: Record<string, unknown> = {}
    seen.set(value as object, out)
    for (const key of Object.keys(value as object)) {
      try {
        out[key] = safeClone((value as any)[key], seen)
      } catch {
        out[key] = UNAVAILABLE_MARKER
      }
    }
    return out
  }

  return Object.prototype.toString.call(value)
}

const terminalLoggingConfig = getTerminalLoggingConfig()

const stringify = configure({
  maximumDepth:
    typeof terminalLoggingConfig === 'object' && terminalLoggingConfig.logDepth
      ? terminalLoggingConfig.logDepth
      : Number.MAX_SAFE_INTEGER,
})
export const logStringify = (data: unknown): string => {
  try {
    const result = stringify(safeClone(data))
    return result ?? '[unable to serialize]'
  } catch {
    // todo document: what safe stable stringify logs on failure
    return '[unable to serialize, circular reference is too complex to analyze]'
  }
}

let isPatched = false

export const logQueue: {
  entries: Array<LogEntry>
  onSocketReady: (socket: WebSocket) => void
  flushScheduled: boolean
  socket: WebSocket | null
  timer: ReturnType<typeof setTimeout> | undefined
  sourceType?: 'server' | 'edge-server'
  router: 'app' | 'pages' | null
  scheduleLogSend: (entry: LogEntry) => void
} = {
  entries: [],
  flushScheduled: false,
  timer: undefined,
  socket: null,
  sourceType: undefined,
  router: null,
  scheduleLogSend: (entry: LogEntry) => {
    logQueue.entries.push(entry)
    if (logQueue.flushScheduled) {
      return
    }
    // safe to deref and use in setTimeout closure since we cancel on new socket
    const socket = logQueue.socket
    if (!socket) {
      return
    }

    logQueue.flushScheduled = true

    // non blocking log flush, setTimeout runs at most once per frame
    logQueue.timer = setTimeout(() => {
      logQueue.flushScheduled = false

      // just incase
      try {
        const payload = JSON.stringify({
          event: 'browser-logs',
          entries: logQueue.entries,
          router: logQueue.router,
          // needed for source mapping, we just assign the sourceType from the last error for the whole batch
          sourceType: logQueue.sourceType,
        })

        socket.send(payload)
        logQueue.entries = []

        // Reset after a successful flush so each batch reflects only the
        logQueue.sourceType = undefined
      } catch {
        /* noop */
      }
    })
  },
  onSocketReady: (socket: WebSocket) => {
    if (socket.readyState !== WebSocket.OPEN) {
      // invariant
      return
    }

    // incase an existing timeout was going to run with a stale socket
    clearTimeout(logQueue.timer)
    logQueue.socket = socket
    try {
      const payload = JSON.stringify({
        event: 'browser-logs',
        entries: logQueue.entries,
        router: logQueue.router,
        sourceType: logQueue.sourceType,
      })

      socket.send(payload)
      logQueue.entries = []
      logQueue.sourceType = undefined
    } catch {
      /** noop just incase */
    }
  },
}

const createErrorArg = (error: Error) => {
  setOwnerStackIfAvailable(error)
  const ownerStack = getOwnerStack(error)
  const fullStack = (error.stack || '') + (ownerStack || '')
  // then this error will be displayed pretty, but white in the terminal (same as browser behavior)
  return {
    kind: 'formatted-error-arg' as const,
    prefix: error.message ? `${error.name}: ${error.message}` : `${error.name}`,
    stack: fullStack,
  }
}

const createLogEntry = (level: LogMethod, args: any[]) => {
  // do not abstract this, it implicitly relies on which functions call it. forcing the inlined implementation makes you think about callers
  const stack = stackWithOwners(new Error())
  const stackLines = stack?.split('\n')
  const cleanStack = stackLines?.slice(3).join('\n')
  const entry: ConsoleEntry = {
    kind: 'console',
    consoleMethodStack: cleanStack ?? null, // depending on browser we might not have stack
    method: level,
    args: args.map((arg) => {
      if (arg instanceof Error) {
        return createErrorArg(arg)
      }
      return {
        kind: 'arg',
        data: logStringify(arg),
      }
    }),
  }

  logQueue.scheduleLogSend(entry)
}

export const forwardErrorLog = (args: any[]) => {
  const errorObjects = args.filter((arg) => arg instanceof Error)
  const first = errorObjects.at(0)
  if (first) {
    const source = getErrorSource(first)
    if (source) {
      logQueue.sourceType = source
    }
  }
  /**
   * browser shows stack regardless of type of data passed to console.error, so we should do the same
   *
   * do not abstract this, it implicitly relies on which functions call it. forcing the inlined implementation makes you think about callers
   */
  const stack = stackWithOwners(new Error())
  const stackLines = stack?.split('\n')
  const cleanStack = stackLines?.slice(3).join('\n')

  const entry: ConsoleErrorEntry = {
    kind: 'any-logged-error',
    method: 'error',
    consoleErrorStack: cleanStack ?? '',
    args: args.map((arg) => {
      if (arg instanceof Error) {
        return createErrorArg(arg)
      }
      return {
        kind: 'arg',
        data: arg,
      }
    }),
  }

  logQueue.scheduleLogSend(entry)
}

const createUncaughtErrorEntry = (
  errorName: string,
  errorMessage: string,
  fullStack: string
) => {
  const entry: FormattedErrorEntry = {
    kind: 'formatted-error',
    prefix: `Uncaught ${errorName}: ${errorMessage}`,
    stack: fullStack,
    method: 'error',
  }

  logQueue.scheduleLogSend(entry)
}

const stackWithOwners = (error: Error) => {
  setOwnerStackIfAvailable(error)
  const ownerStack = getOwnerStack(error)
  const stack = (error.stack || '') + (ownerStack || '')
  return stack
}

export function logUnhandledRejection(reason: unknown) {
  if (reason instanceof Error) {
    createUnhandledRejectionErrorEntry(reason, stackWithOwners(reason))
    return
  }
  createUnhandledRejectionNonErrorEntry(reason)
}

const createUnhandledRejectionErrorEntry = (
  error: Error,
  fullStack: string
) => {
  const source = getErrorSource(error)
  if (source) {
    logQueue.sourceType = source
  }

  const entry: LogEntry = {
    kind: 'formatted-error',
    prefix: `⨯ unhandledRejection: ${error.name}: ${error.message}`,
    stack: fullStack,
    method: 'error',
  }

  logQueue.scheduleLogSend(entry)
}

const createUnhandledRejectionNonErrorEntry = (reason: unknown) => {
  const entry: LogEntry = {
    kind: 'any-logged-error',
    // we can't access the stack since the event is dispatched async and creating an inline error would be meaningless
    consoleErrorStack: '',
    method: 'error',
    args: [
      {
        kind: 'arg',
        data: `⨯ unhandledRejection:`,
        isRejectionMessage: true,
      },
      {
        kind: 'arg',
        data: logStringify(reason),
      },
    ],
  }

  logQueue.scheduleLogSend(entry)
}

const isHMR = (args: any[]) => {
  const firstArg = args[0]
  if (typeof firstArg !== 'string') {
    return false
  }
  if (firstArg.startsWith('[Fast Refresh]')) {
    return true
  }

  if (firstArg.startsWith('[HMR]')) {
    return true
  }
  // todo: handle all values for pages/webpack, maybe source of truth?

  return false
}

// Based on https://github.com/facebook/react/blob/28dc0776be2e1370fe217549d32aee2519f0cf05/packages/react-server/src/ReactFlightServer.js#L248
function patchConsoleMethod(methodName: LogMethod): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(console, methodName)
  if (
    descriptor &&
    (descriptor.configurable || descriptor.writable) &&
    typeof descriptor.value === 'function'
  ) {
    const originalMethod = descriptor.value
    const originalName = Object.getOwnPropertyDescriptor(originalMethod, 'name')
    const wrapperMethod = function (
      this: typeof console,
      ...args: Parameters<(typeof console)[LogMethod]>
    ) {
      try {
        // we already have HMR logs on server, so information is redundant
        if (isHMR(args)) {
          originalMethod.apply(this, args)
          return
        }
        createLogEntry(methodName, args)
        originalMethod.apply(this, args)
      } catch {
        originalMethod.apply(this, args)
      }
    }
    if (originalName) {
      Object.defineProperty(wrapperMethod, 'name', originalName)
    }
    Object.defineProperty(console, methodName, {
      value: wrapperMethod,
    })

    return () => {
      Object.defineProperty(console, methodName, {
        value: originalMethod,
        writable: descriptor.writable,
        configurable: descriptor.configurable,
      })
    }
  }

  return () => {}
}

export function forwardUnhandledError(error: Error) {
  createUncaughtErrorEntry(error.name, error.message, stackWithOwners(error))
}

// todo: this router check is brittle, we need to update based on the current router the user is using
export const initializeDebugLogForwarding = (router: 'app' | 'pages'): void => {
  // probably don't need this
  if (isPatched) {
    return
  }

  const levels: Array<LogMethod> = [
    'log',
    'info',
    'warn',
    'debug',
    'table',
    'assert',
    'dir',
    'dirxml',
    'group',
    'groupCollapsed',
    'groupEnd',
    'trace',
  ]

  levels.forEach((level) => patchConsoleMethod(level))
  logQueue.router = router
  isPatched = true
}
