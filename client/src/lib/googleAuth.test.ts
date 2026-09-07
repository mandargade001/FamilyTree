import { requestGoogleAccessToken } from './googleAuth'

describe('requestGoogleAccessToken', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id')
  })

  afterEach(() => {
    // `google` is declared optional on Window (see google-identity.d.ts),
    // so this is valid TS without a suppression comment.
    delete window.google
    vi.unstubAllEnvs()
  })

  it('resolves with the access token on success', async () => {
    let capturedCallback: ((response: { access_token?: string; error?: string }) => void) | undefined
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: (config) => {
            capturedCallback = config.callback
            return {
              requestAccessToken: () => {
                capturedCallback?.({ access_token: 'test-token-123' })
              },
            }
          },
        },
      },
    }

    await expect(requestGoogleAccessToken()).resolves.toBe('test-token-123')
  })

  it('rejects when the callback reports an error', async () => {
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: (config) => ({
            requestAccessToken: () => config.callback({ error: 'access_denied' }),
          }),
        },
      },
    }

    await expect(requestGoogleAccessToken()).rejects.toThrow('access_denied')
  })

  it('rejects when Google Identity Services has not loaded', async () => {
    // window.google left undefined (script blocked, ad-blocker, offline, etc.)
    await expect(requestGoogleAccessToken()).rejects.toThrow('Google Identity Services did not load')
  })

  it('rejects with a clear error when VITE_GOOGLE_CLIENT_ID is not configured', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '')
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: () => ({
            requestAccessToken: () => {
              throw new Error('should not be called when client ID is missing')
            },
          }),
        },
      },
    }

    await expect(requestGoogleAccessToken()).rejects.toThrow('Google Photos import is not configured (missing client ID).')
  })
})
