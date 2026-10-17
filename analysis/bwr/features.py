"""Causal wearable features. Every feature for date t uses only rows dated <= t of the same patient;
personal baselines use only rows dated strictly before t."""
import numpy as np
import pandas as pd

SIGNALS = [
    "steps",
    "active_minutes",
    "resting_heart_rate",
    "hrv_rmssd_ms",
    "sleep_minutes",
    "sleep_efficiency_pct",
    "times_woke_up",
    "skin_temp_change_c",
]
WEAR = "minutes_watch_worn"
# Columns that must never be used as model inputs (outcomes, future/clinical info, free text).
FORBIDDEN_INPUTS = [
    "daily_feeling_1_to_5",
    "weekly_fatigue_0_to_4",
    "weekly_nausea_0_to_4",
    "weekly_pain_0_to_4",
    "weekly_appetite_loss_0_to_4",
    "weekly_diarrhea_0_to_4",
    "weekly_trouble_sleeping_0_to_4",
    "weekly_anxiety_0_to_4",
    "weekly_sadness_0_to_4",
    "coaching_call",
    "events",
    "diary_note",
]
BASELINE_WINDOW = "28D"
MIN_BASELINE_OBS = 7
RECENT_WINDOW = "3D"
COVERAGE_WINDOW = "7D"
Z_CLIP = 5.0


def feature_columns():
    cols = []
    for s in SIGNALS:
        cols += [f"{s}_today", f"{s}_dev_z", f"{s}_recent_dev_z", f"{s}_missing_today"]
    cols += [f"{WEAR}_today", f"{WEAR}_dev_z", "wearable_days_last_7", "baseline_days"]
    return cols


def signal_of_feature(col):
    for s in SIGNALS + [WEAR]:
        if col.startswith(s + "_"):
            return s
    return "coverage"


def _z(value, mean, std):
    # Floor the spread so near-constant baselines do not explode; NaN stays NaN (unknown, not "normal").
    floor = np.maximum(np.abs(mean) * 0.05, 1e-3)
    z = (value - mean) / np.maximum(std.fillna(0), floor)
    return z.clip(-Z_CLIP, Z_CLIP)


def _patient_features(g):
    g = g.set_index("date")
    out = pd.DataFrame(index=g.index)
    for s in SIGNALS + [WEAR]:
        x = g[s].astype(float)
        base = x.rolling(BASELINE_WINDOW, closed="left", min_periods=MIN_BASELINE_OBS)
        mean, std = base.mean(), base.std()
        out[f"{s}_today"] = x
        out[f"{s}_dev_z"] = _z(x, mean, std)
        out[f"_{s}_baseline"] = mean
        if s != WEAR:
            recent = x.rolling(RECENT_WINDOW, min_periods=1).mean()
            out[f"{s}_recent_dev_z"] = _z(recent, mean, std)
            out[f"_{s}_recent"] = recent
            out[f"{s}_missing_today"] = x.isna().astype(float)
    worn = g["steps"].notna().astype(float)
    out["wearable_days_last_7"] = worn.rolling(COVERAGE_WINDOW, min_periods=1).sum()
    out["baseline_days"] = g["steps"].rolling(BASELINE_WINDOW, closed="left", min_periods=1).count().fillna(0)
    return out.reset_index()


def build_features(daily):
    """daily: one row per patient-day with patient_id, date and wearable columns.
    Returns one row per input row with feature columns (+ private `_`-prefixed explanation columns)."""
    df = daily[["patient_id", "date"] + SIGNALS + [WEAR]].copy()
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values(["patient_id", "date"])
    if df.duplicated(["patient_id", "date"]).any():
        raise ValueError("duplicate patient_id/date rows")
    parts = [_patient_features(g).assign(patient_id=pid) for pid, g in df.groupby("patient_id", sort=False)]
    feats = pd.concat(parts, ignore_index=True)
    feats["sufficient_data"] = (feats["baseline_days"] >= MIN_BASELINE_OBS) & (feats["wearable_days_last_7"] >= 1)
    return feats
