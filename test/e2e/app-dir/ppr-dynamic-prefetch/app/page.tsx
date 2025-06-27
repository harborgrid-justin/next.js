import Link from 'next/link'
import { ComponentProps } from 'react'

export default function Page() {
  return (
    <main>
      <h1>Page 1</h1>
      <ul>
        <li>
          <DebugLink href="/cookies" prefetch="unstable_dynamic" />
        </li>
        <li>
          <DebugLink href="/cookies-only" prefetch="unstable_dynamic" />
        </li>
        <li>
          <DebugLink
            href="/search-params?foo=123"
            prefetch="unstable_dynamic"
          />
          {' | '}
          <DebugLink
            href="/search-params?foo=456"
            prefetch="unstable_dynamic"
          />
        </li>
        <li>
          <DebugLink href="/dynamic-params/123" prefetch="unstable_dynamic" />
          {' | '}
          <DebugLink href="/dynamic-params/456" prefetch="unstable_dynamic" />
        </li>
      </ul>
    </main>
  )
}

function DebugLink({ href, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link href={href} {...props}>
      {href as string}
    </Link>
  )
}
