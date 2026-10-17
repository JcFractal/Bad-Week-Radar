"""Secondary experiment (NON-ONCOLOGY, real data): next-day bad_day in the lupus/Sjogren's fatigue study.

Usage: python analysis/fatigue_experiment.py [--data-dir DIR]
Writes aggregate metrics only: analysis/results/fatigue_next_day_bad_day.json
"""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bwr.config import DATA_DIR, RESULTS_DIR  # noqa: E402
from bwr.features import build_features, feature_columns  # noqa: E402
from bwr.modeling import fit_model, metrics, patient_bootstrap_ci, select_threshold_max_f1  # noqa: E402
from bwr.split import SPLIT_SALT, patient_split  # noqa: E402

SIGNALS = ["steps", "minutes_brisk_activity", "minutes_light_activity", "minutes_sitting_still",
           "resting_heart_rate", "avg_heart_rate_awake", "avg_heart_rate_asleep", "sleep_minutes",
           "time_in_bed_minutes", "sleep_efficiency_pct", "bedtime_hour", "naps"]
WEAR = "minutes_fitbit_worn"
WINDOW, MIN_OBS = "14D", 5
# Never inputs: all survey answers. weekly_fatigue_score is copied onto every day of its week (same-week leakage).
EXCLUDED = ["day_rating", "bad_day", "tired_0_to_4", "pain_0_to_4", "low_mood_0_to_4",
            "trouble_with_usual_activities_0_to_4", "needed_daytime_sleep_0_to_2", "weekly_fatigue_score_0_to_52",
            "health_group", "age", "sex", "study_week"]
USECOLS = ["person_id", "date", "bad_day", WEAR] + SIGNALS


