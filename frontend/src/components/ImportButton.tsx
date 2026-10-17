import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ImportError, parseExport } from '../lib/importer'
import { useSession } from '../state'

export function ImportButton({ onNotice }: { onNotice: (n: { kind: 'ok' | 'error'; text: string } | null) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const { addDataset, logImport } = useSession()
  const navigate = useNavigate()

  async function onFile(f: File) {
    const at = new Date().toISOString()
    try {
      // Read locally with the File API; the contents never leave the browser.
      const { dataset, warnings } = parseExport(await f.text(), f.name)
      addDataset(dataset)
      logImport({ fileName: f.name, at, patients: dataset.patients.length, outcome: 'Loaded', detail: warnings.length ? warnings.join(' ') : 'Matches contract' })
      onNotice({ kind: 'ok', text: `Loaded ${dataset.patients.length} patients from ${f.name} into this tab's memory.${warnings.length ? ` ${warnings.length} warning(s): ${warnings.slice(0, 2).join(' ')}` : ''}` })
      navigate('/')
    } catch (e) {
      const msg = e instanceof ImportError ? e.message : `Could not read file: ${(e as Error).message}`
      logImport({ fileName: f.name, at, patients: null, outcome: 'Error', detail: msg })
      onNotice({ kind: 'error', text: `${f.name}: ${msg}` })
    }
  }

  return (
    <>
      <input ref={input} type="file" accept=".json,application/json" hidden data-testid="import-input"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = '' }} />
      <button className="btn btn-primary" onClick={() => input.current?.click()}>Import JSON</button>
    </>
  )
}
