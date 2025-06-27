export type LogMethod =
  | 'log'
  | 'info'
  | 'debug'
  | 'table'
  | 'error'
  | 'assert'
  | 'dir'
  | 'dirxml'
  | 'group'
  | 'groupCollapsed'
  | 'groupEnd'
  | 'trace'
  | 'warn'

export type ConsoleEntry = {
  kind: 'console'
  method: LogMethod
  consoleMethodStack: string | null
  args: Array<
    | {
        kind: 'arg'
        data: any
      }
    | {
        kind: 'formatted-error-arg'
        prefix: string
        stack: string
      }
  >
}

export type ConsoleErrorEntry = {
  kind: 'any-logged-error'
  method: 'error'
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
        stack: string | null
      }
  >
}

export type FormattedErrorEntry = {
  kind: 'formatted-error'
  prefix: string
  stack: string
  method: 'error'
}

export type LogEntry = ConsoleEntry | ConsoleErrorEntry | FormattedErrorEntry

export const UNDEFINED_MARKER = '__next_tagged_undefined'
