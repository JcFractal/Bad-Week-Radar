import { describe, expect, it } from 'vitest'
import { ImportError, parseExport } from './importer'

const record = (date: string, status = 'no_alert', score: unknown = 0.1) => ({
  prediction_date: date, target_date: date, horizon_days: 1, status, score, score_type: 'uncalibrated_logistic_score', threshold: 0.2078,
  contributing_changes: [], data_coverage: { watch_worn_minutes_today: 1200, wearable_days_last_7: 7, baseline_days_available: 20, baseline_window_days: 28, signals_missing_today: [] },
})
const file = (patients: unknown[]) => JSON.stringify({ about: 'x', analysis_meta: { contract_version: '1.0' }, patients })

describe('parseExport', () => {
  it('accepts a contract file and sorts days and records', () => {
    const { dataset, warnings } = parseExport(file([{ patient_id: 'A', days: [{ date: '2024-01-02' }, { date: '2024-01-01' }],
      analysis: { latest: record('2024-01-02'), daily: [record('2024-01-02'), record('2024-01-01', 'insufficient_data', null)] } }]), 'a.json')
    expect(warnings).toEqual([])
    expect(dataset.source).toBe('imported')
    expect(dataset.patients[0].days.map((d) => d.date)).toEqual(['2024-01-01', '2024-01-02'])
    expect(dataset.patients[0].analysis!.daily[0].score).toBeNull()
  })
  it('tolerates bare NaN scores from older exports', () => {
    const text = file([{ patient_id: 'A', days: [], analysis: { latest: null, daily: [record('2024-01-01', 'insufficient_data', 0)] } }]).replace('"score":0', '"score": NaN')
    expect(parseExport(text, 'a.json').dataset.patients[0].analysis!.daily[0].score).toBeNull()
  })
  it('rejects malformed files', () => {
    expect(() => parseExport('{', 'x')).toThrow(ImportError)
    expect(() => parseExport('{"patients": []}', 'x')).toThrow(/patients/)
    expect(() => parseExport(file([{ days: [] }]), 'x')).toThrow(/patient_id/)
    expect(() => parseExport(file([{ patient_id: 'A' }, { patient_id: 'A' }]), 'x')).toThrow(/Duplicate/)
    expect(() => parseExport(file([{ patient_id: 'A', analysis: { daily: [record('2024-01-01', 'watch')] } }]), 'x')).toThrow(/status/)
  })
})
