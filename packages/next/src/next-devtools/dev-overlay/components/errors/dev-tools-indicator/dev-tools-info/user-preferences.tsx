import { useRef, useState, type HTMLProps } from 'react'
import { css } from '../../../../utils/css'
import EyeIcon from '../../../../icons/eye-icon'
import { STORAGE_KEY_POSITION, STORAGE_KEY_THEME } from '../../../../shared'
import LightIcon from '../../../../icons/light-icon'
import DarkIcon from '../../../../icons/dark-icon'
import SystemIcon from '../../../../icons/system-icon'
import type { DevToolsInfoPropsCore } from './dev-tools-info'
import { DevToolsInfo } from './dev-tools-info'
import {
  getInitialTheme,
  NEXT_DEV_TOOLS_SCALE,
  type DevToolsIndicatorPosition,
  type DevToolsScale,
} from './preferences'

export function UserPreferences({
  setPosition,
  position,
  hide,
  scale,
  setScale,
  ...props
}: {
  setPosition: (position: DevToolsIndicatorPosition) => void
  position: DevToolsIndicatorPosition
  scale: DevToolsScale
  setScale: (value: DevToolsScale) => void
  hide: () => void
} & DevToolsInfoPropsCore &
  Omit<HTMLProps<HTMLDivElement>, 'size'>) {
  // derive initial theme from system preference
  const [theme, setTheme] = useState(getInitialTheme())

  const handleThemeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const portal = document.querySelector('nextjs-portal')
    if (!portal) return

    setTheme(e.target.value)

    if (e.target.value === 'system') {
      portal.classList.remove('dark')
      portal.classList.remove('light')
      localStorage.removeItem(STORAGE_KEY_THEME)
      return
    }

    if (e.target.value === 'dark') {
      portal.classList.add('dark')
      portal.classList.remove('light')
      localStorage.setItem(STORAGE_KEY_THEME, 'dark')
    } else {
      portal.classList.remove('dark')
      portal.classList.add('light')
      localStorage.setItem(STORAGE_KEY_THEME, 'light')
    }
  }

  function handlePositionChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setPosition(e.target.value as DevToolsIndicatorPosition)
    localStorage.setItem(STORAGE_KEY_POSITION, e.target.value)
  }

  function handleSizeChange({ target }: React.ChangeEvent<HTMLSelectElement>) {
    const value = Number(target.value) as DevToolsScale
    setScale(value)
  }

  function handleRestartDevServer(invalidatePersistentCache: boolean) {
    let endpoint = '/__nextjs_restart_dev'

    if (invalidatePersistentCache) {
      endpoint = '/__nextjs_restart_dev?invalidatePersistentCache'
    }

    fetch(endpoint, {
      method: 'POST',
    }).then(() => {
      // TODO: poll server status and reload when the server is back up.
      // https://github.com/vercel/next.js/pull/80005
    })
  }

  return (
    <DevToolsInfo title="Preferences" {...props}>
      <h2 className="dev-tools-info-section-title">General</h2>
      <div className="preferences-container">
        <div className="preference-section">
          <div className="preference-header">
            <label htmlFor="theme">Theme</label>
            <p className="preference-description">
              Select your theme preference.
            </p>
          </div>
          <Select
            id="theme"
            name="theme"
            prefix={<ThemeIcon theme={theme as 'dark' | 'light' | 'system'} />}
            value={theme}
            onChange={handleThemeChange}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </Select>
        </div>

        <div className="preference-section">
          <div className="preference-header">
            <label htmlFor="position">Position</label>
            <p className="preference-description">
              Adjust the placement of your dev tools.
            </p>
          </div>
          <Select
            id="position"
            name="position"
            value={position}
            onChange={handlePositionChange}
          >
            <option value="bottom-left">Bottom Left</option>
            <option value="bottom-right">Bottom Right</option>
            <option value="top-left">Top Left</option>
            <option value="top-right">Top Right</option>
          </Select>
        </div>

        <div className="preference-section">
          <div className="preference-header">
            <label htmlFor="size">Size</label>
            <p className="preference-description">
              Adjust the size of your dev tools.
            </p>
          </div>
          <Select
            id="size"
            name="size"
            value={scale}
            onChange={handleSizeChange}
          >
            {Object.entries(NEXT_DEV_TOOLS_SCALE).map(([key, value]) => {
              return (
                <option value={value} key={key}>
                  {key}
                </option>
              )
            })}
          </Select>
        </div>

        <div className="preference-section">
          <div className="preference-header">
            <label id="hide-dev-tools">Hide Dev Tools for this session</label>
            <p className="preference-description">
              Hide Dev Tools until you restart your dev server, or 1 day.
            </p>
          </div>
          <div className="preference-control">
            <button
              aria-describedby="hide-dev-tools"
              name="hide-dev-tools"
              data-hide-dev-tools
              className="action-button"
              onClick={hide}
            >
              <EyeIcon />
              <span>Hide</span>
            </button>
          </div>
        </div>

        <div className="preference-section">
          <div className="preference-header">
            <label id="hide-dev-tools">Hide Dev Tools shortcut</label>
            <p className="preference-description">
              Set a custom keyboard shortcut to toggle visibility.
            </p>
          </div>
          <div className="preference-control">
            <ShortcutRecorder />
          </div>
        </div>

        <div className="preference-section">
          <div className="preference-header">
            <label>Disable Dev Tools for this project</label>
            <p className="preference-description">
              To disable this UI completely, set{' '}
              <code className="dev-tools-info-code">devIndicators: false</code>{' '}
              in your <code className="dev-tools-info-code">next.config</code>{' '}
              file.
            </p>
          </div>
        </div>
      </div>
      <h2 className="dev-tools-info-section-title">Development Server</h2>
      <div className="preferences-container">
        <div className="preference-section">
          <div className="preference-header">
            <label id="restart-dev-server">Restart Dev Server</label>
            <p className="preference-description">
              Restarts the development server without needing to leave the
              browser.
            </p>
          </div>
          <div className="preference-control">
            <button
              aria-describedby="restart-dev-server"
              title="Restarts the development server without needing to leave the browser."
              name="restart-dev-server"
              data-restart-dev-server
              className="action-button"
              onClick={() =>
                handleRestartDevServer(/*invalidatePersistentCache*/ false)
              }
            >
              <span>Restart</span>
            </button>
          </div>
        </div>
      </div>
      {process.env.__NEXT_BUNDLER_HAS_PERSISTENT_CACHE ? (
        <div className="preferences-container">
          <div className="preference-section">
            <div className="preference-header">
              <label id="reset-bundler-cache">Reset Bundler Cache</label>
              <p className="preference-description">
                Clears the bundler cache and restarts the dev server. Helpful if
                you are seeing stale errors or changes are not appearing.
              </p>
            </div>
            <div className="preference-control">
              <button
                aria-describedby="reset-bundler-cache"
                title="Clears the bundler cache and restarts the dev server. Helpful if you are seeing stale errors or changes are not appearing."
                name="reset-bundler-cache"
                data-reset-bundler-cache
                className="action-button"
                onClick={() =>
                  handleRestartDevServer(/*invalidatePersistentCache*/ true)
                }
              >
                <span>Reset Cache</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </DevToolsInfo>
  )
}

function Select({
  children,
  prefix,
  ...props
}: {
  prefix?: React.ReactNode
} & Omit<React.HTMLProps<HTMLSelectElement>, 'prefix'>) {
  return (
    <div className="select-button">
      {prefix}
      <select {...props}>{children}</select>
      <ChevronDownIcon />
    </div>
  )
}

function ThemeIcon({ theme }: { theme: 'dark' | 'light' | 'system' }) {
  switch (theme) {
    case 'system':
      return <SystemIcon />
    case 'dark':
      return <DarkIcon />
    case 'light':
      return <LightIcon />
    default:
      return null
  }
}

export const DEV_TOOLS_INFO_USER_PREFERENCES_STYLES = css`
  .preferences-container {
    width: 100%;
  }

  @media (min-width: 576px) {
    .preferences-container {
      width: 480px;
    }
  }

  .preference-section:first-child {
    padding-top: 0;
  }

  .preference-section {
    padding: 12px 0;
    border-bottom: 1px solid var(--color-gray-400);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
  }

  .preference-section:last-child {
    border-bottom: none;
  }

  .preference-header {
    margin-bottom: 0;
    flex: 1;
  }

  .preference-header label {
    font-size: var(--size-14);
    font-weight: 500;
    color: var(--color-gray-1000);
    margin: 0;
  }

  .preference-description {
    color: var(--color-gray-900);
    font-size: var(--size-14);
    margin: 0;
  }

  .select-button,
  .action-button {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--color-background-100);
    border: 1px solid var(--color-gray-400);
    border-radius: var(--rounded-lg);
    font-weight: 400;
    font-size: var(--size-14);
    color: var(--color-gray-1000);
    padding: 6px 8px;

    &:hover {
      border-color: var(--color-gray-500);
    }

    svg {
      width: 14px;
      height: 14px;
      overflow: visible;
    }
  }

  .select-button {
    &:focus-within {
      outline: var(--focus-ring);
      outline-offset: -1px;
    }

    select {
      all: unset;
    }

    option {
      color: var(--color-gray-1000);
      background: var(--color-background-100);
    }
  }

  :global(.icon) {
    width: 18px;
    height: 18px;
    color: #666;
  }

  .shortcut-recorder {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    position: relative;

    input {
      width: 125px;
      background: var(--color-background-100);
      border: 1px solid var(--color-gray-400);
      border-radius: var(--rounded-lg);
      font-weight: 400;
      font-size: var(--size-14);
      color: var(--color-gray-1000);
      padding: 6px 8px;

      &:hover {
        border-color: var(--color-gray-500);
      }

      &::placeholder {
        color: var(--color-gray-900);
      }

      &[data-pristine='false']::placeholder {
        color: transparent;
      }

      &:focus-visible {
        outline: var(--focus-ring);
        outline-offset: -1px;
      }
    }

    kbd {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-stack-sans);
      background: var(--color-gray-200);
      min-width: 20px;
      font-weight: 500;
      height: 20px;
      font-size: 14px;
      border-radius: 4px;
      color: var(--color-gray-1000);

      &[data-symbol='false'] {
        padding: 0 4px;
      }
    }

    button {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      cursor: pointer;
      color: var(--color-gray-1000);
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: background 150ms var(--timing-swift);

      &:hover {
        background: var(--color-gray-300);
      }

      svg {
        width: 14px;
        height: 14px;
      }
    }
  }

  .shortcut-recorder-input-container {
    display: grid;

    > * {
      grid-area: 1 / 1;
    }
  }

  .shortcut-recorder-keys {
    pointer-events: none;
    user-select: none;
    margin: 6px;
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .shortcut-recorder-tooltip {
    --gap: 8px;
    --background: var(--color-gray-1000);
    background: var(--background);
    color: var(--color-background-100);
    font-size: var(--size-14);
    font-weight: 500;
    padding: 4px 8px;
    border-radius: 8px;
    position: absolute;
    bottom: calc(100% + var(--gap));
    text-align: center;
    opacity: 0;
    user-select: none;
    text-wrap: pretty;
    transition: opacity 150ms var(--timing-swift);

    &[data-show='true'] {
      opacity: 1;
    }

    &[data-error='true'] {
      --background: var(--color-red-800);
      color: white;
    }

    svg {
      position: absolute;
      transform: translateX(-50%);
      bottom: -6px;
      left: 50%;
    }

    .shortcut-recorder-status {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .shortcut-recorder-status-icon {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--color-red-700);

      &[data-success='true'] {
        background: var(--color-green-700);
      }
    }
  }
`

function ChevronDownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M14.0607 5.49999L13.5303 6.03032L8.7071 10.8535C8.31658 11.2441 7.68341 11.2441 7.29289 10.8535L2.46966 6.03032L1.93933 5.49999L2.99999 4.43933L3.53032 4.96966L7.99999 9.43933L12.4697 4.96966L13 4.43933L14.0607 5.49999Z"
        fill="currentColor"
      />
    </svg>
  )
}

