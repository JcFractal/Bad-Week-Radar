import { useState } from 'react'
import { HashRouter, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { SessionProvider, useSession } from './state'
import { Roster } from './pages/Roster'
import { PatientReview } from './pages/PatientReview'
import { Evidence } from './pages/Evidence'
import { ImportButton } from './components/ImportButton'

function TopBar({ onNotice }: { onNotice: (n: { kind: 'ok' | 'error'; text: string } | null) => void }) {
  const { active, datasets, setActive } = useSession()
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const open = () => {
    const hit = active.patients.find((p) => p.patient_id.toLowerCase() === q.trim().toLowerCase())
      ?? active.patients.find((p) => p.patient_id.toLowerCase().includes(q.trim().toLowerCase()))
    if (q.trim() && hit) { navigate(`/patient/${encodeURIComponent(hit.patient_id)}`); setQ(''); onNotice(null) }
    else onNotice({ kind: 'error', text: `No patient matching "${q}" in ${active.name}.` })
  }
  return (
    <header className="topbar">
      <form className="top-search" onSubmit={(e) => { e.preventDefault(); open() }}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M20 20l-4-4" stroke="currentColor" strokeWidth="2" /></svg>
        <input list="patient-ids" placeholder="Search patient ID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search patient ID" />
        <datalist id="patient-ids">{active.patients.map((p) => <option key={p.patient_id} value={p.patient_id} />)}</datalist>
        <button className="btn btn-primary" type="submit">Open patient history →</button>
      </form>
      <div className="top-right">
        {datasets.length > 1 && (
          <select value={active.id} onChange={(e) => { setActive(e.target.value); navigate('/') }} aria-label="Data set">
            {datasets.map((d) => <option key={d.id} value={d.id}>{d.source === 'illustrative' ? 'Illustrative examples' : `Imported: ${d.name}`}</option>)}
          </select>
        )}
        <ImportButton onNotice={onNotice} />
      </div>
    </header>
  )
}

function Shell() {
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><polyline points="2 12 6 12 9 4 15 20 18 12 22 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /></svg>
          Bad Week Radar
        </div>
        <div className="nav-label">Review</div>
        <NavLink to="/" end className="nav-item">
          <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden><g fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></g></svg>
          Roster
        </NavLink>
        <NavLink to="/evidence" className="nav-item">
          <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden><g fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3v18h18" /><path d="M8 17v-5M13 17V8M18 17v-9" /></g></svg>
          Evidence
        </NavLink>
        <div className="nav-foot">Research prototype. Not a medical device. Runs entirely in your browser.</div>
      </nav>
      <div className="main">
        <TopBar onNotice={setNotice} />
        {notice && (
          <div className={`notice notice-${notice.kind}`} role="status">
            {notice.text}<button className="notice-x" onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
          </div>
        )}
        <Routes>
          <Route path="/" element={<Roster />} />
          <Route path="/patient/:id" element={<PatientReview />} />
          <Route path="/evidence" element={<Evidence />} />
          <Route path="*" element={<Roster />} />
        </Routes>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <SessionProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
    </SessionProvider>
  )
}
