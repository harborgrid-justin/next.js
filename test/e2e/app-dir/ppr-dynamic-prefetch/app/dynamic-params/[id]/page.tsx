import { headers } from 'next/headers'
import { Suspense } from 'react'
import { setTimeout } from 'timers/promises'
import { cachedDelay, DebugRenderKind } from '../../shared'

// This page only uses params and headers.
// Parts of it should be prefetchable dynamically

type Params = { id: string }

export default async function Page({ params }: { params: Promise<Params> }) {
  return (
    <main>
      <DebugRenderKind />
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading 1...</div>}>
        <One params={params} />
      </Suspense>
    </main>
  )
}

async function One({ params }: { params: Promise<Params> }) {
  const paramValues = await params
  await cachedDelay(1000, ['/dynamic-params/[id]', paramValues.id])
  return (
    <div style={{ border: '1px solid blue', padding: '1em' }}>
      <div>
        Params: <pre>{JSON.stringify(paramValues, null, 2)}</pre>
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
        headers:{' '}
        <pre>
          {JSON.stringify(Object.fromEntries([...headerStore]), null, 2)}
        </pre>
      </div>
    </div>
  )
}
