import synthetic from '../../../analysis/results/synthetic_next_day_low_feeling.json'
import fatigue from '../../../analysis/results/fatigue_next_day_bad_day.json'
import { useSession } from '../state'
import { fmtNum } from '../lib/status'
import { fmtDate } from '../lib/dates'

interface Metrics {
  n_patient_days: number; n_positive: number; prevalence: number
  auroc: number | null; pr_auc: number | null; precision: number | null; recall: number | null
  alerts_per_100_patient_days: number; auroc_95ci?: number[]; pr_auc_95ci?: number[]
}
interface Population { n_patients: number; models: Record<string, Metrics> }
type Results = Record<string, Population>

const MODEL_LABEL: Record<string, string> = {
  wearable_logistic_regression: 'Wearable logistic regression',
  constant_baseline_alert_all: 'Constant baseline (alert every day)',
  persistence_today_feeling: "Persistence: today's feeling is 2 or lower",
  persistence_today_bad_day: 'Persistence: today was rated a bad day',
}

const POP_LABEL: Record<string, [string, string]> = {
  all_eligible: ['All eligible days', 'Every test day with a known next-day answer and enough watch history.'],
  shared_with_persistence: ['Shared comparison: today’s answer known', 'Only days where the persistence baseline can be computed, so all models are compared on the same rows.'],
  today_feeling_missing: ['Subgroup: today’s feeling missing', 'Days with no check-in today, where persistence is impossible. Frozen model and validation threshold; no retraining.'],
  new_onset: ['Before a new low day', 'Days with at least one answer in the past week and none of them low.'],
}

const ci = (c?: number[]) => (c ? ` (${fmtNum(c[0], 2)}–${fmtNum(c[1], 2)})` : '')

