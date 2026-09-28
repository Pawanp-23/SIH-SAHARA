"""Aggregate privacy for commander views: minimum group size + Laplace differential privacy.

Noise is seeded from the query key, so repeating the same query returns the same noisy
answer. That blocks 'ask 100 times and average the noise away' attacks.
"""
import hashlib

import numpy as np

from ..core.config import DP_EPSILON, MIN_GROUP_SIZE


def _rng(key: str) -> np.random.Generator:
    return np.random.default_rng(int(hashlib.sha256(key.encode()).hexdigest()[:12], 16))


def dp_share(flags, key: str, epsilon: float = DP_EPSILON) -> dict:
    """Share of True values in a group, released with Laplace noise (sensitivity 1/n)."""
    flags = np.asarray(flags, dtype=float)
    n = len(flags)
    if n < MIN_GROUP_SIZE:
        return {"n": n, "suppressed": True, "value": None}
    noisy = flags.mean() + _rng(key).laplace(0, 1 / (n * epsilon))
    return {"n": n, "suppressed": False, "value": round(float(np.clip(noisy, 0, 1)), 3)}


def dp_mean(values, lo: float, hi: float, key: str, epsilon: float = DP_EPSILON) -> dict:
    """Mean of bounded values with Laplace noise (sensitivity (hi-lo)/n)."""
    v = np.clip(np.asarray(values, dtype=float), lo, hi)
    n = len(v)
    if n < MIN_GROUP_SIZE:
        return {"n": n, "suppressed": True, "value": None}
    noisy = v.mean() + _rng(key).laplace(0, (hi - lo) / (n * epsilon))
    return {"n": n, "suppressed": False, "value": round(float(np.clip(noisy, lo, hi)), 2)}
