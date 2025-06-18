'use client'

import { useActionState } from 'react'

export function Form({ action }: { action: () => Promise<string> }) {
  const [result, formAction, isPending] = useActionState(action, 'initial')

  return (
    <form action={formAction}>
      <p id="result">{result}</p>
      <button id="action-button" disabled={isPending}>
        Submit Form
      </button>
    </form>
  )
}
