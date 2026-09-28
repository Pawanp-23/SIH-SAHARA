"""Risk engine: training, calibrated scoring, explanations, counterfactuals and confidence.

Outputs are non-diagnostic welfare risk estimates. A 'High' band means the model sees a
high probability that this person's strain will cross the welfare threshold within the
dimension's horizon, and only ever triggers a human review.
"""
import itertools
import json
from dataclasses import dataclass, field

import joblib
import numpy as np
import pandas as pd
import ruptures as rpt
import shap
from sklearn.ensemble import IsolationForest
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from xgboost import XGBClassifier

from ..core.config import ARTIFACTS, BAND_HIGH, BAND_MODERATE, DIMENSIONS, SEED
from ..core.errors import ModelNotReady
from ..core.logging import get_logger
from .features import ACTIONABLE, FEATURES, INDIVIDUAL, LABELS, OPERATIONAL

log = get_logger("sahara.engine")
MODEL_PATH = ARTIFACTS / "risk_models.joblib"
METRICS_PATH = ARTIFACTS / "metrics.json"
MODEL_VERSION = "sahara-risk-1.0.0"

Z_FEATURES = [f for f in INDIVIDUAL if f.endswith("_z")]


def band(p: float) -> str:
    return "High" if p >= BAND_HIGH else "Moderate" if p >= BAND_MODERATE else "Low"


def _ece(y, p, bins=10) -> float:
    edges = np.linspace(0, 1, bins + 1)
    idx = np.clip(np.digitize(p, edges) - 1, 0, bins - 1)
    return float(sum(abs(y[idx == b].mean() - p[idx == b].mean()) * (idx == b).mean() for b in range(bins) if (idx == b).any()))


def _xgb(n=300):
    return XGBClassifier(n_estimators=n, max_depth=4, learning_rate=0.05, subsample=0.8, colsample_bytree=0.8,
                         min_child_weight=5, reg_lambda=2.0, eval_metric="logloss", random_state=SEED, n_jobs=4)


