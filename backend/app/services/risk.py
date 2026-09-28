"""Case snapshots and re-scoring when new voluntary evidence arrives."""
import json
import threading

import numpy as np
import pandas as pd

from ..core.config import ARTIFACTS, BAND_MODERATE, DIMENSIONS
from ..core.logging import get_logger
from ..ml.engine import RiskEngine, band
from ..ml.features import FEATURES, compute_features
from . import repository as repo
from .repository import TODAY

log = get_logger("sahara.risk")
PRIORS_PATH = ARTIFACTS / "priors.json"


def _num(v, nd=2):
    return None if v is None or (isinstance(v, float) and np.isnan(v)) else round(float(v), nd)


class RiskService:
    def __init__(self):
        self._engine: RiskEngine | None = None
        self._lock = threading.Lock()

    @property
    def engine(self) -> RiskEngine:
        if self._engine is None:
            with self._lock:
                if self._engine is None:
                    self._engine = RiskEngine.load()
                    log.info("risk engine loaded (%s)", self._engine.version)
        return self._engine

    # ------------------------------------------------------------------ read
    def score_row(self, row: pd.Series) -> dict:
        probs = {d: float(v[0]) for d, v in self.engine.predict(row.to_frame().T).items()}
        ev = self.engine.evidence(row)
        conf = self.engine.confidence(ev, max(probs.values()))
        return {"probs": probs, "evidence": ev, "confidence": conf}

    def snapshot(self, pid: str, *, with_details: bool = True) -> dict:
        f = repo.features(pid)
        f = f[f["day"] <= TODAY]
        row = f[f["day"] == TODAY].iloc[0]
        s = self.score_row(row)
        probs = s["probs"]
        top = max(probs, key=probs.get)
        out = {
            "person_id": pid, "date": row["date"], "model_version": self.engine.version,
            "dimensions": {d: {"label": DIMENSIONS[d][0], "horizon_days": DIMENSIONS[d][1],
                               "probability": round(p, 3), "band": band(p)} for d, p in probs.items()},
            "top_dimension": top, "priority": round(probs[top], 3), "confidence": s["confidence"],
            "evidence": s["evidence"],
            "anomaly": round(float(self.engine.anomaly_score(row.to_frame().T)[0]), 2),
            "operational": {k: _num(row[k], 1) for k in ["night_7", "night_30", "duty_hours_7", "deployed_continuous",
                                                         "days_since_home_leave", "leave_cancelled_90", "transfers_24m",
                                                         "days_since_transfer", "open_needs", "incidents_30"]},
        }
        if not with_details:
            return out
        out["factors"] = {d: self.engine.explain(row, d) for d in DIMENSIONS}
        out["what_would_help"] = self.engine.counterfactuals(row, top) if probs[top] >= BAND_MODERATE else []
        sc = repo.scores(pid)
        sc = sc[sc["day"] <= TODAY]
        out["trend"] = [{"date": r.date, **{d: round(getattr(r, f"p_{d}"), 3) for d in DIMENSIONS}} for r in sc.itertuples()]
        cp = self.engine.change_point(sc[f"p_{top}"]) if len(sc) else None
        out["change_point"] = sc.iloc[cp]["date"] if cp is not None and cp < len(sc) else None
        out["signals"] = self._signals(pid)
        return out

    def _signals(self, pid: str) -> dict:
        """Self-reported energy (7-day mean) against the personal baseline band, for the chart."""
        d = repo.daily(pid)
        d = d[d["day"] <= TODAY]
        e = d["energy"].rolling(7, min_periods=1).mean()
        hist = d["energy"].shift(14)
        med = hist.rolling(90, min_periods=5).median()
        iqr = (hist.rolling(90, min_periods=5).quantile(.75) - hist.rolling(90, min_periods=5).quantile(.25)) / 1.349
        iqr = iqr.clip(lower=0.35)
        pts = [{"date": dt, "value": _num(v), "base": _num(m), "lo": _num(m - s) if m == m else None,
                "hi": _num(m + s) if m == m else None, "observed": not pd.isna(raw)}
               for dt, v, m, s, raw in zip(d["date"], e, med, iqr, d["energy"])]
        return {"signal": "Self-reported energy (7-day mean, 1-5)", "points": pts}

    # ------------------------------------------------------------------ write
    def recompute(self, pid: str) -> dict:
        """Recompute features + scores for one person after new evidence. Returns before/after confidence."""
        before = self.snapshot(pid, with_details=False)
        daily = repo.daily(pid)
        daily["is_future"] = daily["is_future"].astype(bool)
        people = repo.people()
        priors = {k: tuple(v) for k, v in json.loads(PRIORS_PATH.read_text()).items()}
        feats = compute_features(daily, people[people["person_id"] == pid], priors)
        old = repo.features(pid)[["day", "unit_night_7", "unit_duty_hours_7"]]
        feats = feats.drop(columns=["unit_night_7", "unit_duty_hours_7"]).merge(old, on="day", how="left")
        feats = feats[["person_id", "day", "date"] + FEATURES]
        repo.replace_person_rows("features", pid, feats)
        repo.replace_person_rows("scores", pid, score_frame(self.engine, feats))
        after = self.snapshot(pid, with_details=False)
        log.info("re-scored %s: confidence %.2f -> %.2f", pid, before["confidence"]["value"], after["confidence"]["value"])
        return {"before": before, "after": after}


def score_frame(engine: RiskEngine, feats: pd.DataFrame) -> pd.DataFrame:
    p = engine.predict(feats)
    out = feats[["person_id", "day", "date"]].copy()
    for d, v in p.items():
        out[f"p_{d}"] = v
    return out


risk_service = RiskService()
