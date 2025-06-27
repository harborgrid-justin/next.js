import { cookies, headers } from 'next/headers'
import { Suspense } from 'react'
import { setTimeout } from 'timers/promises'
import { cachedDelay, DebugRenderKind } from '../shared'

// This page only uses cookies, so a dynamic prefetch should have all of the content

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
  await cachedDelay(1000, ['/cookies', cookieStore.get('user-agent')?.value])
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
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading 2...</div>}>
        <Two />
      </Suspense>
    </div>
  )
}

async function Two() {
  await setTimeout(3000)
  const headerStore = await headers()
  return (
    <div style={{ border: '1px solid tomato', padding: '1em' }}>
      <div>
        Headers:{' '}
        <pre>
          {JSON.stringify(Object.fromEntries([...headerStore]), null, 2)}
        </pre>
      </div>
    </div>
  )
}
