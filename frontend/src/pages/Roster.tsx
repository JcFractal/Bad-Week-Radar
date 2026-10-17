import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { reviewKey, useSession } from '../state'
import { STATUS_LABEL, STATUS_ORDER, statusOf, summarize, type DisplayStatus } from '../lib/status'
import { StatusBadge } from '../components/StatusBadge'
import { DatasetBanner } from '../components/DatasetBanner'
import { fmtDate } from '../lib/dates'

const RANK: Record<DisplayStatus, number> = { alert: 0, insufficient_data: 1, no_alert: 2, none: 3 }

export function Roster() {
  const { active, reviews } = useSession()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<DisplayStatus | 'all'>('all')

  const rows = useMemo(() => active.patients.map((p) => {
    const latest = p.analysis?.latest ?? null
    return { p, latest, status: statusOf(latest) }
  }).sort((a, b) => RANK[a.status] - RANK[b.status] || (b.latest?.score ?? -1) - (a.latest?.score ?? -1) || a.p.patient_id.localeCompare(b.p.patient_id)), [active])

  const counts = useMemo(() => {
    const c: Record<DisplayStatus, number> = { alert: 0, no_alert: 0, insufficient_data: 0, none: 0 }
    rows.forEach((r) => c[r.status]++)
    return c
  }, [rows])
  const reviewed = rows.filter((r) => reviews[reviewKey(active.id, r.p.patient_id)]).length

  const q = query.trim().toLowerCase()
  const shown = rows.filter((r) => (filter === 'all' || r.status === filter) &&
    (!q || r.p.patient_id.toLowerCase().includes(q) || String(r.p.treatment_plan ?? '').toLowerCase().includes(q)))

  return (
    <div className="page">
      <DatasetBanner />
      <div className="page-head">
        <div>
          <h1>Roster</h1>
          <p className="sub">Patients ranked by analysis status from their most recent record. Open one to review wearable timelines or replay an earlier date.</p>
        </div>
        <input className="search" placeholder="Search patient ID or treatment plan" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search patient ID or treatment plan" />
      </div>

      <div className="stats">
        <button className={`stat ${filter === 'all' ? 'is-on' : ''}`} onClick={() => setFilter('all')}>
          <span className="stat-n">{rows.length}</span><span className="stat-l">All patients</span>
        </button>
        {STATUS_ORDER.filter((s) => s !== 'none' || counts.none > 0).map((s) => (
          <button key={s} className={`stat stat-${s} ${filter === s ? 'is-on' : ''}`} onClick={() => setFilter(filter === s ? 'all' : s)} aria-pressed={filter === s}>
            <span className="stat-n">{counts[s]}</span><span className="stat-l">{STATUS_LABEL[s]}</span>
          </button>
        ))}
        <div className="stat stat-static"><span className="stat-n">{reviewed}</span><span className="stat-l">Reviewed this session</span></div>
      </div>

      <div className="filters" role="group" aria-label="Status filter">
        {(['all', ...STATUS_ORDER.filter((s) => s !== 'none' || counts.none > 0)] as const).map((s) => (
          <button key={s} className={`chip ${filter === s ? 'is-on' : ''}`} onClick={() => setFilter(s)}>
            {s === 'all' ? 'All' : STATUS_LABEL[s]} <span className="chip-n">{s === 'all' ? rows.length : counts[s]}</span>
          </button>
        ))}
      </div>

      <div className="roster" role="list">
        {shown.map(({ p, latest, status }) => {
          const done = reviews[reviewKey(active.id, p.patient_id)]
          return (
            <Link key={p.patient_id} to={`/patient/${encodeURIComponent(p.patient_id)}`} className="roster-row" role="listitem">
              <div className="roster-main">
                <div className="roster-id">{p.patient_id}{done ? <span className="reviewed">Reviewed</span> : null}</div>
                <div className="roster-sum">{summarize(latest)}</div>
              </div>
              <div className="roster-plan">{p.treatment_plan ?? '–'}</div>
              <div className="roster-date">{latest ? fmtDate(latest.prediction_date) : '–'}</div>
              <StatusBadge status={status} />
            </Link>
          )
        })}
        {!shown.length && <div className="empty">No patients match this search and filter.</div>}
      </div>
      <p className="foot">"No alert" means the score was below the review threshold. It does not mean the patient is well. "Insufficient data" means there was not enough recent watch data to score.</p>
    </div>
  )
}