function PopTable({ id, pop }: { id: string; pop: Population }) {
  const [title, desc] = POP_LABEL[id] ?? [id, '']
  return (
    <div className="pop">
      <h3>{title} <span className="muted small">· {pop.n_patients} test patients</span></h3>
      <p className="muted small">{desc}</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Model</th><th>Days</th><th>Positives</th><th>Prevalence</th><th>AUROC (95% CI)</th><th>PR-AUC (95% CI)</th><th>Precision</th><th>Recall</th><th>Alerts / 100 days</th></tr></thead>
          <tbody>
            {Object.entries(pop.models).map(([k, m]) => (
              <tr key={k} className={k === 'wearable_logistic_regression' ? 'row-model' : ''}>
                <td>{MODEL_LABEL[k] ?? k}</td>
                <td>{fmtNum(m.n_patient_days)}</td>
                <td>{fmtNum(m.n_positive)}</td>
                <td>{fmtNum(m.prevalence * 100, 1)}%</td>
                <td>{fmtNum(m.auroc, 3)}{ci(m.auroc_95ci)}</td>
                <td>{fmtNum(m.pr_auc, 3)}{ci(m.pr_auc_95ci)}</td>
                <td>{fmtNum(m.precision, 3)}</td>
                <td>{fmtNum(m.recall, 3)}</td>
                <td>{fmtNum(m.alerts_per_100_patient_days, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function Evidence() {
  const { importLog, datasets, removeDataset, setActive, active } = useSession()
  const sTest = synthetic.results.test as unknown as Results
  const fTest = fatigue.results.test as unknown as Results
  const sAll = sTest.all_eligible.models.wearable_logistic_regression
  const sShared = sTest.shared_with_persistence.models
  const sMiss = sTest.today_feeling_missing.models.wearable_logistic_regression
  const fAll = fTest.all_eligible.models.wearable_logistic_regression
  const fWeak = (fAll.auroc_95ci?.[0] ?? 0) <= 0.5

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Evidence and limitations</div>
          <h1>Evidence</h1>
          <p className="sub">Aggregate held-out test results committed in <code>analysis/results/</code>. They support coach review, not diagnosis or treatment advice.</p>
        </div>
      </div>

      <section className="card callouts">
        <div className="callout"><div className="callout-n">{fmtNum(sAll.auroc, 2)}</div><div>Synthetic test AUROC, all eligible days. Not clinical validation.</div></div>
        <div className="callout callout-warn"><div className="callout-n">{fmtNum(sShared.persistence_today_feeling.auroc, 2)} vs {fmtNum(sShared.wearable_logistic_regression.auroc, 2)}</div><div>When today’s feeling is known, carrying it forward beats the wearable model (AUROC).</div></div>
        <div className="callout"><div className="callout-n">{fmtNum(sMiss.auroc, 2)}</div><div>Wearable AUROC on days with no check-in today ({fmtNum(sMiss.n_patient_days)} days).</div></div>
        <div className="callout callout-warn"><div className="callout-n">{fmtNum(fAll.auroc, 2)}</div><div>Real non-oncology fatigue study: {fWeak ? '95% CI includes 0.5, so it is not distinguishable from chance.' : 'see table below.'}</div></div>
      </section>

      <section className="card">
        <div className="tag-row"><span className="tag tag-synth">Synthetic</span><span className="tag">Oncology (simulated)</span></div>
        <h2>Primary: next-day low feeling, synthetic cancer-treatment cohort</h2>
        <p>{synthetic.dataset.disclaimer}</p>
        <dl className="meta">
          <div><dt>Outcome</dt><dd>{synthetic.task.outcome}, predicted at the {synthetic.task.prediction_time}</dd></div>
          <div><dt>Unknown outcomes</dt><dd>{synthetic.task.unknown_outcomes}</dd></div>
          <div><dt>Split</dt><dd>By patient: {synthetic.split.summary.train.n_patients} train / {synthetic.split.summary.val.n_patients} validation / {synthetic.split.summary.test.n_patients} test</dd></div>
          <div><dt>Model</dt><dd>{synthetic.model.type}; {synthetic.model.inputs}</dd></div>
          <div><dt>Threshold</dt><dd>{synthetic.model.threshold} ({synthetic.model.threshold_rule}); scores are uncalibrated</dd></div>
        </dl>
        {['all_eligible', 'shared_with_persistence', 'today_feeling_missing', 'new_onset'].filter((k) => sTest[k]).map((k) => <PopTable key={k} id={k} pop={sTest[k]} />)}
      </section>

      <section className="card">
        <div className="tag-row"><span className="tag tag-real">Real data</span><span className="tag tag-warn">Not oncology</span></div>
        <h2>Secondary: next-day bad day, fatigue study</h2>
        <p><b>{fatigue.dataset.population}.</b> {fatigue.dataset.name}.</p>
        <dl className="meta">
          <div><dt>Outcome</dt><dd>{fatigue.task.outcome}</dd></div>
          <div><dt>Leakage control</dt><dd>{fatigue.task.leakage_note}</dd></div>
          <div><dt>Persistence caveat</dt><dd>{fatigue.task.persistence_caveat}</dd></div>
          <div><dt>Threshold</dt><dd>{fatigue.model.threshold} ({fatigue.model.threshold_rule}), alerting on about half of all days</dd></div>
        </dl>
        {['all_eligible', 'shared_with_persistence', 'new_onset'].filter((k) => fTest[k]).map((k) => <PopTable key={k} id={k} pop={fTest[k]} />)}
      </section>

      <section className="card">
        <h2>Limitations</h2>
        <ul className="limits">
          <li>The primary results use made-up data with deliberately designed patterns. They are not clinical validation.</li>
          <li>The only real dataset is not a cancer cohort, has {fTest.all_eligible.n_patients} test people with watch data, and its wearable model is weak.</li>
          <li>Scores rank days. They are uncalibrated and are not probabilities or percentage risks.</li>
          <li>When today’s check-in is available, simply carrying it forward does better than the wearable model.</li>
          <li>The outcome is a self-reported feeling of 2 or lower on the next day. It is not a clinical event, and the horizon is one day.</li>
          <li>“No alert” is not a sign that the patient is well. “Insufficient data” means too little recent watch data to score.</li>
          <li>Missing watch readings stay missing; they are never treated as zero activity or as reassuring.</li>
          <li>Research prototype. Not a medical device.</li>
        </ul>
      </section>

      <section className="card">
        <h2>Imports stay in this browser session</h2>
        <p className="muted small">Imported files are read in the browser and kept in memory. Nothing is uploaded, saved or tracked. Reloading returns the illustrative examples.</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Data</th><th>Source</th><th>Patients</th><th>Loaded</th><th /></tr></thead>
            <tbody>
              {datasets.map((d) => (
                <tr key={d.id}>
                  <td>{d.name}{d.id === active.id ? <span className="muted"> (showing)</span> : null}</td>
                  <td>{d.source === 'illustrative' ? 'Illustrative examples' : 'Imported file'}</td>
                  <td>{d.patients.length}</td>
                  <td>{d.source === 'illustrative' ? 'Built in' : new Date(d.loadedAt).toLocaleTimeString()}</td>
                  <td className="actions">
                    {d.id !== active.id && <button className="btn btn-ghost" onClick={() => setActive(d.id)}>Show</button>}
                    {d.source === 'imported' && <button className="btn btn-ghost" onClick={() => removeDataset(d.id)}>Remove</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {importLog.length > 0 && (
          <>
            <h3>Import attempts</h3>
            <ul className="log">{importLog.map((e, i) => <li key={i}><b>{e.outcome}</b> {e.fileName} · {new Date(e.at).toLocaleTimeString()} · {e.patients ?? '–'} patients · <span className="muted">{e.detail}</span></li>)}</ul>
          </>
        )}
        <p className="muted small">Results generated {fmtDate(synthetic.generated_at.slice(0, 10))} · model {synthetic.model_version}</p>
      </section>
    </div>
  )
}