function ShortcutRecorder() {
  const [show, setShow] = useState(false)
  const [keys, setKeys] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<boolean>(false)
  const timeoutRef = useRef<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const modifierKeys = new Set([
    'Meta',
    'Control',
    'Ctrl',
    'Alt',
    'Option',
    'Shift',
  ])

  function validate(keys_: string[]) {
    const modifiers = keys_.filter((key) => modifierKeys.has(key))
    const nonModifiers = keys_.filter((key) => !modifierKeys.has(key))

    let message: string | null = null

    if (keys_.length === 0) {
      message = null
    } else if (modifiers.length > 0 && nonModifiers.length === 0) {
      message = 'Shortcut must include another key'
    } else if (modifiers.length === 0) {
      message = 'Shortcut must start with a modifier key'
    } else {
      message = null
    }

    return message
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Tab') return
    if (e.key === 'Tab' && e.shiftKey) return
    if (timeoutRef.current) clearTimeout(timeoutRef.current)

    function handleValidation(next: string[]) {
      timeoutRef.current = window.setTimeout(() => {
        const invalid = validate(next)
        setError(invalid)
        if (!invalid && next.length > 0) {
          setSuccess(true)
          timeoutRef.current = window.setTimeout(() => {
            setShow(false)
          }, 1000)
        } else {
          setSuccess(false)
        }
      }, 100)
    }

    if (e.key === 'Backspace') {
      setKeys((prev) => {
        if (prev.length === 0) return prev
        const next = prev.slice(0, -1)
        handleValidation(next)
        return next
      })
      e.preventDefault()
      return
    }

    if (keys.length === 3) return

    e.preventDefault()

    setKeys((prev) => {
      if (prev.includes(e.key)) return prev
      const next = [...prev, e.key]
      handleValidation(next)
      return next
    })
  }

  function clear() {
    inputRef.current?.focus()
    setKeys([])
    setError(null)
    setSuccess(false)
  }

  function onBlur() {
    if (error) setKeys([])
    setError(null)
    setSuccess(false)
    setShow(false)
  }

  return (
    <div className="shortcut-recorder">
      <div className="shortcut-recorder-input-container">
        <input
          ref={inputRef}
          type="text"
          placeholder="Record Shortcut"
          data-pristine={keys.length === 0}
          onFocus={() => setShow(true)}
          onBlur={onBlur}
          onKeyDown={handleKeyDown}
          maxLength={3}
        />
        <div className="shortcut-recorder-keys">
          {keys.map((key) => (
            <Kbd key={key}>{key}</Kbd>
          ))}
        </div>
        {keys.length > 0 && (
          <button
            className="shortcut-recorder-clear-button"
            type="button"
            onClick={clear}
            aria-label="Clear shortcut"
          >
            <IconCross />
          </button>
        )}
      </div>
      <div
        className="shortcut-recorder-tooltip"
        data-show={show}
        data-error={Boolean(error)}
      >
        <div className="shortcut-recorder-status">
          {!error && (
            <div
              className="shortcut-recorder-status-icon"
              data-success={success}
            />
          )}
          {error ? error : success ? 'Shortcut set' : 'Recording'}
        </div>
        <BottomArrow />
      </div>
    </div>
  )
}

