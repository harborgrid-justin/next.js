// wtf is the point of this file
// not actually shared fire
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
  consoleMethodStack: string | null // fix name
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
  kind: 'console-error'
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
