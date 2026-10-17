import hashlib

SPLIT_SALT = "bwr-split-v1"


def patient_split(patient_id, train=60, val=20):
    """Deterministic patient-level split (~60/20/20) by salted hash; independent of row order."""
    b = int(hashlib.sha256(f"{SPLIT_SALT}:{patient_id}".encode()).hexdigest(), 16) % 100
    return "train" if b < train else ("val" if b < train + val else "test")
