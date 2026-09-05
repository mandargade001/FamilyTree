const KEY = 'vansh:passphrase'

export function getPassphrase(): string | null {
  return localStorage.getItem(KEY)
}

export function setPassphrase(value: string): void {
  localStorage.setItem(KEY, value)
}

export function clearPassphrase(): void {
  localStorage.removeItem(KEY)
}
