import { headers } from 'next/headers'
import { Suspense } from 'react'
import { setTimeout } from 'timers/promises'
import { cachedDelay, DebugRenderKind } from '../shared'

// This page only uses searchParams and headers.
// Parts of it should be prefetchable dynamically

type AnySearchParams = { [key: string]: string | string[] | undefined }

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<AnySearchParams>
}) {
  return (
    <main>
      <DebugRenderKind />
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading 1...</div>}>
        <One searchParams={searchParams} />
      </Suspense>
    </main>
  )
}

async function One({
  searchParams,
}: {
  searchParams: Promise<AnySearchParams>
}) {
  const paramValues = await searchParams
  await cachedDelay(1000, ['/search-params', paramValues])
  return (
    <div style={{ border: '1px solid blue', padding: '1em' }}>
      <div>
        Search params: <pre>{JSON.stringify(paramValues, null, 2)}</pre>
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
