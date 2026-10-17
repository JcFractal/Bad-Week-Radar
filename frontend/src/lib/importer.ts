import type { AnalysisRecord, Dataset, Day, Patient } from '../types'

export class ImportError extends Error {}

const STATUSES = new Set(['alert', 'no_alert', 'insufficient_data'])
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isDate = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (first) {
    // Older exports wrote Python's bare NaN for missing scores; treat it as null.
    try {
      return JSON.parse(text.replace(/(?<=[:,[]\s*)-?(NaN|Infinity)(?=\s*[,}\]])/g, 'null'))
    } catch {
      throw new ImportError(`Not valid JSON: ${(first as Error).message}`)
    }
  }
}

function checkRecord(r: unknown, where: string): AnalysisRecord {
  if (!isObj(r)) throw new ImportError(`${where}: analysis record is not an object`)
  if (!isDate(r.prediction_date)) throw new ImportError(`${where}: record without a valid prediction_date`)
  if (!STATUSES.has(r.status as string)) throw new ImportError(`${where} ${r.prediction_date}: unknown status "${String(r.status)}"`)
  const cov = isObj(r.data_coverage) ? r.data_coverage : {}
  return {
    ...(r as unknown as AnalysisRecord),
    score: typeof r.score === 'number' && Number.isFinite(r.score) ? r.score : null,
    contributing_changes: Array.isArray(r.contributing_changes) ? (r.contributing_changes as AnalysisRecord['contributing_changes']) : [],
    data_coverage: {
      watch_worn_minutes_today: typeof cov.watch_worn_minutes_today === 'number' ? cov.watch_worn_minutes_today : null,
      wearable_days_last_7: Number(cov.wearable_days_last_7 ?? 0),
      baseline_days_available: Number(cov.baseline_days_available ?? 0),
      baseline_window_days: Number(cov.baseline_window_days ?? 28),
      signals_missing_today: Array.isArray(cov.signals_missing_today) ? (cov.signals_missing_today as string[]) : [],
    },
  }
}

/** Parse and validate a file following docs/frontend_contract.md. Runs entirely in the browser. */
export function parseExport(text: string, fileName: string, now = new Date()): { dataset: Dataset; warnings: string[] } {
  const raw = parseJson(text)
  if (!isObj(raw)) throw new ImportError('Expected a JSON object with "about" and "patients".')
  if (!Array.isArray(raw.patients) || raw.patients.length === 0) throw new ImportError('No "patients" array found.')
  const warnings: string[] = []
  const meta = isObj(raw.analysis_meta) ? raw.analysis_meta : null
  if (!meta) warnings.push('No analysis_meta: statuses come from per-patient analysis records only.')
  else if (meta.contract_version !== '1.0') warnings.push(`Contract version ${String(meta.contract_version)} (expected 1.0).`)

  const seen = new Set<string>()
  const patients: Patient[] = raw.patients.map((p: unknown, i: number) => {
    if (!isObj(p) || typeof p.patient_id !== 'string') throw new ImportError(`patients[${i}] has no patient_id`)
    if (seen.has(p.patient_id)) throw new ImportError(`Duplicate patient_id ${p.patient_id}`)
    seen.add(p.patient_id)
    const days = (Array.isArray(p.days) ? p.days : []).filter((d: unknown): d is Day => isObj(d) && isDate(d.date))
    days.sort((a, b) => a.date.localeCompare(b.date))
    let analysis: Patient['analysis'] = null
    if (isObj(p.analysis)) {
      const daily = (Array.isArray(p.analysis.daily) ? p.analysis.daily : []).map((r: unknown) => checkRecord(r, p.patient_id as string))
      daily.sort((a, b) => a.prediction_date.localeCompare(b.prediction_date))
      const latest = isObj(p.analysis.latest) ? checkRecord(p.analysis.latest, p.patient_id) : (daily[daily.length - 1] ?? null)
      analysis = { latest, daily }
    }
    if (!days.length) warnings.push(`${p.patient_id}: no daily observations (charts will be empty).`)
    if (!analysis) warnings.push(`${p.patient_id}: no analysis block.`)
    return { ...p, patient_id: p.patient_id, days, analysis } as Patient
  })

  return {
    dataset: {
      id: `import-${now.getTime()}`,
      name: fileName,
      source: 'imported',
      about: typeof raw.about === 'string' ? raw.about : '',
      meta,
      patients,
      loadedAt: now.toISOString(),
    },
    warnings,
  }
}
