"""Train + evaluate the next-day low-feeling early-warning model on the synthetic oncology data.

Usage: python analysis/train_eval.py [--data-dir DIR] [--output-dir DIR]
Writes: model bundle to OUTPUT_DIR/model (outside the repo) and aggregate metrics to analysis/results/.
"""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bwr import MODEL_VERSION  # noqa: E402
from bwr.config import DATA_DIR, OUTPUT_DIR, RESULTS_DIR, ensure_outside_repo  # noqa: E402
from bwr.features import FORBIDDEN_INPUTS, MIN_BASELINE_OBS, SIGNALS, WEAR, feature_columns  # noqa: E402
from bwr.features import build_features  # noqa: E402
from bwr.labels import FEELING, LOW_FEELING_MAX, add_labels  # noqa: E402
from bwr.modeling import fit_model, metrics, patient_bootstrap_ci, select_threshold_max_f1  # noqa: E402
from bwr.split import SPLIT_SALT, patient_split  # noqa: E402

# Only columns needed for features and labels are read; diary text, events and weekly symptoms are never loaded.
USECOLS = ["patient_id", "date", "day_in_program", FEELING, WEAR] + SIGNALS


def load_daily(data_dir):
    return pd.read_csv(Path(data_dir) / "synthetic_daily.csv", usecols=USECOLS, parse_dates=["date"])


def build_dataset(daily):
    df = add_labels(daily, build_features(daily))
    df["split"] = df["patient_id"].map(patient_split)
    return df


