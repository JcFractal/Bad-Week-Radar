import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Dataset } from './types'
import { buildExamples } from './data/examples'

export interface ImportLogEntry { fileName: string; at: string; patients: number | null; outcome: 'Loaded' | 'Error'; detail: string }

interface Session {
  datasets: Dataset[]
  active: Dataset
  setActive: (id: string) => void
  addDataset: (d: Dataset) => void
  removeDataset: (id: string) => void
  notes: Record<string, string>
  setNote: (key: string, text: string) => void
  reviews: Record<string, string>
  toggleReview: (key: string) => void
  importLog: ImportLogEntry[]
  logImport: (e: ImportLogEntry) => void
}

const Ctx = createContext<Session | null>(null)

/** All session state lives in React memory only: nothing is persisted, uploaded or tracked. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [datasets, setDatasets] = useState<Dataset[]>(() => [buildExamples()])
  const [activeId, setActiveId] = useState('examples')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [reviews, setReviews] = useState<Record<string, string>>({})
  const [importLog, setImportLog] = useState<ImportLogEntry[]>([])

  const addDataset = useCallback((d: Dataset) => {
    setDatasets((xs) => [...xs, d])
    setActiveId(d.id)
  }, [])
  const removeDataset = useCallback((id: string) => {
    if (id === 'examples') return
    setDatasets((xs) => xs.filter((x) => x.id !== id))
    setActiveId((cur) => (cur === id ? 'examples' : cur))
    const drop = <T,>(r: Record<string, T>) => Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith(`${id}:`)))
    setNotes(drop)
    setReviews(drop)
  }, [])
  const setNote = useCallback((key: string, text: string) => setNotes((n) => ({ ...n, [key]: text })), [])
  const toggleReview = useCallback((key: string) => setReviews((r) => {
    const next = { ...r }
    if (next[key]) delete next[key]
    else next[key] = new Date().toISOString()
    return next
  }), [])
  const logImport = useCallback((e: ImportLogEntry) => setImportLog((l) => [e, ...l]), [])

  const value = useMemo(() => ({
    datasets,
    active: datasets.find((d) => d.id === activeId) ?? datasets[0],
    setActive: setActiveId,
    addDataset, removeDataset, notes, setNote, reviews, toggleReview, importLog, logImport,
  }), [datasets, activeId, addDataset, removeDataset, notes, setNote, reviews, toggleReview, importLog, logImport])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSession() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useSession outside SessionProvider')
  return s
}

// eslint-disable-next-line react-refresh/only-export-components
export const reviewKey = (datasetId: string, patientId: string) => `${datasetId}:${patientId}`
