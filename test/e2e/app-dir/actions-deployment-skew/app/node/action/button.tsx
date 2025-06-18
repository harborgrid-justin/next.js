'use client'

import { useTransition } from 'react'

export function Button({ action }: { action: () => Promise<void> }) {
  const [isPending, startTransition] = useTransition()

  return (
    <button
      id="action-button"
      disabled={isPending}
      onClick={() => startTransition(action)}
    >
      Submit
    </button>
  )
}
