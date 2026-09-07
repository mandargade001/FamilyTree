const SCOPE = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly'

export function requestGoogleAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!window.google) {
      reject(new Error('Google Identity Services did not load'))
      return
    }

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId) {
      reject(new Error('Google Photos import is not configured (missing client ID).'))
      return
    }
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error ?? 'no access token returned'))
          return
        }
        resolve(response.access_token)
      },
    })
    client.requestAccessToken()
  })
}
