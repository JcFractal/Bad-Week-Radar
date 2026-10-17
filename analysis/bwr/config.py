import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.environ.get("BWR_DATA_DIR", Path.home() / "bwr_data")).expanduser()
OUTPUT_DIR = Path(os.environ.get("BWR_OUTPUT_DIR", Path.home() / "bwr_outputs")).expanduser()
RESULTS_DIR = REPO_ROOT / "analysis" / "results"


def ensure_outside_repo(path):
    """Patient-level outputs must never be written inside the (public) git repository."""
    p = Path(path).expanduser().resolve()
    if p == REPO_ROOT or REPO_ROOT in p.parents:
        raise SystemExit(f"Refusing to write patient-level output inside the repo: {p}")
    return p
