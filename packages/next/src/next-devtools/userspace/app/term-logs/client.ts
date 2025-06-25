import { configure } from './safe-stable-serialize'
import type {
  ConsoleEntry,
  ConsoleErrorEntry,
  FormattedErrorEntry,
  LogEntry,
  LogLevel,
} from './shared'
import {
  getOwnerStack,
  setOwnerStackIfAvailable,
} from '../errors/stitched-error'
import { getErrorSource } from '../../../../shared/lib/error-source'
const UNDEFINED_MARKER = '__next_tagged_undefined'
const replacer = (_key: string, value: unknown) => {
  return value === undefined ? UNDEFINED_MARKER : value
}

const stringify = configure({ maximumDepth: Number.MAX_SAFE_INTEGER }) // todo: allow user to config
// ternary since stringify(undefined) wont be handled by the replacer
const logStringify = (data: unknown) =>
  data === undefined ? UNDEFINED_MARKER : stringify(data, replacer)

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

    clearTimeout(logQueue.timer)
    logQueue.socket = socket
    const payload = JSON.stringify({
      event: 'browser-logs',
      entries: logQueue.entries,
      router: logQueue.router,
      sourceType: logQueue.sourceType,
    })

    socket.send(payload)
    logQueue.entries = []
    logQueue.sourceType = undefined
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

const createLogEntry = (level: LogLevel, args: any[]) => {
  const entry: ConsoleEntry = {
    kind: 'console',
    level,
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
  const stack = new Error().stack
  const stackLines = stack?.split('\n')
  // remove the new Error().stack line and our internal createErrorLogEntry call
  const cleanStack = stackLines?.slice(2).join('\n')

  const entry: ConsoleErrorEntry = {
    kind: 'console-error',
    level: 'error',
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
    level: 'error',
  }

  // @ts-expect-error
  window._logstuff = window._logstuff ?? []
  // @ts-expect-error
  window._logstuff.push(entry)

  logQueue.scheduleLogSend(entry)
}

export function logUnhandledRejection(reason: unknown) {
  if (reason instanceof Error) {
    setOwnerStackIfAvailable(reason)
    const ownerStack = getOwnerStack(reason)
    const fullStack = (reason.stack || '') + (ownerStack || '')

    createUnhandledRejectionErrorEntry(reason, fullStack)
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
    level: 'error',
  }

  logQueue.scheduleLogSend(entry)
}

const createUnhandledRejectionNonErrorEntry = (reason: unknown) => {
  const entry: LogEntry = {
    kind: 'console-error',
    // we can't access the stack since the event is dispatched async and creating an inline error would be meaningless
    consoleErrorStack: '',
    level: 'error',
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
const createConsoleMethod = (
  level: LogLevel,
  original: (...args: any[]) => void
) => {
  return (...args: any[]) => {
    // we already have HMR logs on server, so information is redundant
    if (isHMR(args)) {
      original(...args)
      return
    }
    createLogEntry(level, args)
    original(...args)
  }
}




export function forwardUnhandledError(error: Error) {
  setOwnerStackIfAvailable(error)
  const ownerStack = getOwnerStack(error)
  const fullStack = (error.stack || '') + (ownerStack || '')

  createUncaughtErrorEntry(error.name, error.message, fullStack)
}

// todo: this router check is brittle, we need to update based on the current router the user is using
export const patchLogs = (router: 'app' | 'pages'): void => {
  // do we need this?
  if (isPatched) {
    // ah we may need tear down? wait no we don't
    return
  }

  const levels: Array<LogLevel> = ['log', 'info', 'warn', 'debug', 'table']

  levels.forEach((level) => {
    ;(console as any)[level] = createConsoleMethod(
      level,
      (console as any)[level]
    )
  })

  logQueue.router = router
  isPatched = true
}
