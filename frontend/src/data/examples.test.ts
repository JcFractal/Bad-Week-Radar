import { describe, expect, it } from 'vitest'
import { buildExamples, illustrativeRecords } from './examples'

describe('illustrative examples', () => {
  const ds = buildExamples()
  it('cover every status, including an earlier alert for replay', () => {
    const latest = Object.fromEntries(ds.patients.map((p) => [p.patient_id, p.analysis!.latest!.status]))
    expect(latest).toEqual({ 'EX-101': 'alert', 'EX-102': 'no_alert', 'EX-103': 'insufficient_data', 'EX-104': 'no_alert', 'EX-105': 'no_alert' })
    expect(ds.patients[3].analysis!.daily.some((r) => r.status === 'alert')).toBe(true)
  })
  it('are labelled and contain no challenge-style IDs', () => {
    expect(ds.source).toBe('illustrative')
    for (const p of ds.patients) expect(p.patient_id).toMatch(/^EX-/)
  })
  it('records depend only on earlier days', () => {
    const days = ds.patients[0].days
    const full = illustrativeRecords(days)
    const k = 30
    const changed = days.map((d, i) => (i > k ? { ...d, steps: 1, resting_heart_rate: 150 } : d))
    expect(illustrativeRecords(changed).slice(0, k + 1)).toEqual(full.slice(0, k + 1))
  })
})