def evaluate(df, bundle):
    feats, thr = bundle["features"], bundle["threshold"]
    prev_train = bundle["train_prevalence"]
    out = {}
    for split in ["val", "test"]:
        e = df[(df.split == split) & df.eligible].copy()
        e["score"] = bundle["pipeline"].predict_proba(e[feats])[:, 1]
        y = e.target.values
        pops = {
            "all_eligible": e,
            "shared_with_persistence": e[e.today_feeling.notna()],
            "today_feeling_missing": e[e.today_feeling.isna()],
            "new_onset": e[e.new_onset_eligible],
        }
        res = {}
        for name, p in pops.items():
            yy = p.target.values
            r = {
                "wearable_logistic_regression": metrics(yy, p.score.values, p.score.values >= thr),
                "constant_baseline_alert_all": metrics(yy, np.full(len(p), prev_train), np.ones(len(p), bool)),
            }
            if split == "test" and len(p):
                r["wearable_logistic_regression"].update(
                    patient_bootstrap_ci(yy, p.score.values, p.patient_id.values))
            pp = p[p.today_feeling.notna()]
            if len(pp) and name != "today_feeling_missing":
                r["persistence_today_feeling"] = metrics(
                    pp.target.values, -pp.today_feeling.values, pp.today_feeling.values <= LOW_FEELING_MAX)
                r["persistence_today_feeling"]["population_note"] = (
                    "evaluated only on rows where today's feeling was reported" if name != "shared_with_persistence"
                    else "same rows as the other models in this population")
            res[name] = {"n_patients": int(p.patient_id.nunique()), "models": r}
        out[split] = res
        del y
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default=DATA_DIR)
    ap.add_argument("--output-dir", default=OUTPUT_DIR)
    args = ap.parse_args()
    out_dir = ensure_outside_repo(args.output_dir)

    daily = load_daily(args.data_dir)
    df = build_dataset(daily)
    df["labeled"] = df.target.notna()
    df["eligible"] = df.labeled & df.sufficient_data
    feats = feature_columns()
    assert not set(feats) & set(FORBIDDEN_INPUTS)

    tr = df[(df.split == "train") & df.eligible]
    model = fit_model(tr[feats], tr.target.astype(int))
    va = df[(df.split == "val") & df.eligible]
    thr = select_threshold_max_f1(va.target.astype(int), model.predict_proba(va[feats])[:, 1])
    bundle = {
        "model_version": MODEL_VERSION,
        "pipeline": model,
        "features": feats,
        "threshold": thr,
        "threshold_rule": "max F1 on validation patients",
        "train_prevalence": float(tr.target.mean()),
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    (out_dir / "model").mkdir(parents=True, exist_ok=True)
    model_path = out_dir / "model" / f"{MODEL_VERSION}.joblib"
    joblib.dump(bundle, model_path)

    coefs = sorted(zip(feats, model[-1].coef_[0]), key=lambda kv: -abs(kv[1]))
    split_summary = {}
    for s in ["train", "val", "test"]:
        d = df[df.split == s]
        split_summary[s] = {
            "n_patients": int(d.patient_id.nunique()),
            "n_patient_days": int(len(d)),
            "n_labeled_next_day": int(d.labeled.sum()),
            "n_excluded_insufficient_wearable_history": int((d.labeled & ~d.sufficient_data).sum()),
            "n_eligible": int(d.eligible.sum()),
            "eligible_prevalence": round(float(d[d.eligible].target.mean()), 4),
        }
    result = {
        "schema_version": "1.0",
        "generated_at": bundle["trained_at"],
        "model_version": MODEL_VERSION,
        "dataset": {
            "name": "synthetic_daily.csv (Crane Lab synthetic oncology cohort)",
            "synthetic": True,
            "disclaimer": "Made-up data with deliberately designed patterns. These results are NOT clinical validation.",
            "n_patients": int(df.patient_id.nunique()),
            "n_patient_days": int(len(df)),
            "date_range": [df.date.min().strftime("%Y-%m-%d"), df.date.max().strftime("%Y-%m-%d")],
            "feeling_response_rate": round(float(daily[FEELING].notna().mean()), 4),
            "wearable_missing_rate_steps": round(float(daily["steps"].isna().mean()), 4),
        },
        "task": {
            "outcome": f"next calendar day's {FEELING} <= {LOW_FEELING_MAX}",
            "prediction_time": "end of the current day",
            "horizon_days": 1,
            "unknown_outcomes": "patient-days whose next calendar day has no feeling response are excluded (unknown), not negative",
            "eligibility": f"next-day response present AND >= {MIN_BASELINE_OBS} wearable days in the prior 28 days AND >= 1 wearable day in the last 7",
            "new_onset_definition": "eligible days with >=1 feeling response in days t-6..t and none of them <= 2",
        },
        "split": {"unit": "patient", "method": f"sha256('{SPLIT_SALT}:'+patient_id) mod 100: <60 train, <80 val, else test",
                  "summary": split_summary},
        "model": {
            "type": "logistic regression (median imputation + standardization, fit on training patients only)",
            "inputs": "wearable signals only: today's values, deviation from personal prior-28-day baseline, 3-day trend vs baseline, missingness indicators, wear time, coverage",
            "excluded_inputs": FORBIDDEN_INPUTS,
            "n_features": len(feats),
            "score_type": "uncalibrated_logistic_score",
            "threshold": round(thr, 4),
            "threshold_rule": bundle["threshold_rule"],
            "top_standardized_coefficients": [{"feature": f, "coef": round(float(c), 4)} for f, c in coefs[:12]],
        },
        "results": evaluate(df, bundle),
    }
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    res_path = RESULTS_DIR / "synthetic_next_day_low_feeling.json"
    res_path.write_text(json.dumps(result, indent=2) + "\n")
    print(f"model -> {model_path}\nresults -> {res_path}")
    t = result["results"]["test"]
    for pop, r in t.items():
        print(f"\n[test / {pop}] patients={r['n_patients']}")
        for m, v in r["models"].items():
            print(f"  {m:32s} n={v['n_patient_days']:6d} prev={v['prevalence']} auroc={v['auroc']} "
                  f"prauc={v['pr_auc']} prec={v['precision']} rec={v['recall']} alerts/100={v['alerts_per_100_patient_days']}")


if __name__ == "__main__":
    main()
