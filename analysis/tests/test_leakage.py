"""Patient separation, temporal leakage and privacy checks. Uses generated toy data (no restricted data)."""
import subprocess
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from bwr.config import REPO_ROOT
from bwr.features import FORBIDDEN_INPUTS, SIGNALS, WEAR, build_features, feature_columns
from bwr.labels import add_labels
from bwr.modeling import fit_model
from bwr.scoring import analyze
from bwr.split import patient_split


def toy_daily(n_patients=6, n_days=70, seed=0):
    rng = np.random.default_rng(seed)
    rows = []
    for p in range(n_patients):
        for d, date in enumerate(pd.date_range("2024-01-01", periods=n_days)):
            worn = rng.random() > 0.15
            r = {"patient_id": f"T{p:03d}", "date": date, "day_in_program": d + 1,
                 WEAR: int(rng.integers(900, 1440)) if worn else int(rng.integers(0, 60)),
                 "daily_feeling_1_to_5": float(rng.integers(1, 6)) if rng.random() > 0.4 else np.nan}
            for s in SIGNALS:
                r[s] = float(rng.normal(50, 10)) if worn else np.nan
            rows.append(r)
    return pd.DataFrame(rows)


def toy_bundle(daily):
    df = add_labels(daily, build_features(daily))
    df = df[df.target.notna()]
    feats = feature_columns()
    return {"pipeline": fit_model(df[feats], df.target.astype(int)), "features": feats,
            "threshold": 0.3, "threshold_rule": "test", "model_version": "test"}


def perturb_future(daily, cutoff, seed=1):
    rng = np.random.default_rng(seed)
    d = daily.copy()
    fut = d.date > cutoff
    for s in SIGNALS + [WEAR, "daily_feeling_1_to_5"]:
        d[s] = d[s].astype(float)
        d.loc[fut, s] = rng.permutation(d.loc[fut, s].astype(float).values) * 3 + 7
    d.loc[fut & (rng.random(len(d)) < 0.5), "steps"] = np.nan
    return d


# ---------- patient separation ----------
def test_split_deterministic_and_disjoint():
    ids = [f"P{i:05d}" for i in range(1, 3001)]
    a = {i: patient_split(i) for i in ids}
    b = {i: patient_split(i) for i in reversed(ids)}
    assert a == b
    sets = {s: {i for i, v in a.items() if v == s} for s in ("train", "val", "test")}
    assert not (sets["train"] & sets["val"]) and not (sets["train"] & sets["test"]) and not (sets["val"] & sets["test"])
    assert sum(map(len, sets.values())) == len(ids)
    assert 0.5 < len(sets["train"]) / len(ids) < 0.7


def test_all_rows_of_a_patient_share_one_split():
    daily = toy_daily()
    df = build_features(daily)
    df["split"] = df.patient_id.map(patient_split)
    assert (df.groupby("patient_id").split.nunique() == 1).all()


# ---------- temporal leakage ----------
def test_features_only_use_past_and_present():
    daily = toy_daily()
    full = build_features(daily).set_index(["patient_id", "date"])
    cols = feature_columns() + [c for c in full.columns if c.startswith("_")]
    for cutoff in pd.to_datetime(["2024-01-05", "2024-01-20", "2024-02-10"]):
        trunc = build_features(daily[daily.date <= cutoff]).set_index(["patient_id", "date"])
        pd.testing.assert_frame_equal(trunc[cols], full.loc[trunc.index, cols])


def test_changing_future_data_cannot_change_earlier_prediction():
    daily = toy_daily()
    bundle = toy_bundle(daily)
    cutoff = pd.Timestamp("2024-02-01")
    base = analyze(daily, bundle)
    pert = analyze(perturb_future(daily, cutoff), bundle)
    keep = pd.to_datetime(base.prediction_date) <= cutoff
    pd.testing.assert_frame_equal(base[keep].reset_index(drop=True), pert[keep.values].reset_index(drop=True))
    assert not base[~keep].reset_index(drop=True).equals(pert[~keep.values].reset_index(drop=True))