def build(daily):
    daily = daily.rename(columns={"person_id": "patient_id"})
    feats = build_features(daily, SIGNALS, WEAR, presence="steps", window=WINDOW, min_obs=MIN_OBS)
    lab = daily[["patient_id", "date", "bad_day"]]
    nxt = lab.rename(columns={"bad_day": "target"}).assign(date=lambda d: d.date - pd.Timedelta(days=1))
    df = feats.merge(lab.rename(columns={"bad_day": "today_bad_day"}), on=["patient_id", "date"], how="left")
    df = df.merge(nxt, on=["patient_id", "date"], how="left")
    df = df.sort_values(["patient_id", "date"]).reset_index(drop=True)
    roll = df.set_index("date").groupby("patient_id")["today_bad_day"].rolling("7D", min_periods=1)
    df["recent_bad"], df["recent_resp"] = roll.sum().values, roll.count().values
    df["new_onset_eligible"] = (df.recent_resp >= 1) & (df.recent_bad == 0)
    df["split"] = df.patient_id.map(patient_split)
    df["eligible"] = df.target.notna() & df.sufficient_data
    return df


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default=DATA_DIR)
    args = ap.parse_args()
    daily = pd.read_csv(Path(args.data_dir) / "fatigue_study_daily.csv", usecols=USECOLS, parse_dates=["date"])
    df = build(daily)
    feats = feature_columns(SIGNALS, WEAR)
    tr, va = (df[(df.split == s) & df.eligible] for s in ("train", "val"))
    model = fit_model(tr[feats], tr.target.astype(int))
    thr = select_threshold_max_f1(va.target.astype(int), model.predict_proba(va[feats])[:, 1])
    prev = float(tr.target.mean())

    results = {}
    for split in ("val", "test"):
        e = df[(df.split == split) & df.eligible].copy()
        e["score"] = model.predict_proba(e[feats])[:, 1]
        res = {}
        for name, p in {"all_eligible": e, "shared_with_persistence": e[e.today_bad_day.notna()],
                        "new_onset": e[e.new_onset_eligible]}.items():
            y = p.target.values
            r = {"wearable_logistic_regression": metrics(y, p.score.values, p.score.values >= thr),
                 "constant_baseline_alert_all": metrics(y, np.full(len(p), prev), np.ones(len(p), bool))}
            if split == "test":
                r["wearable_logistic_regression"].update(patient_bootstrap_ci(y, p.score.values, p.patient_id.values))
            pp = p[p.today_bad_day.notna()]
            if len(pp):
                r["persistence_today_bad_day"] = metrics(pp.target.values, pp.today_bad_day.values,
                                                         pp.today_bad_day.values == 1)
            res[name] = {"n_patients": int(p.patient_id.nunique()), "models": r}
        results[split] = res

    summary = {s: {"n_patients": int(d.patient_id.nunique()), "n_patients_with_fitbit": int(d[d.steps_today.notna()].patient_id.nunique()),
                   "n_patient_days": int(len(d)), "n_labeled_next_day": int(d.target.notna().sum()),
                   "n_eligible": int(d.eligible.sum()),
                   "eligible_prevalence": round(float(d[d.eligible].target.mean()), 4) if d.eligible.any() else None}
               for s, d in df.groupby("split")}
    coefs = sorted(zip(feats, model[-1].coef_[0]), key=lambda kv: -abs(kv[1]))
    out = {
        "schema_version": "1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "dataset": {
            "name": "fatigue_study_daily.csv (Rao et al. 2023; Evidation/Novartis/Roche, Zenodo 8018238)",
            "synthetic": False,
            "oncology": False,
            "population": "US adults with lupus and/or Sjogren's syndrome and controls without autoimmune disease; NOT cancer patients",
            "n_people": int(df.patient_id.nunique()),
            "n_patient_days": int(len(df)),
            "date_range": [df.date.min().strftime("%Y-%m-%d"), df.date.max().strftime("%Y-%m-%d")],
        },
        "task": {
            "outcome": "next calendar day's bad_day == 1 (day rated 'bad')",
            "horizon_days": 1,
            "prediction_time": "end of the current day (wearable data only)",
            "unknown_outcomes": "days without a next-calendar-day rating are excluded, not negative",
            "eligibility": f"next-day rating present AND >= {MIN_OBS} Fitbit days in the prior 14 days AND >= 1 in the last 7",
            "excluded_inputs": EXCLUDED,
            "leakage_note": "weekly_fatigue_score_0_to_52 is copied onto all 7 days of its week, so it is never used; "
                            "no survey answer is used as a model input",
            "persistence_caveat": "today's rating is reported the next morning, i.e. slightly after the prediction time; "
                                  "the persistence baseline is therefore optimistic",
            "new_onset_definition": "eligible days with >=1 rating in days t-6..t and none of them bad",
        },
        "split": {"unit": "person", "method": f"sha256('{SPLIT_SALT}:'+person_id) mod 100: <60 train, <80 val, else test",
                  "summary": summary},
        "model": {"type": "logistic regression (median imputation + standardization, fit on training people only)",
                  "baseline_window": WINDOW, "threshold": round(thr, 4), "threshold_rule": "max F1 on validation people",
                  "score_type": "uncalibrated_logistic_score",
                  "top_standardized_coefficients": [{"feature": f, "coef": round(float(c), 4)} for f, c in coefs[:10]]},
        "results": results,
    }
    path = RESULTS_DIR / "fatigue_next_day_bad_day.json"
    path.write_text(json.dumps(out, indent=2) + "\n")
    print(f"results -> {path}\n{json.dumps(summary)}\nthreshold={thr:.4f}")
    for pop, r in results["test"].items():
        print(f"\n[test / {pop}] people={r['n_patients']}")
        for m, v in r["models"].items():
            print(f"  {m:30s} n={v['n_patient_days']:5d} prev={v['prevalence']} auroc={v['auroc']} prauc={v['pr_auc']} "
                  f"prec={v['precision']} rec={v['recall']} alerts/100={v['alerts_per_100_patient_days']} "
                  f"ci={v.get('auroc_95ci')}")


if __name__ == "__main__":
    main()
