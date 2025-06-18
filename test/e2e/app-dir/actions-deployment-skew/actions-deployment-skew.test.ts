/* eslint-disable jest/no-standalone-expect */
import { nextTestSetup } from 'e2e-utils'

const unknownActionId = 'abcdef1234567890'

describe('actions-deployment-skew', () => {
  const { next, isNextDeploy, isNextDev, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  let cliOutputLength = 0

  beforeEach(() => {
    cliOutputLength = next.cliOutput.length
  })

  describe.each(['node', 'edge'])('in the %s runtime', (runtime) => {
    describe.each([
      {
        name: 'with a normal action',
        page: 'action',
        disableJavaScript: false,
      },
      {
        name: 'with a form action and JavaScript enabled',
        page: 'form-action',
        disableJavaScript: false,
      },
      {
        name: 'with a form action and JavaScript disabled',
        page: 'form-action',
        disableJavaScript: true,
      },
    ])('$name', ({ page, disableJavaScript }) => {
      // TODO: In the Edge runtime with Turbopack in dev mode, there's a "use client" error
      // in next/dist/esm/next-devtools/userspace/use-app-dev-rendering-indicator.js.
      ;(runtime === 'edge' && isNextDev && isTurbopack ? it.skip : it)(
        'should respond with a 404 for an unknown server action',
        async () => {
          const pathname = `/${runtime}/${page}`
          const browser = await next.browser(pathname, {
            disableJavaScript,
            beforePageLoad(page) {
              page.route(
                (url) => url.pathname === pathname,
                async (route, request) => {
                  if (request.method() === 'POST') {
                    const headers = request.headers()
                    let postData = request.postData()

                    if (headers['next-action']) {
                      headers['next-action'] = unknownActionId
                    }

                    if (
                      headers['content-type']?.startsWith('multipart/form-data')
                    ) {
                      // Currently not used because the form uses useActionState,
                      // which makes React encode the action ID differently.
                      postData = postData.replace(
                        /\$ACTION_ID_[0-9A-Fa-f]+/,
                        `$ACTION_ID_${unknownActionId}`
                      )
                      // Instead, this is required to be patched:
                      postData = postData.replace(
                        /"id":"[0-9A-Fa-f]+"/g,
                        `"id":"${unknownActionId}"`
                      )
                    }

                    return route.continue({ headers, postData })
                  }

                  return route.continue()
                }
              )

              page.on('response', async (response) => {
                const request = response.request()

                if (
                  request.url().endsWith(pathname) &&
                  request.method() === 'POST'
                ) {
                  expect(response.status()).toBe(404)
                }
              })
            },
          })

          const button = await browser.elementById('action-button')
          await button.click()

          if (disableJavaScript) {
            expect(await browser.elementByCss('h2').text()).toBe(
              'This page could not be found.'
            )
          } else {
            expect(await browser.elementById('error-message').text()).toBe(
              'An unexpected response was received from the server.'
            )
          }

          if (!isNextDeploy) {
            expect(next.cliOutput.slice(cliOutputLength)).toInclude(
              `Error: Failed to find Server Action "${unknownActionId}". This request might be from an older or newer deployment.`
            )
          }
        }
      )
    })
  })
})
