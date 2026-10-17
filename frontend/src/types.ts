export type Status = 'alert' | 'no_alert' | 'insufficient_data'

export interface ContributingChange {
  signal: string
  label: string
  direction: 'up' | 'down' | 'flat'
  window: 'today' | 'last_3_days' | string
  value: number | null
  baseline_28d: number | null
  pct_change_vs_baseline: number | null
  z_vs_baseline: number | null
  score_contribution: number | null
}

export interface DataCoverage {
  watch_worn_minutes_today: number | null
  wearable_days_last_7: number
  baseline_days_available: number
  baseline_window_days: number
  signals_missing_today: string[]
}

export interface AnalysisRecord {
  prediction_date: string
  target_date: string
  horizon_days: number
  status: Status
  score: number | null
  score_type: string
  threshold: number
  contributing_changes: ContributingChange[]
  data_coverage: DataCoverage
}

export interface Day {
  date: string
  steps?: number | null
  sleep_minutes?: number | null
  resting_heart_rate?: number | null
  daily_feeling_1_to_5?: number | null
  treatment_today?: number | null
  [key: string]: unknown
}

export interface Patient {
  patient_id: string
  treatment_plan?: string
  cancer_type?: string
  stage?: string
  device?: string
  enrolled_on?: string
  days: Day[]
  analysis: { latest: AnalysisRecord | null; daily: AnalysisRecord[] } | null
  [key: string]: unknown
}

export interface AnalysisMeta {
  contract_version?: string
  model_version?: string
  outcome?: string
  horizon_days?: number
  score_type?: string
  threshold?: number
  threshold_rule?: string
  as_of?: string | null
  disclaimer?: string
  [key: string]: unknown
}

export interface Dataset {
  id: string
  name: string
  source: 'illustrative' | 'imported'
  about: string
  meta: AnalysisMeta | null
  patients: Patient[]
  loadedAt: string
}
