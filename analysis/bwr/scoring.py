"""Inference + explanation for the frontend contract."""
import numpy as np
import pandas as pd

from .features import SIGNALS, WEAR, build_features, signal_of_feature

SCORE_TYPE = "uncalibrated_logistic_score"
SIGNAL_LABELS = {
    "steps": "Steps",
    "active_minutes": "Active minutes",
    "resting_heart_rate": "Resting heart rate",
    "hrv_rmssd_ms": "Heart rate variability (RMSSD)",
    "sleep_minutes": "Sleep duration",
    "sleep_efficiency_pct": "Sleep efficiency",
    "times_woke_up": "Night awakenings",
    "skin_temp_change_c": "Skin temperature change",
    WEAR: "Watch wear time",
}
MIN_CONTRIBUTION = 0.05
MAX_CHANGES = 3


def score_features(feats, bundle):
    X = feats[bundle["features"]]
    pipe = bundle["pipeline"]
    score = pipe.predict_proba(X)[:, 1]
    scaled = pipe[:-1].transform(X)
    contrib = pd.DataFrame(scaled * pipe[-1].coef_[0], columns=bundle["features"], index=feats.index)
    return score, contrib


def _num(x, nd=2):
    return None if x is None or pd.isna(x) else round(float(x), nd)


def _changes(row, contrib_row):
    by_signal = {}
    for col, c in contrib_row.items():
        if col.endswith("_missing_today"):
            continue  # missingness is reported under data_coverage, never as a wearable "change"
        s = signal_of_feature(col)
        if s != "coverage":
            by_signal[s] = by_signal.get(s, 0.0) + c
    changes = []
    for s, c in sorted(by_signal.items(), key=lambda kv: -kv[1]):
        if c < MIN_CONTRIBUTION or len(changes) >= MAX_CHANGES:
            break
        base, today = row.get(f"_{s}_baseline"), row.get(f"{s}_today")
        recent = row.get(f"_{s}_recent", np.nan)
        value, window = (today, "today") if pd.notna(today) else (recent, "last_3_days")
        if pd.isna(value) or pd.isna(base):
            continue
        pct = 100 * (value - base) / abs(base) if base not in (0,) and s != "skin_temp_change_c" else None
        changes.append({
            "signal": s,
            "label": SIGNAL_LABELS[s],
            "direction": "up" if value > base else ("down" if value < base else "flat"),
            "window": window,
            "value": _num(value),
            "baseline_28d": _num(base),
            "pct_change_vs_baseline": _num(pct, 1),
            "z_vs_baseline": _num(row.get(f"{s}_dev_z") if window == "today" else row.get(f"{s}_recent_dev_z")),
            "score_contribution": _num(c, 3),
        })
    return changes


def analyze(daily, bundle):
    """daily: one patient's (or several patients') daily rows. Returns DataFrame of per-day analysis records."""
    feats = build_features(daily)
    score, contrib = score_features(feats, bundle)
    thr = bundle["threshold"]
    recs = []
    for i, row in feats.iterrows():
        ok = bool(row["sufficient_data"])
        s = float(score[i]) if ok else None
        missing = [sig for sig in SIGNALS if pd.isna(row[f"{sig}_today"])]
        recs.append({
            "patient_id": row["patient_id"],
            "prediction_date": row["date"].strftime("%Y-%m-%d"),
            "target_date": (row["date"] + pd.Timedelta(days=1)).strftime("%Y-%m-%d"),
            "horizon_days": 1,
            "status": "insufficient_data" if not ok else ("alert" if s >= thr else "no_alert"),
            "score": None if s is None else round(s, 4),
            "score_type": SCORE_TYPE,
            "threshold": round(thr, 4),
            "contributing_changes": _changes(row, contrib.loc[i]) if ok else [],
            "data_coverage": {
                "watch_worn_minutes_today": _num(row[f"{WEAR}_today"], 0),
                "wearable_days_last_7": int(row["wearable_days_last_7"]),
                "baseline_days_available": int(row["baseline_days"]),
                "baseline_window_days": 28,
                "signals_missing_today": missing,
            },
        })
    return pd.DataFrame(recs)
