"""Optional checks against the local restricted data (skipped when data or model are absent)."""
import json
from pathlib import Path

import joblib
import pandas as pd
import pytest

from bwr import MODEL_VERSION
from bwr.config import DATA_DIR, OUTPUT_DIR
from bwr.scoring import analyze
from tests.test_leakage import perturb_future

PJ = Path(DATA_DIR) / "synthetic_250_patients.json"
MODEL = Path(OUTPUT_DIR) / "model" / f"{MODEL_VERSION}.joblib"
pytestmark = pytest.mark.skipif(not (PJ.exists() and MODEL.exists()), reason="local data/model not available")


def test_real_patient_future_perturbation_does_not_change_past_predictions():
    patients = json.loads(PJ.read_text())["patients"][:3]
    bundle = joblib.load(MODEL)
    for p in patients:
        d = pd.DataFrame(p["days"]).assign(patient_id=p["patient_id"])
        d["date"] = pd.to_datetime(d["date"])
        cutoff = d.date.iloc[len(d) // 2]
        base, pert = analyze(d, bundle), analyze(perturb_future(d, cutoff), bundle)
        keep = (pd.to_datetime(base.prediction_date) <= cutoff).values
        pd.testing.assert_frame_equal(base[keep].reset_index(drop=True), pert[keep].reset_index(drop=True))
