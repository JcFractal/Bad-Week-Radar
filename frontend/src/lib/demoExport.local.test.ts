// Local-only check against the private demo export (never committed). Skipped when the file is absent.
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { parseExport } from './importer'
import { chartDates, recordFor, visibleDays, visibleRecords } from './replay'

const path = process.env.BWR_DEMO_EXPORT ?? `${homedir()}/bwr_outputs/demo_export.json`

describe.skipIf(!existsSync(path))('private demo export', () => {
  const { dataset, warnings } = parseExport(readFileSync(path, 'utf8'), 'demo_export.json')
  it('imports cleanly', () => {
    expect(warnings).toEqual([])
    expect(dataset.patients.length).toBe(5)
  })
  it('every As-of date maps to its own dated record and hides later data', () => {
    for (const p of dataset.patients) {
      for (const d of p.days) {
        const r = recordFor(p, d.date)
        expect(r?.prediction_date).toBe(d.date)
        expect(visibleDays(p, d.date, false).every((x) => x.date <= d.date)).toBe(true)
        expect(visibleRecords(p, d.date, false).every((x) => x.prediction_date <= d.date)).toBe(true)
        expect(chartDates(p, d.date, false, true).at(-1)).toBe(d.date)
      }
    }
  })
})
