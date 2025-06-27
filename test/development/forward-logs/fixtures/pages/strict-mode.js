export default function StrictModePage() {
  return (
    <div>
      <h1>Strict Mode Format Strings Test (Pages Router)</h1>
      <button
        id="format-string-button"
        onClick={() => {
          console.log('Normal log')
          console.log('%s', 'Dimmed log (simulated strict mode)')
          console.log('%s %d %s', 'Multiple', 42, 'formats')
          console.log('%c styled log', 'color: blue;')
        }}
      >
        Test Format Strings
      </button>
      <button
        id="mixed-args-button"
        onClick={() => {
          console.log('%s', 'String format', 'extra arg')
          console.log('No format string', 'but multiple args')
          console.log('%d items processed', 5)
        }}
      >
        Test Mixed Args
      </button>
      <button
        id="error-format-button"
        onClick={() => {
          console.error('%s', 'Error with format string')
          console.warn('%s %d', 'Warning with', 123)
          console.error('Normal error without format')
        }}
      >
        Test Error Format Strings
      </button>
    </div>
  )
}
