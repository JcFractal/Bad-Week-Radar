import pandas as pd

FEELING = "daily_feeling_1_to_5"
LOW_FEELING_MAX = 2


def add_labels(daily, feats):
    """Attach next-calendar-day target and today's feeling (persistence baseline only, never a model input).
    Target is NaN (unknown) when the next calendar day has no row or no feeling response."""
    d = daily[["patient_id", "date", FEELING]].copy()
    d["date"] = pd.to_datetime(d["date"])
    nxt = d.rename(columns={FEELING: "next_day_feeling"})
    nxt["date"] = nxt["date"] - pd.Timedelta(days=1)
    out = feats.merge(d.rename(columns={FEELING: "today_feeling"}), on=["patient_id", "date"], how="left")
    out = out.merge(nxt, on=["patient_id", "date"], how="left")
    out["target"] = (out["next_day_feeling"] <= LOW_FEELING_MAX).astype(float).where(out["next_day_feeling"].notna())
    # New-onset subset: at least one feeling response in days t-6..t and none of them low.
    out = out.sort_values(["patient_id", "date"])
    low = (out["today_feeling"] <= LOW_FEELING_MAX).astype(float).where(out["today_feeling"].notna())
    tmp = out[["patient_id", "date"]].assign(low=low)
    roll = tmp.set_index("date").groupby("patient_id")["low"].rolling("7D", min_periods=1)
    out["recent_low_count"] = roll.sum().values
    out["recent_resp_count"] = roll.count().values
    out["new_onset_eligible"] = (out["recent_resp_count"] >= 1) & (out["recent_low_count"] == 0)
    return out.reset_index(drop=True)
