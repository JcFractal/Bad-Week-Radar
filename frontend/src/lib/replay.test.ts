import { describe, expect, it } from 'vitest'
import type { AnalysisRecord, Day, Patient } from '../types'
import { chartDates, priorBaseline, recordFor, visibleDays, visibleRecords } from './replay'
import { addDays } from './dates'

const rec = (date: string, status: AnalysisRecord['status'] = 'no_alert'): AnalysisRecord => ({
  prediction_date: date, target_date: addDays(date, 1), horizon_days: 1, status, score: 0.1, score_type: 's', threshold: 0.2,
  contributing_changes: [], data_coverage: { watch_worn_minutes_today: 1300, wearable_days_last_7: 7, baseline_days_available: 20, baseline_window_days: 28, signals_missing_today: [] },
})
const days: Day[] = Array.from({ length: 40 }, (_, i) => ({ date: addDays('2026-01-01', i), steps: i === 20 ? null : 1000 + i, daily_feeling_1_to_5: 3 }))
const daily = days.map((d, i) => rec(d.date, i === 39 ? 'alert' : 'no_alert'))
const patient: Patient = { patient_id: 'T1', days, analysis: { latest: daily[39], daily } }

describe('replay', () => {
  const asOf = '2026-01-15'
  it('uses the record dated on the As-of date, never analysis.latest', () => {
    expect(recordFor(patient, asOf)?.prediction_date).toBe(asOf)
    expect(recordFor(patient, asOf)).not.toBe(patient.analysis!.latest)
  })
  it('returns null (no fallback) when no record exists for the date', () => {
    expect(recordFor(patient, '2025-12-01')).toBeNull()
    const gappy: Patient = { ...patient, analysis: { latest: daily[39], daily: daily.filter((r) => r.prediction_date !== asOf) } }
    expect(recordFor(gappy, asOf)).toBeNull()
  })
  it('hides days and records after the As-of date until revealed', () => {
    expect(visibleDays(patient, asOf, false).every((d) => d.date <= asOf)).toBe(true)
    expect(visibleRecords(patient, asOf, false).every((r) => r.prediction_date <= asOf)).toBe(true)
    expect(visibleDays(patient, asOf, true)).toHaveLength(40)
  })
  it('chart axis never extends past the As-of date unless revealed', () => {
    for (const full of [true, false]) {
      expect(chartDates(patient, asOf, false, full).at(-1)).toBe(asOf)
      expect(chartDates(patient, asOf, true, full).at(-1)! > asOf).toBe(true)
    }
    expect(chartDates(patient, asOf, false, false)[0]).toBe('2026-01-01')
  })
  it('baseline excludes the day itself, skips missing readings and needs 7 readings', () => {
    const b = priorBaseline(days, 'steps')
    expect(b.get('2026-01-07')).toBeNull()
    expect(b.get('2026-01-08')).toBeCloseTo((1000 + 1001 + 1002 + 1003 + 1004 + 1005 + 1006) / 7)
    const d22 = addDays('2026-01-01', 22)
    const prior = days.slice(0, 22).map((d) => d.steps).filter((v): v is number => typeof v === 'number')
    expect(b.get(d22)).toBeCloseTo(prior.reduce((a, c) => a + c, 0) / prior.length)
  })
  it('changing future data cannot change an earlier baseline', () => {
    const changed = days.map((d) => (d.date > asOf ? { ...d, steps: 99999 } : d))
    const a = priorBaseline(days, 'steps'), b = priorBaseline(changed, 'steps')
    for (const d of days.filter((x) => x.date <= asOf)) expect(b.get(d.date)).toBe(a.get(d.date))
    expect(priorBaseline(visibleDays(patient, asOf, false), 'steps').get(asOf)).toBe(a.get(asOf))
  })
})