def test_baseline_excludes_today():
    daily = toy_daily()
    t = pd.Timestamp("2024-02-01")
    bumped = daily.copy()
    bumped.loc[bumped.date == t, "steps"] += 1000
    a = build_features(daily).set_index(["patient_id", "date"])
    b = build_features(bumped).set_index(["patient_id", "date"])
    idx = a.index.get_level_values("date") == t
    pd.testing.assert_series_equal(a.loc[idx, "_steps_baseline"], b.loc[idx, "_steps_baseline"])
    worn = a.loc[idx, "steps_today"].notna().values
    assert (b.loc[idx, "steps_dev_z"].values[worn] > a.loc[idx, "steps_dev_z"].values[worn]).all()


def test_no_forbidden_inputs():
    feats = feature_columns()
    for col in FORBIDDEN_INPUTS:
        assert all(not f.startswith(col) for f in feats), col
    assert not any("feeling" in f or "weekly" in f or "event" in f or "diary" in f for f in feats)


def test_features_ignore_outcome_and_clinical_columns():
    daily = toy_daily()
    a = build_features(daily)
    d2 = daily.assign(daily_feeling_1_to_5=1.0, events="ER visit", diary_note="awful", weekly_fatigue_0_to_4=4)
    pd.testing.assert_frame_equal(a, build_features(d2))


# ---------- labels / missingness ----------
def test_next_day_label_uses_calendar_date_and_unknown_is_not_negative():
    daily = toy_daily(n_patients=1, n_days=10)
    daily["daily_feeling_1_to_5"] = [4, 2, np.nan, 1, 5, 5, 3, 2, 4, 1]
    daily = daily.drop(index=5)  # remove 2024-01-06: day 5's next calendar day is absent
    lab = add_labels(daily, build_features(daily)).set_index("date")
    assert lab.loc["2024-01-01", "target"] == 1.0  # next day feeling 2
    assert np.isnan(lab.loc["2024-01-02", "target"])  # next day skipped -> unknown
    assert np.isnan(lab.loc["2024-01-05", "target"])  # next calendar day missing (not the next row)
    assert lab.loc["2024-01-07", "target"] == 1.0
    assert np.isnan(lab.loc["2024-01-10", "target"])  # no next day at all


def test_missing_wearable_is_not_zero_activity():
    daily = toy_daily()
    f = build_features(daily)
    off = daily.sort_values(["patient_id", "date"]).steps.isna().values
    assert off.any()
    assert f.loc[off, "steps_today"].isna().all()
    assert (f.loc[off, "steps_missing_today"] == 1).all()
    assert f.loc[off, "steps_dev_z"].isna().all()  # unknown, not "normal" and not a drop to zero


def test_preprocessing_fit_on_training_rows_only():
    daily = toy_daily()
    df = add_labels(daily, build_features(daily))
    df = df[df.target.notna()]
    feats = feature_columns()
    tr = df[df.patient_id.isin(["T000", "T001", "T002"])]
    model = fit_model(tr[feats], tr.target.astype(int))
    np.testing.assert_allclose(model.named_steps["impute"].statistics_,
                               tr[feats].median().fillna(0).values, equal_nan=True)


# ---------- privacy ----------
def test_no_restricted_data_tracked_in_git():
    try:
        files = subprocess.run(["git", "ls-files"], cwd=REPO_ROOT, capture_output=True, text=True, check=True).stdout.split()
    except Exception:
        pytest.skip("git not available")
    bad = [f for f in files if f.endswith((".csv", ".zip", ".joblib", ".pkl", ".parquet"))
           or (f.endswith(".json") and not f.startswith("analysis/results/") and Path(f).name not in
               ("package.json", "package-lock.json") and not Path(f).name.startswith("tsconfig"))]
    assert not bad, bad
