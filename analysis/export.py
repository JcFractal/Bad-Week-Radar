"""Local inference/export for the frontend. Output is patient-level and is written OUTSIDE the repo.

Usage: python analysis/export.py [--patient-ids P00033 P00041] [--n 5] [--as-of 2024-09-01] [--out PATH]
"""
import argparse
import json
import math
import sys
from pathlib import Path

import joblib
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bwr import MODEL_VERSION  # noqa: E402
from bwr.config import DATA_DIR, OUTPUT_DIR, ensure_outside_repo  # noqa: E402
from bwr.scoring import SCORE_TYPE, analyze  # noqa: E402
from bwr.split import patient_split  # noqa: E402

DISCLAIMER = ("Research prototype trained and evaluated on synthetic data only. Not a medical device, not clinically "
              "validated. Scores are uncalibrated rankings, not probabilities.")


def patient_days_frame(patient):
    d = pd.DataFrame(patient["days"])
    d["patient_id"] = patient["patient_id"]
    return d


def _json_safe(x):
    """Replace NaN/inf (which pandas introduces for None) with null so the output is strict JSON."""
    if isinstance(x, dict):
        return {k: _json_safe(v) for k, v in x.items()}
    if isinstance(x, list):
        return [_json_safe(v) for v in x]
    if isinstance(x, float) and not math.isfinite(x):
        return None
    return x


def export(source, bundle, patient_ids=None, n=5, as_of=None, include_days=True):
    patients = source["patients"]
    if patient_ids:
        chosen = [p for p in patients if p["patient_id"] in set(patient_ids)]
    else:  # default demo: held-out test patients only
        chosen = [p for p in patients if patient_split(p["patient_id"]) == "test"][:n]
    out_patients = []
    for p in chosen:
        p = dict(p)
        days = [d for d in p["days"] if as_of is None or d["date"] <= as_of]
        p["days"] = days
        recs = analyze(patient_days_frame(p), bundle).drop(columns="patient_id").to_dict("records") if days else []
        p["analysis"] = {"latest": recs[-1] if recs else None, "daily": recs}
        if not include_days:
            p.pop("days")
        out_patients.append(p)
    return {
        "about": source["about"],
        "analysis_meta": {
            "contract_version": "1.0",
            "model_version": bundle.get("model_version", MODEL_VERSION),
            "outcome": "next calendar day's daily_feeling_1_to_5 <= 2",
            "horizon_days": 1,
            "prediction_time": "end of prediction_date",
            "score_type": SCORE_TYPE,
            "threshold": round(bundle["threshold"], 4),
            "threshold_rule": bundle["threshold_rule"],
            "as_of": as_of,
            "statuses": ["alert", "no_alert", "insufficient_data"],
            "disclaimer": DISCLAIMER,
        },
        "patients": out_patients,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--patients-json", default=Path(DATA_DIR) / "synthetic_250_patients.json")
    ap.add_argument("--model", default=Path(OUTPUT_DIR) / "model" / f"{MODEL_VERSION}.joblib")
    ap.add_argument("--patient-ids", nargs="*")
    ap.add_argument("--n", type=int, default=5)
    ap.add_argument("--as-of", help="YYYY-MM-DD; drop days after this date to simulate real time")
    ap.add_argument("--no-days", action="store_true", help="omit raw daily rows, keep only analysis")
    ap.add_argument("--out", default=Path(OUTPUT_DIR) / "demo_export.json")
    args = ap.parse_args()
    out = ensure_outside_repo(args.out)
    source = json.loads(Path(args.patients_json).read_text())
    result = export(source, joblib.load(args.model), args.patient_ids, args.n, args.as_of, not args.no_days)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(_json_safe(result), indent=1, default=str, allow_nan=False))
    print(f"wrote {len(result['patients'])} patients -> {out}")
    for p in result["patients"]:
        a = p["analysis"]["latest"]
        print(f"  {p['patient_id']}: days={len(p['analysis']['daily'])} latest={a and a['prediction_date']} "
              f"status={a and a['status']} score={a and a['score']}")


if __name__ == "__main__":
    main()
