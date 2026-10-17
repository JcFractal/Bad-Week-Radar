# Frontend JSON contract (v1.0)

Produced locally by `python analysis/export.py` (default output: `~/bwr_outputs/demo_export.json`).
The output is **patient-level, so never commit it**. It keeps the shape of `synthetic_250_patients.json`
(`about` + `patients[]`, with every patient field and `days[]` unchanged) and adds:

- a top-level `analysis_meta` object
- a per-patient `analysis` object

All example values below are illustrative.

```jsonc
{
  "about": "MADE-UP DATA. ...",                     // copied from source
  "analysis_meta": {
    "contract_version": "1.0",
    "model_version": "bwr-lr-wearable-v1",
    "outcome": "next calendar day's daily_feeling_1_to_5 <= 2",
    "horizon_days": 1,
    "prediction_time": "end of prediction_date",
    "score_type": "uncalibrated_logistic_score",
    "threshold": 0.2078,
    "threshold_rule": "max F1 on validation patients",
    "as_of": null,                                   // or "YYYY-MM-DD" if days after it were dropped
    "statuses": ["alert", "no_alert", "insufficient_data"],
    "disclaimer": "Research prototype ... synthetic data only ... not probabilities."
  },
  "patients": [
    {
      "patient_id": "P00000", "age": 60, "...": "all original patient fields",
      "days": [ /* original daily objects, unchanged; omitted with --no-days */ ],
      "analysis": {
        "latest": { /* same shape as one element of daily[], or null */ },
        "daily": [
          {
            "prediction_date": "2024-02-21",         // day whose data was used (prediction made at its end)
            "target_date": "2024-02-22",             // day being predicted
            "horizon_days": 1,
            "status": "alert",                       // alert | no_alert | insufficient_data
            "score": 0.31,                           // null when status == insufficient_data
            "score_type": "uncalibrated_logistic_score",
            "threshold": 0.2078,
            "contributing_changes": [                // 0–3 items, largest score contribution first; [] if none
              {
                "signal": "steps",                   // steps | active_minutes | resting_heart_rate | hrv_rmssd_ms |
                                                     // sleep_minutes | sleep_efficiency_pct | times_woke_up |
                                                     // skin_temp_change_c | minutes_watch_worn
                "label": "Steps",
                "direction": "down",                 // up | down | flat (value vs baseline)
                "window": "today",                   // today | last_3_days (used when today's reading is missing)
                "value": 3200.0,
                "baseline_28d": 4900.0,              // mean of the previous 28 days (today excluded)
                "pct_change_vs_baseline": -34.7,     // null for skin_temp_change_c (already a delta)
                "z_vs_baseline": -1.0,
                "score_contribution": 0.35           // standardized coef x value (logit units), > 0 = raises score
              }
            ],
            "data_coverage": {
              "watch_worn_minutes_today": 1295,
              "wearable_days_last_7": 6,
              "baseline_days_available": 23,
              "baseline_window_days": 28,
              "signals_missing_today": ["skin_temp_change_c"]
            }
          }
        ]
      }
    }
  ]
}
```

## Semantics for the UI
- **`alert`** means `score >= threshold`. Show it as "worth a check-in", not as a diagnosis or probability. Use
  the wording from `disclaimer`.
- **`insufficient_data`** means fewer than 7 wearable days in the prior 28 days, or no wearable data in the last 7
  days. Show "not enough watch data", **not** "all clear".
- `score` is a ranking score from logistic regression and is **not calibrated**. Don't show it as "x% chance".
- `contributing_changes` lists only signals that were actually measured. Missing readings appear in
  `data_coverage.signals_missing_today`. They are never presented as reassuring or as a change.
- `skin_temp_change_c` is missing for every Fitbit tracker (non-smartwatch) patient.

## Evidence page
The Evidence page should read `analysis/results/synthetic_next_day_low_feeling.json` (aggregate only, committed).
Key paths:
- `dataset` and `task` describe the setup.
- `split.summary.{train,val,test}` holds counts and prevalence.
- `model.threshold` and `model.top_standardized_coefficients` describe the model.
- `results.test.{all_eligible, shared_with_persistence, new_onset}.models.{wearable_logistic_regression,
  constant_baseline_alert_all, persistence_today_feeling}` contains these metrics: `n_patient_days`,
  `n_positive`, `prevalence`, `auroc`, `pr_auc`, `precision`, `recall`, `alerts_per_100_patient_days`, and (LR on
  test) `auroc_95ci` / `pr_auc_95ci`.
- Metrics can be `null` when undefined, for example precision when there are zero alerts.
