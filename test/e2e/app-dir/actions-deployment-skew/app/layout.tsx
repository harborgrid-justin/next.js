import { ReactNode } from 'react'
import ErrorBoundary from './error-boundary'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  )
}
