import type { AnalysisRecord, ContributingChange, Status } from '../types'

export type DisplayStatus = Status | 'none'

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  alert: 'Review suggested',
  no_alert: 'No alert',
  insufficient_data: 'Insufficient data',
  none: 'No analysis',
}

export const STATUS_ORDER: DisplayStatus[] = ['alert', 'no_alert', 'insufficient_data', 'none']

export const statusOf = (r: AnalysisRecord | null | undefined): DisplayStatus => r?.status ?? 'none'

export const SIGNAL_UNITS: Record<string, string> = {
  steps: 'steps',
  active_minutes: 'min',
  resting_heart_rate: 'bpm',
  hrv_rmssd_ms: 'ms',
  sleep_minutes: 'min',
  sleep_efficiency_pct: '%',
  times_woke_up: 'wake-ups',
  skin_temp_change_c: '°C',
  minutes_watch_worn: 'min worn',
}

export const SIGNAL_LABELS: Record<string, string> = {
  steps: 'Steps',
  active_minutes: 'Active minutes',
  resting_heart_rate: 'Resting heart rate',
  hrv_rmssd_ms: 'HRV (RMSSD)',
  sleep_minutes: 'Sleep',
  sleep_efficiency_pct: 'Sleep efficiency',
  times_woke_up: 'Times woke up',
  skin_temp_change_c: 'Skin temperature change',
  minutes_watch_worn: 'Watch wear time',
}

export function fmtNum(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–'
  return v.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })
}

const valueDigits = (signal: string) => (signal === 'skin_temp_change_c' ? 2 : signal === 'steps' ? 0 : 1)

export function describeChange(c: ContributingChange): string {
  const unit = SIGNAL_UNITS[c.signal] ?? ''
  const d = valueDigits(c.signal)
  const dir = c.direction === 'up' ? 'higher than' : c.direction === 'down' ? 'lower than' : 'close to'
  const pct = c.pct_change_vs_baseline === null ? '' : ` (${c.pct_change_vs_baseline > 0 ? '+' : ''}${fmtNum(c.pct_change_vs_baseline, 1)}%)`
  const win = c.window === 'last_3_days' ? ' 3-day average (today missing)' : ''
  return `${fmtNum(c.value, d)} ${unit}${win}, ${dir} prior baseline ${fmtNum(c.baseline_28d, d)}${pct}`
}

export function summarize(r: AnalysisRecord | null): string {
  if (!r) return 'No analysis record for this date.'
  const cov = r.data_coverage
  if (r.status === 'insufficient_data') {
    return `Not enough watch data to score this day: worn on ${cov.wearable_days_last_7} of the last 7 days, ${cov.baseline_days_available} baseline days available.`
  }
  const lead = r.status === 'alert' ? 'Score at or above the review threshold.' : 'Score below the review threshold.'
  const changes = r.contributing_changes.slice(0, 2).map((c) => `${c.label} ${c.direction === 'up' ? 'up' : c.direction === 'down' ? 'down' : 'flat'}${c.pct_change_vs_baseline === null ? '' : ` ${fmtNum(Math.abs(c.pct_change_vs_baseline), 0)}%`} vs. baseline`)
  return changes.length ? `${lead} Largest contributors: ${changes.join('; ')}.` : `${lead} No measured change raised the score.`
}