function BottomArrow() {
  return (
    <svg
      fill="none"
      height="6"
      viewBox="0 0 14 6"
      width="14"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M13.8284 0H0.17157C0.702003 0 1.21071 0.210714 1.58578 0.585787L5.58578 4.58579C6.36683 5.36684 7.63316 5.36683 8.41421 4.58579L12.4142 0.585786C12.7893 0.210714 13.298 0 13.8284 0Z"
        fill="var(--background)"
      />
    </svg>
  )
}

type KbdProps = {
  children: string
}

function Kbd({ children }: KbdProps) {
  // Map event.key to symbol or label
  function renderKey(key: string) {
    switch (key) {
      case 'Meta':
        // Command symbol (⌘)
        return '⌘'
      case 'Alt':
      case 'Option':
        // Option symbol (⌥)
        return '⌥'
      case 'Control':
      case 'Ctrl':
        // Control abbreviation
        return 'Ctrl'
      case 'Shift':
        // Shift symbol (⇧)
        return '⇧'
      case 'Enter':
        // Enter symbol (⏎)
        return '⏎'
      case 'Escape':
      case 'Esc':
        return 'Esc'
      case ' ':
      case 'Space':
      case 'Spacebar':
        return 'Space'
      case 'ArrowUp':
        return '↑'
      case 'ArrowDown':
        return '↓'
      case 'ArrowLeft':
        return '←'
      case 'ArrowRight':
        return '→'
      case 'Tab':
        return 'Tab'
      case 'Backspace':
        return '⌫'
      case 'Delete':
        return '⌦'
      default:
        // Capitalize single letters, otherwise show as-is
        if (children.length === 1) {
          return children.toUpperCase()
        }
        return children
    }
  }
  const key = renderKey(children)
  const isSymbol = key.length === 1
  return <kbd data-symbol={isSymbol}>{key}</kbd>
}

function IconCross() {
  return (
    <svg height="16" strokeLinejoin="round" viewBox="0 0 16 16" width="16">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12.4697 13.5303L13 14.0607L14.0607 13L13.5303 12.4697L9.06065 7.99999L13.5303 3.53032L14.0607 2.99999L13 1.93933L12.4697 2.46966L7.99999 6.93933L3.53032 2.46966L2.99999 1.93933L1.93933 2.99999L2.46966 3.53032L6.93933 7.99999L2.46966 12.4697L1.93933 13L2.99999 14.0607L3.53032 13.5303L7.99999 9.06065L12.4697 13.5303Z"
        fill="currentColor"
      />
    </svg>
  )
}
