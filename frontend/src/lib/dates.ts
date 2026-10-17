const DAY_MS = 86_400_000

export const toUtc = (d: string) => Date.parse(`${d}T00:00:00Z`)

export function addDays(d: string, n: number): string {
  return new Date(toUtc(d) + n * DAY_MS).toISOString().slice(0, 10)
}

export const daysBetween = (a: string, b: string) => Math.round((toUtc(b) - toUtc(a)) / DAY_MS)

export function fmtDate(d: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) {
  return new Date(toUtc(d)).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' })
}

export const fmtShort = (d: string) => fmtDate(d, { month: 'short', day: 'numeric' })
