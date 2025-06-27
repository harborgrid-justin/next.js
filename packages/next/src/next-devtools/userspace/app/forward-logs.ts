// import { configure } from './safe-stable-serialize'

import { configure } from 'next/dist/compiled/safe-stable-stringify'
import {
  getOwnerStack,
  setOwnerStackIfAvailable,
} from './errors/stitched-error'
import { getErrorSource } from '../../../shared/lib/error-source'
import type {
  ConsoleEntry,
  ConsoleErrorEntry,
  FormattedErrorEntry,
  LogEntry,
  LogMethod,
} from '../../shared/forward-logs-types'

const PROMISE_MARKER = 'Promise {}'
const UNAVAILABLE_MARKER = '[Unable to view]'

function safeClone<T>(value: T, seen = new WeakMap()): any {
  if (value === undefined) return UNDEFINED_MARKER
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value as object)) return seen.get(value as object)
  if (typeof (value as any)?.then === 'function') return PROMISE_MARKER

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

const UNDEFINED_MARKER = '__next_tagged_undefined'
const replacer = (_k: string, v: unknown) => {
  return v === undefined ? UNDEFINED_MARKER : v
}

const stringify = configure({ maximumDepth: Number.MAX_SAFE_INTEGER }) // todo: allow user to config
// ternary since stringify(undefined) wont be handled by the replacer
const logStringify = (data: unknown) => {
  // try {
  // return data === undefined ? UNDEFINED_MARKER : stringify(data, replacer)
  try {
   return stringify(safeClone(data))
  } catch {
    // todo document: what safe stable stringify logs on failure
    return '[unable to serialize, circular reference is too complex to analyze]'
  }
  // } catch {
  //   // i wish safe stable stringify handled this at a granular level, but not much we can do
  //   // this is what will be shown to user
  //   return '[unable to access data]'
  // }
}

let isPatched = false
let restoreFunctions: Array<() => void> = []

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
  const cleanStack = stackLines?.slice(2).join('\n')
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
  // browser shows stack regardless of data in error, so we should do the same
  const stack = stackWithOwners(new Error())
  const stackLines = stack?.split('\n')
  const cleanStack = stackLines?.slice(2).join('\n')

  const entry: ConsoleErrorEntry = {
    kind: 'console-error',
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
    kind: 'console-error',
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
  // todo: handle values for pages/webpack

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
export const patchLogs = (router: 'app' | 'pages'): void => {
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
    'error',
    'assert',
    'dir',
    'dirxml',
    'group',
    'groupCollapsed',
    'groupEnd',
    'trace',
  ]

  restoreFunctions = levels.map((level) => patchConsoleMethod(level))

  logQueue.router = router
  isPatched = true
}

export const unpatchLogs = (): void => {
  if (!isPatched) {
    return
  }

  restoreFunctions.forEach((restore) => restore())
  restoreFunctions = []
  isPatched = false
}
