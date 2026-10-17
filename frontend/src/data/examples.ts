/**
 * Independently authored illustrative histories for the public demo. These are NOT challenge
 * records and NOT model output: values come from a seeded random generator, and statuses come
 * from a simple hand-written rule (below) that only looks at earlier days, so replay behaves
 * the same way as with real analysis exports.
 */
import type { AnalysisRecord, ContributingChange, Dataset, Day, Patient } from '../types'
import { addDays } from '../lib/dates'

const END = '2026-10-16'
const N_DAYS = 63
const THRESHOLD = 0.5

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Shift { steps?: number; rhr?: number; sleep?: number; feeling?: number; off?: boolean }
interface Spec {
  id: string; plan: string; cancer: string; device: string; seed: number
  steps: number; rhr: number; sleep: number; feeling: number
  shift: (i: number) => Shift
}

const SPECS: Spec[] = [
  { id: 'EX-101', plan: 'Example: chemotherapy, 3-week cycles', cancer: 'example', device: 'Example wrist tracker', seed: 11,
    steps: 6200, rhr: 66, sleep: 430, feeling: 3.8,
    shift: (i) => (i >= N_DAYS - 5 ? { steps: 0.58, rhr: 7, sleep: -55, feeling: -1.6 } : {}) },
  { id: 'EX-102', plan: 'Example: immunotherapy, every 3 weeks', cancer: 'example', device: 'Example smartwatch', seed: 29,
    steps: 7400, rhr: 61, sleep: 450, feeling: 4.0, shift: () => ({}) },
  { id: 'EX-103', plan: 'Example: radiation, weekdays', cancer: 'example', device: 'Example wrist tracker', seed: 37,
    steps: 5100, rhr: 70, sleep: 410, feeling: 3.5,
    shift: (i) => (i >= N_DAYS - 9 ? { off: true } : {}) },
  { id: 'EX-104', plan: 'Example: chemotherapy, weekly', cancer: 'example', device: 'Example smartwatch', seed: 41,
    steps: 5800, rhr: 68, sleep: 420, feeling: 3.6,
    shift: (i) => (i >= 34 && i <= 39 ? { steps: 0.55, rhr: 6, sleep: -60, feeling: -1.8 } : {}) },
  { id: 'EX-105', plan: 'Example: oral targeted therapy', cancer: 'example', device: 'Example wrist tracker', seed: 53,
    steps: 4300, rhr: 72, sleep: 440, feeling: 3.4, shift: () => ({}) },
]

function gauss(r: () => number) {
  return Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r())
}

function makeDays(s: Spec): Day[] {
  const r = rng(s.seed)
  const start = addDays(END, -(N_DAYS - 1))
  return Array.from({ length: N_DAYS }, (_, i) => {
    const sh = s.shift(i)
    const worn = !sh.off && r() > 0.06
    const steps = Math.round(s.steps * (sh.steps ?? 1) * (1 + 0.12 * gauss(r)))
    const rhr = +(s.rhr + (sh.rhr ?? 0) + 1.4 * gauss(r)).toFixed(1)
    const sleep = Math.round(s.sleep + (sh.sleep ?? 0) + 22 * gauss(r))
    const answered = sh.feeling !== undefined || r() < 0.5
    const feeling = Math.min(5, Math.max(1, Math.round(s.feeling + (sh.feeling ?? 0) + 0.6 * gauss(r))))
    return {
      date: addDays(start, i),
      day_in_program: i + 1,
      steps: worn ? Math.max(steps, 200) : null,
      sleep_minutes: worn ? sleep : null,
      resting_heart_rate: worn ? rhr : null,
      minutes_watch_worn: worn ? Math.round(1250 + 120 * r()) : Math.round(30 * r()),
      daily_feeling_1_to_5: answered ? feeling : null,
    }
  })
}

