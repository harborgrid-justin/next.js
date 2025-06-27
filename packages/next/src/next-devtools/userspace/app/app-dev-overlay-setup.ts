import { patchConsoleError } from './errors/intercept-console-error'
import { handleGlobalErrors } from './errors/use-error-handler'
import { patchLogs } from './forward-logs'
console.log('patching')

handleGlobalErrors()
patchConsoleError()
patchLogs('app')
