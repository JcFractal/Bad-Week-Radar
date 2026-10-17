import { useSession } from '../state'
import { fmtDate } from '../lib/dates'

export function DatasetBanner() {
  const { active } = useSession()
  if (active.source === 'illustrative') {
    return (
      <div className="banner banner-example" role="note">
        <b>Illustrative examples.</b> These are invented histories with an example scoring rule. They are not challenge records,
        real people or output of the trained model. Use <b>Import JSON</b> to review an analysis export in this tab.
      </div>
    )
  }
  return (
    <div className="banner banner-import" role="note">
      <b>Imported: {active.name}</b> ({active.patients.length} patients). It is held in this tab's memory only: it is not uploaded,
      saved or tracked, and reloading the page clears it.
      {active.meta?.as_of ? <> File truncated as of {fmtDate(active.meta.as_of)}.</> : null}
      {active.meta?.disclaimer ? <div className="banner-sub">{active.meta.disclaimer}</div> : null}
    </div>
  )
}
