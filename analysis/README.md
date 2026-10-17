# Bad Week Radar: analysis and early-warning engine

This predicts whether **tomorrow's** `daily_feeling_1_to_5` will be **2 or lower**. The model runs at the end of
today and uses only wearable data up to and including today. It is trained and evaluated on the **synthetic**
oncology cohort. These results are **not clinical validation**.

## Data privacy (public repo)
- The restricted data stays **outside** this repo. By default it lives in `~/bwr_data`; override with `BWR_DATA_DIR`.
- The model and patient-level exports go to `~/bwr_outputs`; override with `BWR_OUTPUT_DIR`. The scripts refuse to
  write patient-level output inside the repo.
- The only results committed are aggregate metrics in `analysis/results/`. `analysis/.gitignore` blocks `*.csv`, `*.zip`,
  `*.joblib` and data `*.json` files.

## Setup
```bash
pip install -r analysis/requirements.txt
mkdir -p ~/bwr_data   # copy the hackathon files in here (flat): synthetic_daily.csv, synthetic_250_patients.json, ...
```

## Run
```bash
python analysis/train_eval.py      # ~1.5 min: features, patient split, training, threshold, evaluation
                                   # -> ~/bwr_outputs/model/bwr-lr-wearable-v1.joblib
                                   # -> analysis/results/synthetic_next_day_low_feeling.json (aggregate, committed)
python analysis/export.py          # demo export of 5 held-out test patients -> ~/bwr_outputs/demo_export.json
python analysis/export.py --patient-ids P00044 P00065 --as-of 2024-03-15 --no-days --out ~/bwr_outputs/x.json
python analysis/evaluate_frozen.py   # re-score saved model at saved threshold (no retraining); adds populations to results JSON
python -m pytest analysis/tests -q # leakage, separation and privacy checks
python analysis/fatigue_experiment.py  # secondary, real NON-oncology data -> analysis/results/fatigue_next_day_bad_day.json
```

## Method (summary)
- **Target:** next calendar day (`date + 1`, not "next row") feeling ≤ 2. If tomorrow's response is missing, the
  outcome is **unknown** and that patient-day is excluded. It is never counted as negative.
- **Eligible days:** the outcome is known, there are ≥ 7 wearable days in the prior 28 days, and there is ≥ 1
  wearable day in the last 7. Labeled days that fail the history rule are counted in the results JSON. In the
  export they get `status: "insufficient_data"`.
- **Features** (`bwr/features.py`) use 9 wearable signals: steps, active minutes, resting heart rate, HRV, sleep
  minutes, sleep efficiency, night awakenings, skin temperature change, and wear time. For each signal:
  - today's value
  - z-deviation from the person's **prior** 28-day baseline (`closed="left"`, so today is excluded)
  - the 3-day mean versus that baseline
  - a missing-today indicator

  Coverage features are wearable days in the last 7 and baseline days. Missing readings stay `NaN`. They are
  never zero. Imputation (training median) happens inside the pipeline, and the explicit missingness indicators
  are kept, so non-wear is modelled as its own signal.
- **Never used as inputs:** feeling responses, weekly symptoms, events, coaching calls and diary text. The
  training script does not even load those columns. Today's feeling is used only by the persistence baseline.
- **Split:** by patient, deterministic: `sha256("bwr-split-v1:" + patient_id) % 100` gives `<60` train, `<80`
  validation, else test. The imputer, scaler and logistic regression are fit on training patients only. The alert
  threshold is the max-F1 threshold on validation patients only.
- **Comparators:** a constant baseline (training prevalence, "alert everyone") and a persistence baseline (alert
  if today's feeling ≤ 2; the ranking score is `-today_feeling`). The `shared_with_persistence` population is
  restricted to days with today's feeling reported, so all three are compared on the same rows.

See `docs/evaluation.md` for the results and `docs/frontend_contract.md` for the JSON contract.
