import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'
import stripAnsi from 'strip-ansi'
import { retry } from 'next-test-utils'

const bundlerName = process.env.IS_TURBOPACK_TEST ? 'Turbopack' : 'Webpack'

describe(`Terminal Logging (${bundlerName})`, () => {
  describe('when enabled', () => {
    let next: NextInstance
    let logs: string[] = []
    let originalStdout: typeof process.stdout.write
    let originalStderr: typeof process.stderr.write

    beforeAll(async () => {
      originalStdout = process.stdout.write
      originalStderr = process.stderr.write

      const capture = (chunk: any) => {
        logs.push(stripAnsi(chunk.toString()))
        return true
      }

      process.stdout.write = function (chunk: any) {
        capture(chunk)
        return originalStdout.call(this, chunk)
      }

      process.stderr.write = function (chunk: any) {
        capture(chunk)
        return originalStderr.call(this, chunk)
      }

      next = await createNext({
        files: {
          pages: new FileRef(join(__dirname, 'fixtures/pages')),
          'next.config.js': `
            module.exports = {
              experimental: {
                browserDebugInfoInTerminal: true
              }
            }
          `,
        },
      })
    })

    afterAll(async () => {
      process.stdout.write = originalStdout
      process.stderr.write = originalStderr
      await next.destroy()
    })

    beforeEach(() => {
      logs = []
    })

    it('should forward console.log to terminal', async () => {
      const browser = await webdriver(next.url, '/basic-logs')
      await browser.waitForElementByCss('#log-button')
      await browser.elementByCss('#log-button').click()

      await retry(() => {
        const logOutput = logs.join('')
        expect(logOutput).toContain('[browser]')
        expect(logOutput).toContain('Hello from browser')
      })

      await browser.close()
    })

    it('should forward console.error to terminal', async () => {
      const browser = await webdriver(next.url, '/basic-logs')

      await browser.waitForElementByCss('#error-button')
      await browser.elementByCss('#error-button').click()

      await retry(() => {
        const logOutput = logs.join('')
        expect(logOutput).toContain('[browser]')
        expect(logOutput).toContain('Error from browser')
      })

      await browser.close()
    })

    it('should handle complex objects', async () => {
      const browser = await webdriver(next.url, '/complex-objects')

      await browser.waitForElementByCss('#object-button')
      await browser.elementByCss('#object-button').click()

      await retry(() => {
        const logOutput = logs.join('')
        expect(logOutput).toContain('[browser]')
        expect(logOutput).toContain('Complex object')
        expect(logOutput).toContain('nested')
      })

      await browser.close()
    })

    it('should handle circular references safely', async () => {
      const browser = await webdriver(next.url, '/circular-refs')

      await browser.waitForElementByCss('#circular-button')
      await browser.elementByCss('#circular-button').click()

      await retry(() => {
        const logOutput = logs.join('')
        expect(logOutput).toContain('[browser]')
        expect(logOutput).toContain('Circular object')
        expect(logOutput).not.toContain('Converting circular structure to JSON')
      })

      await browser.close()
    })

    it('should forward console.warn to terminal', async () => {
      const browser = await webdriver(next.url, '/basic-logs')

      await browser.waitForElementByCss('#warn-button')
      await browser.elementByCss('#warn-button').click()

      await retry(() => {
        const logOutput = logs.join('')
        expect(logOutput).toContain('[browser]')
        expect(logOutput).toContain('Warning message')
      })

      await browser.close()
    })

    it(`should use ${bundlerName.toLowerCase()} implementation for log processing`, async () => {
      const browser = await webdriver(next.url, '/basic-logs')

      await browser.waitForElementByCss('#log-button')
      await browser.elementByCss('#log-button').click()

      await retry(() => {
        const logOutput = logs.join('')
        expect(logOutput).toContain('[browser]')
        expect(logOutput).toContain('Hello from browser')
      })

      await browser.close()
    })

    it('should handle console format strings (React Strict Mode)', async () => {
      const browser = await webdriver(next.url, '/strict-mode')

      await browser.waitForElementByCss('#format-string-button')
      await browser.elementByCss('#format-string-button').click()

      await retry(() => {
        const logOutput = logs.join('\n')
        const terminalLogsFromBrowser = logOutput
          .split('\n')
          .filter((line) => line.includes('[browser]'))

        expect(
          terminalLogsFromBrowser.some((line) => line.includes('Normal log'))
        ).toBe(true)
        expect(
          terminalLogsFromBrowser.some((line) =>
            line.includes('Dimmed log (simulated strict mode)')
          )
        ).toBe(true)
        expect(
          terminalLogsFromBrowser.some((line) =>
            line.includes('Multiple 42 formats')
          )
        ).toBe(true)
        expect(
          terminalLogsFromBrowser.some((line) => line.includes('styled log'))
        ).toBe(true)

        expect(
          terminalLogsFromBrowser.every(
            (line) => !line.includes('[browser] %s')
          )
        ).toBe(true)
        expect(
          terminalLogsFromBrowser.every(
            (line) => !line.includes('[browser] %d')
          )
        ).toBe(true)
        expect(
          terminalLogsFromBrowser.every(
            (line) => !line.includes('[browser] %c')
          )
        ).toBe(true)
      })

      await browser.close()
    })

    it('should handle mixed console arguments correctly', async () => {
      const browser = await webdriver(next.url, '/strict-mode')

      await browser.waitForElementByCss('#mixed-args-button')
      await browser.elementByCss('#mixed-args-button').click()

      await retry(() => {
        const logOutput = logs.join('\n')
        const terminalLogsFromBrowser = logOutput
          .split('\n')
          .filter((line) => line.includes('[browser]'))

        expect(
          terminalLogsFromBrowser.some((line) => line.includes('String format'))
        ).toBe(true)

        expect(
          terminalLogsFromBrowser.some((line) =>
            line.includes('No format string')
          )
        ).toBe(true)
        expect(
          terminalLogsFromBrowser.some((line) =>
            line.includes('but multiple args')
          )
        ).toBe(true)

        expect(
          terminalLogsFromBrowser.some((line) =>
            line.includes('5 items processed')
          )
        ).toBe(true)

        expect(
          terminalLogsFromBrowser.every(
            (line) =>
              !line.includes('[browser] %s') && !line.includes('[browser] %d')
          )
        ).toBe(true)
      })

      await browser.close()
    })

    it('should handle format strings in console.error and console.warn', async () => {
      const browser = await webdriver(next.url, '/strict-mode')

      await browser.waitForElementByCss('#error-format-button')
      await browser.elementByCss('#error-format-button').click()

      await retry(() => {
        const logOutput = logs.join('\n')
        const terminalLogsFromBrowser = logOutput
          .split('\n')
          .filter((line) => line.includes('[browser]'))

        expect(
          terminalLogsFromBrowser.some((line) =>
            line.includes('Error with format string')
          )
        ).toBe(true)
        expect(
          terminalLogsFromBrowser.some((line) =>
            line.includes('Warning with 123')
          )
        ).toBe(true)
        expect(
          terminalLogsFromBrowser.some((line) =>
            line.includes('Normal error without format')
          )
        ).toBe(true)

        expect(
          terminalLogsFromBrowser.every(
            (line) =>
              !line.includes('[browser] %s') && !line.includes('[browser] %d')
          )
        ).toBe(true)
      })

      await browser.close()
    })
  })

  describe('when disabled (default)', () => {
    let next: NextInstance
    let logs: string[] = []
    let originalStdout: typeof process.stdout.write
    let originalStderr: typeof process.stderr.write

    beforeAll(async () => {
      originalStdout = process.stdout.write
      originalStderr = process.stderr.write

      const capture = (chunk: any) => {
        logs.push(stripAnsi(chunk.toString()))
        return true
      }

      process.stdout.write = function (chunk: any) {
        capture(chunk)
        return originalStdout.call(this, chunk)
      }

      process.stderr.write = function (chunk: any) {
        capture(chunk)
        return originalStderr.call(this, chunk)
      }

      next = await createNext({
        files: {
          pages: new FileRef(join(__dirname, 'fixtures/pages')),
        },
      })
    })

    afterAll(async () => {
      process.stdout.write = originalStdout
      process.stderr.write = originalStderr
      await next.destroy()
    })

    beforeEach(() => {
      logs = []
    })

    it(`should not forward logs when disabled (${bundlerName})`, async () => {
      const browser = await webdriver(next.url, '/basic-logs')

      await browser.waitForElementByCss('#log-button')
      await browser.elementByCss('#log-button').click()

      await new Promise((resolve) => setTimeout(resolve, 1000))

      const logOutput = logs.join('')
      expect(logOutput).not.toContain('[browser] Hello from browser')

      await browser.close()
    })
  })

  describe('with serialization depth limit', () => {
    let next: NextInstance
    let logs: string[] = []
    let originalStdout: typeof process.stdout.write
    let originalStderr: typeof process.stderr.write

    beforeAll(async () => {
      originalStdout = process.stdout.write
      originalStderr = process.stderr.write

      const capture = (chunk: any) => {
        logs.push(stripAnsi(chunk.toString()))
        return true
      }

      process.stdout.write = function (chunk: any) {
        capture(chunk)
        return originalStdout.call(this, chunk)
      }

      process.stderr.write = function (chunk: any) {
        capture(chunk)
        return originalStderr.call(this, chunk)
      }

      next = await createNext({
        files: {
          pages: new FileRef(join(__dirname, 'fixtures/pages')),
          'next.config.js': `
            module.exports = {
              experimental: {
                browserDebugInfoInTerminal: {
                  logDepth: 2
                }
              }
            }
          `,
        },
      })
    })

    afterAll(async () => {
      process.stdout.write = originalStdout
      process.stderr.write = originalStderr
      await next.destroy()
    })

    beforeEach(() => {
      logs = []
    })

    it(`should respect serialization depth limit (${bundlerName})`, async () => {
      const browser = await webdriver(next.url, '/deep-objects')

      await browser.waitForElementByCss('#deep-button')
      await browser.elementByCss('#deep-button').click()

      await retry(() => {
        const logOutput = logs.join('')
        expect(logOutput).toContain('[browser]')
        expect(logOutput).toContain('level1')
        expect(logOutput).toContain('level2')
        expect(logOutput).not.toContain('level4')
      })

      await browser.close()
    })
  })

  describe('with showSourceLocation disabled', () => {
    let next: NextInstance
    let logs: string[] = []
    let originalStdout: typeof process.stdout.write
    let originalStderr: typeof process.stderr.write

    beforeAll(async () => {
      originalStdout = process.stdout.write
      originalStderr = process.stderr.write

      const capture = (chunk: any) => {
        logs.push(stripAnsi(chunk.toString()))
        return true
      }

      process.stdout.write = function (chunk: any) {
        capture(chunk)
        return originalStdout.call(this, chunk)
      }
      process.stderr.write = function (chunk: any) {
        capture(chunk)
        return originalStderr.call(this, chunk)
      }

      next = await createNext({
        files: {
          pages: new FileRef(join(__dirname, 'fixtures/pages')),
          'next.config.js': `
            module.exports = {
              experimental: {
                browserDebugInfoInTerminal: {
                  showSourceLocation: false
                }
              }
            }
          `,
        },
      })
    })

    afterAll(async () => {
      process.stdout.write = originalStdout
      process.stderr.write = originalStderr
      await next.destroy()
    })

    beforeEach(() => {
      logs = []
    })

    it(`should omit source location in logs when disabled (${bundlerName})`, async () => {
      const browser = await webdriver(next.url, '/basic-logs')

      await browser.waitForElementByCss('#log-button')
      await browser.elementByCss('#log-button').click()

      await retry(() => {
        const logOutput = logs.join('')
        expect(logOutput).toContain('[browser]')
        expect(logOutput).toContain('Hello from browser')
        expect(logOutput).not.toMatch(/\([^)]+basic-logs\.js[:)]/)
      })

      await browser.close()
    })
  })
})
