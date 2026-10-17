import numpy as np
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, precision_recall_curve, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


def make_pipeline():
    return Pipeline([
        ("impute", SimpleImputer(strategy="median", keep_empty_features=True)),
        ("scale", StandardScaler()),
        ("lr", LogisticRegression(C=1.0, max_iter=5000)),
    ])


def fit_model(X_train, y_train):
    """Imputer, scaler and classifier are all fit on training rows only."""
    return make_pipeline().fit(X_train, y_train)


def select_threshold_max_f1(y_val, score_val):
    p, r, t = precision_recall_curve(y_val, score_val)
    f1 = np.where((p + r) > 0, 2 * p * r / np.maximum(p + r, 1e-12), 0)[:-1]
    i = int(np.argmax(f1))
    return float(t[i])


def _r(x, nd=4):
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), nd)


def metrics(y, score, alert):
    y = np.asarray(y).astype(int)
    alert = np.asarray(alert).astype(bool)
    n, pos = len(y), int(y.sum())
    both = 0 < pos < n
    tp = int((alert & (y == 1)).sum())
    return {
        "n_patient_days": n,
        "n_positive": pos,
        "prevalence": _r(pos / n if n else None),
        "auroc": _r(roc_auc_score(y, score)) if both else None,
        "pr_auc": _r(average_precision_score(y, score)) if both else None,
        "precision": _r(tp / alert.sum()) if alert.sum() else None,
        "recall": _r(tp / pos) if pos else None,
        "alerts_per_100_patient_days": _r(100 * alert.mean() if n else None, 2),
        "n_alerts": int(alert.sum()),
        "true_positive_alerts": tp,
    }


def patient_bootstrap_ci(y, score, groups, n_boot=200, seed=0):
    """95% percentile CI for AUROC / PR-AUC, resampling patients (not rows)."""
    y, score, groups = np.asarray(y).astype(int), np.asarray(score), np.asarray(groups)
    uniq = np.unique(groups)
    idx_by_g = {g: np.flatnonzero(groups == g) for g in uniq}
    rng = np.random.default_rng(seed)
    au, ap = [], []
    for _ in range(n_boot):
        idx = np.concatenate([idx_by_g[g] for g in rng.choice(uniq, len(uniq), replace=True)])
        yy = y[idx]
        if 0 < yy.sum() < len(yy):
            au.append(roc_auc_score(yy, score[idx]))
            ap.append(average_precision_score(yy, score[idx]))
    q = lambda a: [_r(np.percentile(a, 2.5)), _r(np.percentile(a, 97.5))] if a else None
    return {"auroc_95ci": q(au), "pr_auc_95ci": q(ap), "n_boot": n_boot, "resampling_unit": "patient"}
