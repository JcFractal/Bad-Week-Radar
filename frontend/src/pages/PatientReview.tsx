import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { reviewKey, useSession } from '../state'
import type { Patient } from '../types'
import { chartDates, priorBaseline, recordFor, visibleDays, visibleRecords } from '../lib/replay'
import { describeChange, fmtNum, SIGNAL_LABELS, statusOf, summarize } from '../lib/status'
import { fmtDate } from '../lib/dates'
import { StatusBadge } from '../components/StatusBadge'
import { DatasetBanner } from '../components/DatasetBanner'
import { FeelingTrack, LineTrack, StatusTrack, type LineSeries } from '../components/Charts'

const SIGNALS = [
  { key: 'steps', title: 'Steps per day', unit: 'steps', digits: 0 },
  { key: 'sleep_minutes', title: 'Sleep', unit: 'minutes', digits: 0 },
  { key: 'resting_heart_rate', title: 'Resting heart rate', unit: 'bpm', digits: 1 },
] as const

export function PatientReview() {
  const { id = '' } = useParams()
  const { active } = useSession()
  const patient = active.patients.find((p) => p.patient_id === id)
  if (!patient) {
    return (
      <div className="page">
        <Link to="/" className="back">← Roster</Link>
        <h1>Patient not found</h1>
        <p className="sub">No patient "{id}" in the current data ({active.name}).</p>
      </div>
    )
  }
  return <Review key={`${active.id}:${patient.patient_id}`} patient={patient} datasetId={active.id} />
}

