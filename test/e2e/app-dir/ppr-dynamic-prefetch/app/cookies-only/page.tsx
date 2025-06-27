import { cookies } from 'next/headers'
import { Suspense } from 'react'
import { cachedDelay, DebugRenderKind } from '../shared'

// This page only uses cookies and headers.
// Parts of it should be prefetchable dynamically

export default async function Page() {
  return (
    <main>
      <DebugRenderKind />
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading 1...</div>}>
        <One />
      </Suspense>
    </main>
  )
}

async function One() {
  const cookieStore = await cookies()
  await cachedDelay(1000, [
    '/cookies-only',
    cookieStore.get('user-agent')?.value,
  ])
  return (
    <div style={{ border: '1px solid blue', padding: '1em' }}>
      <div>
        Cookies:{' '}
        <pre>
          {JSON.stringify(
            Object.fromEntries(
              [...cookieStore.getAll()].map((cookie) => [
                cookie.name,
                cookie.value,
              ])
            ),
            null,
            2
          )}
        </pre>
      </div>
    </div>
  )
}
