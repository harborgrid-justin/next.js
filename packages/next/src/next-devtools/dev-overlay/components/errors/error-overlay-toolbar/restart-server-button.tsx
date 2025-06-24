import { useState, useEffect } from 'react'
import { RefreshClockWise } from '../../../icons/refresh-clock-wise'
import { useRestartServer } from './use-restart-server'

/**
 * When the Turbopack persistent cache is enabled, and the user reloads on a
 * specific error and that error persists, we show the restart server button as
 * an option. This is because some errors are recoverable by clearing the
 * bundler cache, but we want to provide a shortcut to do this and collect
 * telemetry on how often this is used.
 */
export function RestartServerButton({ error }: { error: Error }) {
  const [showButton, setShowButton] = useState(false)
  const { restartServerAction, isPending } = useRestartServer({
    invalidatePersistentCache: true,
  })

  useEffect(() => {
    const ERROR_KEY = `__next_error_overlay:${window.location.pathname}:${error.message}`

    setShowButton(sessionStorage.getItem(ERROR_KEY) === '1')

    // When the user tries to reload, set the error key to the session storage.
    const handleBeforeUnload = () => {
      sessionStorage.setItem(ERROR_KEY, '1')
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [error.message])

  if (!showButton) {
    return null
  }

  function handleClick() {
    restartServerAction()
  }

  return (
    <button
      className="restart-dev-server-button"
      onClick={handleClick}
      disabled={isPending}
      title="Clears the bundler cache and restarts the dev server. Helpful if you are seeing stale errors or changes are not appearing."
    >
      <RefreshClockWise width={14} height={14} />
      {isPending ? 'Restarting...' : 'Clear Bundler Cache & Restart'}
    </button>
  )
}

export const RESTART_SERVER_BUTTON_STYLES = `
  .restart-dev-server-button {
    -webkit-font-smoothing: antialiased;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 4px;

    height: var(--size-26);
    padding: 6px 8px 6px 6px;
    background: var(--color-amber-100);
    background-clip: padding-box;
    border: 1px solid var(--color-gray-alpha-400);
    box-shadow: var(--shadow-small);
    border-radius: var(--rounded-full);

    color: var(--color-amber-900);
    font-size: var(--size-12);
    font-weight: 500;
    line-height: var(--size-16);
  }

  .restart-dev-server-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`