@dataclass
class RiskEngine:
    models: dict = field(default_factory=dict)        # dim -> XGBClassifier
    calibrators: dict = field(default_factory=dict)   # dim -> IsotonicRegression
    anomaly: IsolationForest | None = None
    version: str = MODEL_VERSION
    _explainers: dict = field(default_factory=dict, repr=False)

    # ------------------------------------------------------------------ training
    @classmethod
    def train(cls, feats: pd.DataFrame, labels: pd.DataFrame, daily: pd.DataFrame, thresholds: dict,
              people: pd.DataFrame) -> "RiskEngine":
        eng = cls()
        data = feats.merge(labels, on=["person_id", "day"])
        data = data[data["day"] >= 21]
        persons = np.array(sorted(data["person_id"].unique()))
        rng = np.random.default_rng(SEED)
        rng.shuffle(persons)
        n = len(persons)
        split = {"train": set(persons[: int(.6 * n)]), "calib": set(persons[int(.6 * n): int(.8 * n)]), "test": set(persons[int(.8 * n):])}
        part = {k: data[data["person_id"].isin(v)] for k, v in split.items()}
        metrics = {"model_version": eng.version, "data": "SIMULATED (synthetic personnel, seed 26186)",
                   "n_persons": {k: len(v) for k, v in split.items()}, "dimensions": {}}
        for dim in DIMENSIONS:
            y = f"y_{dim}"
            tr, ca, te = (part[k].dropna(subset=[y]) for k in ("train", "calib", "test"))
            m = _xgb().fit(tr[FEATURES], tr[y])
            iso = IsotonicRegression(out_of_bounds="clip").fit(m.predict_proba(ca[FEATURES])[:, 1], ca[y])
            eng.models[dim], eng.calibrators[dim] = m, iso
            p = iso.predict(m.predict_proba(te[FEATURES])[:, 1])
            yt = te[y].to_numpy()
            ops = _xgb(200).fit(tr[OPERATIONAL], tr[y])
            p_ops = ops.predict_proba(te[OPERATIONAL])[:, 1]
            metrics["dimensions"][dim] = {
                "label": DIMENSIONS[dim][0], "horizon_days": DIMENSIONS[dim][1], "prevalence": round(float(yt.mean()), 3),
                "auroc": round(float(roc_auc_score(yt, p)), 3), "pr_auc": round(float(average_precision_score(yt, p)), 3),
                "brier": round(float(brier_score_loss(yt, p)), 4), "ece": round(_ece(yt, p), 4),
                "baseline_hrms_only_auroc": round(float(roc_auc_score(yt, p_ops)), 3),
                "baseline_hrms_only_pr_auc": round(float(average_precision_score(yt, p_ops)), 3),
                "baseline_rule_auroc": round(float(roc_auc_score(yt, te["night_7"] + te["duty_hours_7"] / 4)), 3),
                "precision_at_high": round(float(yt[p >= BAND_HIGH].mean()) if (p >= BAND_HIGH).any() else 0.0, 3),
                "recall_at_high": round(float(p[yt == 1].__ge__(BAND_HIGH).mean()), 3),
            }
            log.info("trained %s: %s", dim, metrics["dimensions"][dim])
        eng.anomaly = IsolationForest(n_estimators=200, contamination=0.05, random_state=SEED).fit(
            part["train"][Z_FEATURES].fillna(0).sample(min(20000, len(part["train"])), random_state=SEED))
        metrics["lead_time"] = eng._lead_time(feats, daily, thresholds, split["test"])
        metrics["fairness"] = eng._fairness(part["test"], people)
        METRICS_PATH.write_text(json.dumps(metrics, indent=2))
        joblib.dump({"models": eng.models, "calibrators": eng.calibrators, "anomaly": eng.anomaly, "version": eng.version}, MODEL_PATH)
        return eng

    def _lead_time(self, feats, daily, thresholds, test_persons) -> dict:
        """Warning time before burnout onsets, model vs a duty-load rule at the SAME alert budget.

        The model alerts at Moderate+ (what reaches a welfare officer). The rule's threshold is set
        so it raises the same share of alerts, which keeps the comparison fair.
        """
        dim = "burnout"
        f = feats[feats["person_id"].isin(test_persons) & (feats["day"] < 180)].copy()
        f["p"] = self.predict(f)[dim]
        f["rule"] = f["night_7"] + f["duty_hours_7"] / 4
        m_alert = f["p"] >= BAND_MODERATE
        rule_thr = float(f["rule"].quantile(1 - m_alert.mean()))
        f["m_hit"], f["r_hit"] = m_alert, f["rule"] >= rule_thr
        lat = daily.set_index(["person_id", "day"])[f"lat_{dim}"]
        leads_m, leads_r, onsets = [], [], 0
        for pid, g in f.groupby("person_id"):
            above = lat.loc[pid].to_numpy()[:180] > thresholds[dim]
            for t in range(45, 180):
                if above[t] and not above[t - 14:t].any():
                    onsets += 1
                    w = g[(g["day"] >= t - 30) & (g["day"] < t)]
                    if w["m_hit"].any():
                        leads_m.append(t - w.loc[w["m_hit"], "day"].min())
                    if w["r_hit"].any():
                        leads_r.append(t - w.loc[w["r_hit"], "day"].min())
        return {"dimension": dim, "onsets": onsets, "alert_rate": round(float(m_alert.mean()), 3),
                "model_detected": len(leads_m), "model_median_lead_days": float(np.median(leads_m)) if leads_m else None,
                "rule_detected": len(leads_r), "rule_median_lead_days": float(np.median(leads_r)) if leads_r else None}

    def _fairness(self, test: pd.DataFrame, people: pd.DataFrame) -> dict:
        """Burnout recall and false-alert rate per cohort. Cohorts are for audit only, never model inputs."""
        t = test.dropna(subset=["y_burnout"]).merge(people[["person_id", "duty_type", "rank_band"]], on="person_id")
        t["p"] = self.predict(t)["burnout"]
        t["alert"] = t["p"] >= BAND_HIGH
        out = {}
        for col in ("duty_type", "rank_band"):
            rows = {}
            for grp, g in t.groupby(col):
                pos, neg = g[g["y_burnout"] == 1], g[g["y_burnout"] == 0]
                rows[grp] = {"n": int(len(g)), "recall": round(float(pos["alert"].mean()), 3) if len(pos) else None,
                             "false_alert_rate": round(float(neg["alert"].mean()), 3) if len(neg) else None}
            out[col] = rows
        return out

    # ------------------------------------------------------------------ loading / scoring
    @classmethod
    def load(cls) -> "RiskEngine":
        if not MODEL_PATH.exists():
            raise ModelNotReady("Models are not trained yet. Run: python -m scripts.seed")
        blob = joblib.load(MODEL_PATH)
        return cls(models=blob["models"], calibrators=blob["calibrators"], anomaly=blob["anomaly"], version=blob["version"])

    def predict(self, X: pd.DataFrame) -> dict:
        """Calibrated probabilities, clipped to [0.02, 0.97]: the model never claims certainty."""
        Xf = X[FEATURES].astype(float)
        return {d: np.clip(self.calibrators[d].predict(m.predict_proba(Xf)[:, 1]), 0.02, 0.97) for d, m in self.models.items()}

    def anomaly_score(self, X: pd.DataFrame) -> np.ndarray:
        """0..1, higher = more unusual individual pattern."""
        s = -self.anomaly.score_samples(X[Z_FEATURES].fillna(0))
        return np.clip((s - 0.35) / 0.35, 0, 1)

    def explain(self, row: pd.Series, dim: str, k: int = 3) -> list[dict]:
        if dim not in self._explainers:
            self._explainers[dim] = shap.TreeExplainer(self.models[dim])
        sv = self._explainers[dim].shap_values(row[FEATURES].to_frame().T.astype(float))[0]
        order = np.argsort(-sv)
        out = []
        for i in order[:k]:
            if sv[i] <= 0:
                break
            f = FEATURES[i]
            out.append({"feature": f, "label": LABELS[f], "value": None if pd.isna(row[f]) else round(float(row[f]), 2),
                        "impact": round(float(sv[i]), 3)})
        return out

    def counterfactuals(self, row: pd.Series, dim: str) -> list[dict]:
        """Smallest set of actionable changes that lowers the risk band (model what-if, not causal)."""
        actions = {
            "reduce_nights": ("Reduce night duties by 2 next week", {"night_7": lambda v: max(0, v - 2), "night_30": lambda v: max(0, v - 2)}),
            "recovery_window": ("Give a 3-day recovery window", {"consec_duty_days": lambda v: 0, "rest_days_14": lambda v: v + 3, "duty_hours_7": lambda v: v * 4 / 7}),
            "grant_leave": ("Approve pending home leave", {"days_since_home_leave": lambda v: 0, "leave_cancelled_90": lambda v: 0}),
            "defer_training": ("Defer non-critical training", {"training_hours_30": lambda v: 0}),
            "resolve_need": ("Resolve open welfare need", {"open_needs": lambda v: 0, "need_age": lambda v: 0}),
        }
        base = row[FEATURES].to_frame().T.astype(float)
        p0 = float(self.predict(base)[dim][0])
        results = []
        for r in (1, 2):
            for combo in itertools.combinations(actions, r):
                x = base.copy()
                for key in combo:
                    for f, fn in actions[key][1].items():
                        x[f] = x[f].apply(fn)
                p1 = float(self.predict(x)[dim][0])
                results.append({"actions": [actions[k][0] for k in combo], "keys": list(combo),
                                "from": round(p0, 3), "to": round(p1, 3), "from_band": band(p0), "to_band": band(p1)})
        results.sort(key=lambda r: (len(r["keys"]), r["to"]))
        improving = [r for r in results if r["to_band"] != r["from_band"] and r["to"] < r["from"]]
        best = improving[:3] if improving else sorted(results, key=lambda r: r["to"])[:2]
        return best

    # ------------------------------------------------------------------ confidence
    @staticmethod
    def evidence(row: pd.Series) -> dict:
        def fresh(age, tau):
            return float(np.exp(-age / tau))

        def elevated(*vals):
            v = [x for x in vals if not pd.isna(x)]
            return bool(v) and bool(max(v) > 1.0)

        ops_elev = bool(row["night_7"] >= 3 or row["duty_hours_7"] >= 10 or row["deployed_continuous"] >= 21 or row["days_since_home_leave"] >= 75)
        return {
            "operational": {"freshness": 1.0, "age_days": 0, "elevated": ops_elev, "source": "HRMS"},
            "cognitive": {"freshness": fresh(row["days_since_pvt"], 10), "age_days": int(row["days_since_pvt"]),
                          "elevated": elevated(row["rt_z"], row["lapses_z"]), "source": "Readiness test"},
            "physiological": {"freshness": fresh(row["days_since_physio"], 10), "age_days": int(row["days_since_physio"]),
                              "elevated": elevated(row["hr_z"], row["hrv_z"], row["sleep_hours_z"]), "source": "Heart rate / sleep"},
            "self_report": {"freshness": fresh(row["days_since_checkin"], 7), "age_days": int(row["days_since_checkin"]),
                            "elevated": elevated(row["energy_z"], row["sleep_quality_z"], row["who5_z"], row["burnout_pulse_z"]),
                            "source": "Check-in / WHO-5"},
        }

    @staticmethod
    def confidence(evidence: dict, p_max: float) -> dict:
        coverage = np.mean([e["freshness"] for e in evidence.values()])
        concern = p_max >= BAND_MODERATE
        agree = sum(e["freshness"] for e in evidence.values() if e["elevated"] == concern) / len(evidence)
        margin = abs(p_max - 0.5) * 2
        value = float(np.clip(0.5 * coverage + 0.35 * agree + 0.15 * margin, 0.05, 0.97))
        missing = [k for k, e in evidence.items() if e["freshness"] < 0.35]
        discordant = [k for k, e in evidence.items() if e["freshness"] >= 0.35 and e["elevated"] != concern]
        return {"value": round(value, 2), "coverage": round(float(coverage), 2), "agreement": round(float(agree), 2),
                "missing_domains": missing, "discordant_domains": discordant,
                "next_best_evidence": ("90-second readiness check + check-in" if {"cognitive", "self_report"} & set(missing)
                                       else "Heart-rate check" if "physiological" in missing else None)}

    @staticmethod
    def change_point(series: pd.Series) -> int | None:
        """Most recent structural change in a daily series (index position), if any."""
        x = series.ffill().bfill().to_numpy(dtype=float)
        if len(x) < 30 or np.nanstd(x) == 0:
            return None
        try:
            bkps = rpt.Pelt(model="rbf", min_size=10).fit(x.reshape(-1, 1)).predict(pen=8)
        except Exception:  # ruptures can fail on degenerate series; a missing marker is acceptable
            log.warning("change-point detection failed", exc_info=True)
            return None
        bkps = [b for b in bkps if b < len(x)]
        return int(bkps[-1]) if bkps else None