function Review({ patient, datasetId }: { patient: Patient; datasetId: string }) {
  const { notes, setNote, reviews, toggleReview } = useSession()
  const dates = patient.days.map((d) => d.date)
  const last = dates[dates.length - 1] ?? patient.analysis?.latest?.prediction_date ?? ''
  const [asOf, setAsOfRaw] = useState(last)
  const [revealed, setRevealed] = useState(false)
  const [fullHistory, setFullHistory] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const key = reviewKey(datasetId, patient.patient_id)

  // Changing the As-of date always hides following days again: revealing is a separate action.
  const setAsOf = (d: string) => { setAsOfRaw(d); setRevealed(false) }
  const idx = dates.indexOf(asOf)
  const hasFollowing = dates.some((d) => d > asOf)

  const current = recordFor(patient, asOf)
  const shownDays = visibleDays(patient, asOf, revealed)
  const records = visibleRecords(patient, asOf, revealed)
  const axis = chartDates(patient, asOf, revealed, fullHistory)

  const tracks = useMemo(() => {
    const byDate = new Map(shownDays.map((d) => [d.date, d]))
    return SIGNALS.map((s): LineSeries => {
      const base = priorBaseline(shownDays, s.key)
      return {
        title: s.title, unit: s.unit, digits: s.digits,
        values: axis.map((d) => { const v = byDate.get(d)?.[s.key]; return typeof v === 'number' && Number.isFinite(v) ? v : null }),
        baseline: axis.map((d) => base.get(d) ?? null),
      }
    })
  }, [shownDays, axis])
  const feeling = axis.map((d) => { const v = shownDays.find((x) => x.date === d)?.daily_feeling_1_to_5; return typeof v === 'number' ? v : null })
  const recordMap = useMemo(() => new Map(records.map((r) => [r.prediction_date, r])), [records])
  const prevAlert = [...records].reverse().find((r) => r.prediction_date < asOf && r.status === 'alert')

  const targetDay = current ? patient.days.find((d) => d.date === current.target_date) : undefined
  const done = reviews[key]
  const facts: [string, unknown][] = [['Treatment plan', patient.treatment_plan], ['Cancer type', patient.cancer_type], ['Stage', patient.stage], ['Device', patient.device], ['Enrolled', patient.enrolled_on ? fmtDate(patient.enrolled_on) : undefined]]

  return (
    <div className="page">
      <DatasetBanner />
      <Link to="/" className="back">← Roster</Link>
      <div className="page-head">
        <div>
          <div className="eyebrow">Patient review</div>
          <h1 className="pid">{patient.patient_id} <StatusBadge status={statusOf(current)} /></h1>
          <p className="sub">As of <b>{asOf ? fmtDate(asOf) : '–'}</b>: {summarize(current)}</p>
          <p className="facts">{facts.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => <span key={k}><span className="muted">{k}</span> {String(v)}</span>)}</p>
        </div>
        <div className="review-box">
          <button className={`btn ${done ? 'btn-ghost' : 'btn-primary'}`} onClick={() => toggleReview(key)}>{done ? 'Undo review complete' : 'Mark review complete'}</button>
          {done && <div className="muted small">Review completed {new Date(done).toLocaleTimeString()} (this session only)</div>}
        </div>
      </div>

      <section className="card asof">
        <div className="asof-row">
          <label className="asof-label" htmlFor="asof-range">As of</label>
          <input id="asof-date" type="date" value={asOf} min={dates[0]} max={last} aria-label="As-of date"
            onChange={(e) => { if (dates.includes(e.target.value)) setAsOf(e.target.value) }} />
          <input id="asof-range" className="asof-range" type="range" min={0} max={Math.max(dates.length - 1, 0)} value={Math.max(idx, 0)}
            onChange={(e) => setAsOf(dates[Number(e.target.value)])} aria-label="As-of day slider" />
          <div className="btn-group">
            <button className="btn btn-ghost" disabled={idx <= 0} onClick={() => setAsOf(dates[idx - 1])} aria-label="Previous day">‹ Day</button>
            <button className="btn btn-ghost" disabled={idx >= dates.length - 1} onClick={() => setAsOf(dates[idx + 1])} aria-label="Next day">Day ›</button>
            <button className="btn btn-ghost" disabled={!prevAlert} onClick={() => prevAlert && setAsOf(prevAlert.prediction_date)}>Previous "Review suggested"</button>
            <button className="btn btn-ghost" disabled={asOf === last} onClick={() => setAsOf(last)}>Latest</button>
          </div>
        </div>
        <div className="asof-row">
          <span className="muted small">
            Day {idx + 1} of {dates.length}. Charts, baselines, explanation and summary use only data up to the end of this day.
            {revealed ? ' Following days are revealed and shaded as after the prediction.' : hasFollowing ? ' Following days are hidden.' : ''}
          </span>
          <span className="spacer" />
          <label className="check"><input type="checkbox" checked={fullHistory} onChange={(e) => setFullHistory(e.target.checked)} /> Full history</label>
          <button className={`btn ${revealed ? 'btn-ghost' : 'btn-outline'}`} disabled={!hasFollowing} onClick={() => setRevealed((r) => !r)}>
            {revealed ? 'Hide following days' : 'Reveal following days'}
          </button>
        </div>
      </section>

      <div className="grid">
        <section className="card charts">
          <h2>Wearable trends through {revealed ? 'the revealed days' : 'the As-of day'}</h2>
          {tracks.map((s, i) => <LineTrack key={i} series={s} dates={axis} asOf={asOf} hover={hover} setHover={setHover} />)}
          <StatusTrack records={recordMap} dates={axis} asOf={asOf} hover={hover} setHover={setHover} />
          <FeelingTrack values={feeling} dates={axis} asOf={asOf} hover={hover} setHover={setHover} axis />
          <p className="muted small">Baseline is the mean of the previous 28 days (the day itself excluded, at least 7 readings). Days without a watch reading are gaps, not zero.</p>
        </section>

        <aside className="side">
          <section className="card">
            <h2>Explanation as of {asOf ? fmtDate(asOf) : '–'}</h2>
            {!current && <p>No analysis record for this date. Nothing from other dates is shown in its place.</p>}
            {current && (
              <>
                <div className="kv"><span>Status</span><StatusBadge status={current.status} /></div>
                <div className="kv"><span>Predicts</span><b>{fmtDate(current.target_date)}</b> <span className="muted">(next day)</span></div>
                <div className="kv"><span>Score</span><b>{current.score === null ? '–' : fmtNum(current.score, 3)}</b> <span className="muted">threshold {fmtNum(current.threshold, 3)}</span></div>
                <p className="muted small">{current.score_type === 'illustrative_rule_score' ? 'Example rule score.' : 'Uncalibrated ranking score.'} It is not a probability or a percentage risk.</p>
                <h3>Contributing changes</h3>
                {current.contributing_changes.length === 0 && <p className="muted">{current.status === 'insufficient_data' ? 'Not scored: not enough watch data.' : 'No measured change raised the score.'}</p>}
                <ul className="changes">
                  {current.contributing_changes.map((c) => (
                    <li key={c.signal}>
                      <div className="change-head"><b>{c.label}</b><span className={`dir dir-${c.direction}`}>{c.direction === 'up' ? '▲ up' : c.direction === 'down' ? '▼ down' : '■ flat'}</span></div>
                      <div className="small">{describeChange(c)}</div>
                      <div className="muted small">Score contribution +{fmtNum(c.score_contribution, 2)}{c.z_vs_baseline !== null ? ` · z ${fmtNum(c.z_vs_baseline, 2)}` : ''}</div>
                    </li>
                  ))}
                </ul>
                <h3>Data coverage</h3>
                <div className="kv"><span>Watch worn today</span><b>{fmtNum(current.data_coverage.watch_worn_minutes_today)} min</b></div>
                <div className="kv"><span>Wearable days, last 7</span><b>{current.data_coverage.wearable_days_last_7}</b></div>
                <div className="kv"><span>Baseline days</span><b>{current.data_coverage.baseline_days_available} of {current.data_coverage.baseline_window_days}</b></div>
                <div className="kv"><span>Missing today</span><span>{current.data_coverage.signals_missing_today.length ? current.data_coverage.signals_missing_today.map((s) => SIGNAL_LABELS[s] ?? s).join(', ') : 'none'}</span></div>
                <p className="muted small">Missing readings are never counted as reassuring.</p>
              </>
            )}
          </section>

          <section className="card">
            <h2>Next-day outcome</h2>
            {!current ? <p className="muted">No prediction for this date.</p> : !revealed ? (
              <p className="muted">The check-in for {fmtDate(current.target_date)} is hidden. Use “Reveal following days” to compare.</p>
            ) : !targetDay ? <p>{fmtDate(current.target_date)} is not in this file.</p> : (
              <p>
                {typeof targetDay.daily_feeling_1_to_5 !== 'number' ? <>No feeling response on {fmtDate(current.target_date)}: the outcome is unknown (not counted as negative).</> :
                  targetDay.daily_feeling_1_to_5 <= 2 ? <>Feeling <b>{targetDay.daily_feeling_1_to_5}/5</b> on {fmtDate(current.target_date)}: a low day (2 or lower).</> :
                    <>Feeling <b>{targetDay.daily_feeling_1_to_5}/5</b> on {fmtDate(current.target_date)}: not a low day.</>}
              </p>
            )}
          </section>

          <section className="card">
            <h2>Session notes</h2>
            <textarea className="notes" rows={5} placeholder="Notes for this review" value={notes[key] ?? ''} onChange={(e) => setNote(key, e.target.value)} aria-label="Session notes" />
            <p className="muted small">Kept in this tab's memory only. Not saved or sent; cleared on reload.</p>
          </section>
        </aside>
      </div>
      <p className="foot">This review supports a coach check-in. It is not a diagnosis or treatment advice.</p>
    </div>
  )
}