const RULE: { signal: 'steps' | 'resting_heart_rate' | 'sleep_minutes'; label: string; weight: number }[] = [
  { signal: 'steps', label: 'Steps', weight: -0.8 },
  { signal: 'resting_heart_rate', label: 'Resting heart rate', weight: 0.9 },
  { signal: 'sleep_minutes', label: 'Sleep', weight: -0.6 },
]

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null)

/** Illustrative scoring rule, computed day by day from that day and earlier days only. */
export function illustrativeRecords(days: Day[]): AnalysisRecord[] {
  return days.map((day, i) => {
    const prior = days.slice(Math.max(0, i - 28), i)
    const wornPrior = prior.filter((d) => num(d.steps) !== null)
    const last7 = days.slice(Math.max(0, i - 6), i + 1).filter((d) => num(d.steps) !== null).length
    const missing = RULE.filter((x) => num(day[x.signal]) === null).map((x) => x.signal as string)
    const coverage = {
      watch_worn_minutes_today: num(day.minutes_watch_worn),
      wearable_days_last_7: last7,
      baseline_days_available: wornPrior.length,
      baseline_window_days: 28,
      signals_missing_today: missing,
    }
    const base = { prediction_date: day.date, target_date: addDays(day.date, 1), horizon_days: 1, score_type: 'illustrative_rule_score', threshold: THRESHOLD, data_coverage: coverage }
    if (wornPrior.length < 7 || last7 < 1) return { ...base, status: 'insufficient_data', score: null, contributing_changes: [] }
    let logit = -3.0
    const changes: ContributingChange[] = []
    for (const x of RULE) {
      const hist = wornPrior.map((d) => num(d[x.signal])).filter((v): v is number => v !== null)
      const today = num(day[x.signal])
      const recent = days.slice(Math.max(0, i - 2), i + 1).map((d) => num(d[x.signal])).filter((v): v is number => v !== null)
      const value = today ?? (recent.length ? mean(recent) : null)
      if (value === null || hist.length < 7) continue
      const m = mean(hist)
      const sd = Math.max(Math.sqrt(mean(hist.map((v) => (v - m) ** 2))), m * 0.02)
      const z = (value - m) / sd
      const contribution = x.weight * z
      logit += contribution
      const pct = ((value - m) / m) * 100
      changes.push({ signal: x.signal, label: x.label, direction: Math.abs(pct) < 2 ? 'flat' : pct > 0 ? 'up' : 'down', window: today === null ? 'last_3_days' : 'today',
        value: +value.toFixed(1), baseline_28d: +m.toFixed(1), pct_change_vs_baseline: +pct.toFixed(1), z_vs_baseline: +z.toFixed(2), score_contribution: +contribution.toFixed(3) })
    }
    const score = 1 / (1 + Math.exp(-logit))
    const contributing = changes.filter((c) => (c.score_contribution ?? 0) > 0).sort((a, b) => (b.score_contribution ?? 0) - (a.score_contribution ?? 0)).slice(0, 3)
    return { ...base, status: score >= THRESHOLD ? 'alert' : 'no_alert', score: +score.toFixed(4), contributing_changes: contributing }
  })
}

export function buildExamples(): Dataset {
  const patients: Patient[] = SPECS.map((s) => {
    const days = makeDays(s)
    const daily = illustrativeRecords(days)
    return { patient_id: s.id, treatment_plan: s.plan, cancer_type: s.cancer, device: s.device, enrolled_on: days[0].date, days,
      analysis: { latest: daily[daily.length - 1] ?? null, daily } }
  })
  return {
    id: 'examples',
    name: 'Illustrative examples',
    source: 'illustrative',
    about: 'ILLUSTRATIVE EXAMPLES. Invented histories written for this demo. Not challenge records, not real people, and not output of the trained model.',
    meta: {
      model_version: 'illustrative-rule (not the trained model)',
      score_type: 'illustrative_rule_score',
      threshold: THRESHOLD,
      disclaimer: 'Example data and a hand-written example rule, for showing how the review screens work. Import an analysis export to see model output.',
    },
    patients,
    loadedAt: new Date(0).toISOString(),
  }
}
