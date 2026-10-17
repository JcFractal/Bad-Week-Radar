# Evaluation: next-day low feeling (synthetic oncology cohort)

> **Synthetic data only.** The Crane Lab cohort is made up, with deliberately designed patterns. Nothing here is
> clinical validation, and scores are **uncalibrated** rankings, not probabilities.
> The machine-readable source is `analysis/results/synthetic_next_day_low_feeling.json`.

**Setup**

| | |
|---|---|
| Horizon | 1 day: predict at the end of day *t* for day *t+1* |
| Outcome | `daily_feeling_1_to_5 <= 2` |
| Threshold | 0.2078, max F1 on validation patients |
| Split | patient-level, 1,815 / 575 / 610 patients (train / val / test) |

**Test-set sample**

| | |
|---|---|
| Patient-days | 93,625 |
| Labeled next-day outcomes | 42,366 |
| Excluded for insufficient wearable history | 2,464 |
| Eligible patient-days | **39,902** |
| Outcome prevalence | **8.3%** |

## Test results (610 held-out patients)

The 95% CIs come from a patient-level bootstrap with 200 resamples.

| Population | Model | n | Prevalence | AUROC | PR-AUC | Precision | Recall | Alerts / 100 patient-days |
|---|---|---|---|---|---|---|---|---|
| All eligible | Wearable LR | 39,902 | 0.083 | **0.772** (0.759–0.786) | **0.374** (0.347–0.399) | 0.381 | 0.376 | 8.2 |
| All eligible | Constant (alert all) | 39,902 | 0.083 | 0.500 | 0.083 | 0.083 | 1.000 | 100 |
| **Shared with persistence** (today's feeling reported) | Wearable LR | 19,393 | 0.075 | 0.752 (0.733–0.771) | 0.311 (0.279–0.343) | 0.327 | 0.324 | 7.5 |
| Shared with persistence | Persistence (today ≤ 2) | 19,393 | 0.075 | **0.839** | **0.356** | **0.454** | **0.458** | 7.6 |
| Shared with persistence | Constant | 19,393 | 0.075 | 0.500 | 0.075 | 0.075 | 1.000 | 100 |
| **New onset** (≥1 response in days t-6..t, none ≤ 2) | Wearable LR | 32,262 | 0.042 | 0.695 (0.678–0.710) | 0.153 (0.135–0.172) | 0.189 | 0.206 | 4.5 |
| New onset | Constant | 32,262 | 0.042 | 0.500 | 0.042 | 0.042 | 1.000 | 100 |
| New onset, today's feeling reported | Persistence | 15,680 | 0.033 | 0.747 | 0.074 | n/a (no alerts) | 0.000 | 0.0 |

## Honest reading
- The wearable model clearly beats the constant baseline: test AUROC is 0.77 and PR-AUC is 0.37, against a
  prevalence of 0.08.
- **When today's feeling is known, simply carrying it forward beats the wearable-only model** on every metric
  (AUROC 0.84 vs 0.75 on the same 19,393 days). The wearable model's value lies in two places: the ~half of days
  with no check-in, and new-onset low days, where persistence cannot alert at all.
- On new-onset low days, performance is modest (AUROC 0.70, PR-AUC 0.15 vs 0.04 prevalence). At this threshold,
  about 1 in 5 alerts is correct, and the model catches about 1 in 5 new low days.
- The largest standardized coefficients are on night awakenings (today's count and its deviation), plus recent
  sleep efficiency, resting heart rate and wear time. This probably reflects patterns the generator planted
  on purpose. It is not evidence about real patients.
- No probability calibration was done. The 0.21 threshold is an operating point chosen on validation, not a risk
  level.
