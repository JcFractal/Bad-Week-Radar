"""Re-evaluate the saved (frozen) model + validation-selected threshold without retraining or retuning.

Usage: python analysis/evaluate_frozen.py [--model PATH]
Updates the `results` section of analysis/results/synthetic_next_day_low_feeling.json (aggregate only) and checks
that populations already reported are reproduced exactly.
"""
import argparse
import json
import sys
from pathlib import Path

import joblib

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bwr import MODEL_VERSION  # noqa: E402
from bwr.config import DATA_DIR, OUTPUT_DIR, RESULTS_DIR  # noqa: E402
from train_eval import build_dataset, evaluate, load_daily  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default=DATA_DIR)
    ap.add_argument("--model", default=Path(OUTPUT_DIR) / "model" / f"{MODEL_VERSION}.joblib")
    args = ap.parse_args()
    bundle = joblib.load(args.model)
    path = RESULTS_DIR / "synthetic_next_day_low_feeling.json"
    result = json.loads(path.read_text())
    assert round(bundle["threshold"], 4) == result["model"]["threshold"], "model/threshold differs from report"

    df = build_dataset(load_daily(args.data_dir))
    df["eligible"] = df.target.notna() & df.sufficient_data
    new = evaluate(df, bundle)
    for split, pops in result["results"].items():
        for pop, r in pops.items():
            assert new[split][pop] == r, f"frozen model did not reproduce {split}/{pop}"
    result["results"] = new
    result["frozen_reevaluation"] = {
        "model_trained_at": bundle["trained_at"],
        "note": "today_feeling_missing added by re-scoring the saved model at the saved validation threshold; "
                "no retraining or threshold change",
    }
    path.write_text(json.dumps(result, indent=2) + "\n")
    r = new["test"]["today_feeling_missing"]
    print(f"[test / today_feeling_missing] patients={r['n_patients']}")
    for m, v in r["models"].items():
        print(f"  {m}: {json.dumps(v)}")


if __name__ == "__main__":
    main()
