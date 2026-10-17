import type { AnalysisRecord, Day, Patient } from '../types'
import { addDays, daysBetween } from './dates'

/** Days the reviewer may see for As-of date `asOf`. Later days only after an explicit reveal. */
export function visibleDays(p: Patient, asOf: string, revealed: boolean): Day[] {
  return p.days.filter((d) => d.date <= asOf || revealed)
}

export function visibleRecords(p: Patient, asOf: string, revealed: boolean): AnalysisRecord[] {
  return (p.analysis?.daily ?? []).filter((r) => r.prediction_date <= asOf || revealed)
}

/** The record computed at the end of `asOf`. Never falls back to `analysis.latest` or a later record. */
export function recordFor(p: Patient, asOf: string): AnalysisRecord | null {
  return p.analysis?.daily.find((r) => r.prediction_date === asOf) ?? null
}

export const BASELINE_WINDOW = 28
export const BASELINE_MIN_OBS = 7

/**
 * Personal baseline for each day: mean of the signal over the previous 28 calendar days,
 * excluding the day itself. Missing readings are skipped (never treated as zero); fewer than
 * 7 readings gives no baseline. Each value depends only on earlier days in `days`.
 */
export function priorBaseline(days: Day[], signal: keyof Day): Map<string, number | null> {
  const out = new Map<string, number | null>()
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date))
  for (let i = 0; i < sorted.length; i++) {
    const date = sorted[i].date
    const start = addDays(date, -BASELINE_WINDOW)
    const vals: number[] = []
    for (let j = i - 1; j >= 0 && sorted[j].date >= start; j--) {
      const v = sorted[j][signal]
      if (typeof v === 'number' && Number.isFinite(v)) vals.push(v)
    }
    out.set(date, vals.length >= BASELINE_MIN_OBS ? vals.reduce((a, b) => a + b, 0) / vals.length : null)
  }
  return out
}

/** Calendar dates shown on the chart axis. The range never extends past `asOf` unless revealed. */
export function chartDates(p: Patient, asOf: string, revealed: boolean, fullHistory: boolean, lookback = 42, revealDays = 14): string[] {
  if (!p.days.length) return []
  const first = p.days[0].date
  const last = p.days[p.days.length - 1].date
  const start = fullHistory ? first : [first, addDays(asOf, -(lookback - 1))].sort().reverse()[0]
  const end = revealed ? (fullHistory ? last : [last, addDays(asOf, revealDays)].sort()[0]) : asOf
  const n = daysBetween(start, end)
  return Array.from({ length: Math.max(n + 1, 0) }, (_, i) => addDays(start, i))
}
