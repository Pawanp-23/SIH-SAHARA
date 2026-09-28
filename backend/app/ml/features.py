"""Feature engineering: operational HRMS indicators + personal-baseline deviations.

All features at day t use only data up to and including day t (no look-ahead).
Individual signals are compared with the person's own robust baseline (median / IQR
over days t-104..t-14), shrunk towards a population prior while history is short.
"""
import numpy as np
import pandas as pd

from ..core.config import DIMENSIONS, N_DAYS

OPERATIONAL = [
    "night_7", "night_30", "duty_hours_7", "duty_hours_30", "duty_slope_30", "consec_duty_days",
    "rest_days_14", "deployed_continuous", "days_since_home_leave", "leave_cancelled_90", "sick_leave_30",
    "transfers_24m", "days_since_transfer", "home_distance_km", "family_separation", "training_hours_30",
    "incidents_30", "hardship_tier", "unit_night_7", "unit_duty_hours_7",
]
INDIVIDUAL = [
    "energy_z", "sleep_quality_z", "workload_feel_7", "who5_last", "who5_z", "burnout_pulse_last",
    "burnout_pulse_z", "rt_z", "lapses_z", "hr_z", "hrv_z", "sleep_hours_z",
    "days_since_checkin", "days_since_pvt", "days_since_physio", "open_needs", "need_age",
]
FEATURES = OPERATIONAL + INDIVIDUAL

LABELS = {
    "night_7": "Night duties in last 7 days", "night_30": "Night duties in last 30 days",
    "duty_hours_7": "Avg duty hours (7d)", "duty_hours_30": "Avg duty hours (30d)",
    "duty_slope_30": "Workload trend (30d)", "consec_duty_days": "Consecutive duty days",
    "rest_days_14": "Rest days in last 14", "deployed_continuous": "Continuous deployment days",
    "days_since_home_leave": "Days since home leave", "leave_cancelled_90": "Leave cancelled (90d)",
    "sick_leave_30": "Sick-leave days (30d)", "transfers_24m": "Transfers in 24 months",
    "days_since_transfer": "Days since last transfer", "home_distance_km": "Distance from home (km)",
    "family_separation": "Recent transfer far from family", "training_hours_30": "Training hours (30d)",
    "incidents_30": "Critical incidents (30d)", "hardship_tier": "Hardship posting tier",
    "unit_night_7": "Unit avg night duties (7d)", "unit_duty_hours_7": "Unit avg duty hours (7d)",
    "energy_z": "Energy below personal usual", "sleep_quality_z": "Sleep quality below usual",
    "workload_feel_7": "Self-rated workload (7d)", "who5_last": "WHO-5 wellbeing score",
    "who5_z": "Wellbeing below personal usual", "burnout_pulse_last": "Burnout pulse score",
    "burnout_pulse_z": "Burnout pulse above usual", "rt_z": "Reaction time slower than usual",
    "lapses_z": "Attention lapses above usual", "hr_z": "Resting heart rate above usual",
    "hrv_z": "HRV below personal usual", "sleep_hours_z": "Sleep hours below usual",
    "days_since_checkin": "Days since last check-in", "days_since_pvt": "Days since readiness test",
    "days_since_physio": "Days since heart-rate data", "open_needs": "Open welfare needs",
    "need_age": "Oldest open need (days)",
}

# Features a welfare officer / planner can actually change (used by counterfactuals).
ACTIONABLE = ["night_7", "night_30", "duty_hours_7", "consec_duty_days", "rest_days_14",
              "days_since_home_leave", "leave_cancelled_90", "training_hours_30", "open_needs", "need_age"]

# signal -> (recent-window kind, worse_when_higher, minimum scale)
SIGNALS = {
    "energy": ("mean7", False, 0.5), "sleep_quality": ("mean7", False, 0.5),
    "who5": ("last21", False, 2.0), "burnout_pulse": ("last21", True, 5.0),
    "rt_median": ("last21", True, 10.0), "rt_lapses": ("last21", True, 0.7),
    "hr_rest": ("last21", True, 2.0), "hrv": ("last21", False, 3.0), "sleep_hours": ("mean7", False, 0.3),
}
Z_NAME = {"energy": "energy_z", "sleep_quality": "sleep_quality_z", "who5": "who5_z",
          "burnout_pulse": "burnout_pulse_z", "rt_median": "rt_z", "rt_lapses": "lapses_z",
          "hr_rest": "hr_z", "hrv": "hrv_z", "sleep_hours": "sleep_hours_z"}


def _run_length(mask: pd.Series) -> np.ndarray:
    """Length of the current run of True values ending at each position."""
    m = mask.to_numpy().astype(bool)
    out = np.zeros(len(m))
    run = 0
    for i, v in enumerate(m):
        run = run + 1 if v else 0
        out[i] = run
    return out


def _days_since(mask: pd.Series, prior: float) -> np.ndarray:
    m = mask.to_numpy().astype(bool)
    out = np.zeros(len(m))
    last = -prior
    for i, v in enumerate(m):
        if v:
            last = i
        out[i] = i - last
    return out


def _slope(x: pd.Series, w: int) -> pd.Series:
    t = pd.Series(np.arange(len(x)), index=x.index, dtype=float)
    mt, mx = t.rolling(w, min_periods=7).mean(), x.rolling(w, min_periods=7).mean()
    mtx = (t * x).rolling(w, min_periods=7).mean()
    vt = t.rolling(w, min_periods=7).var(ddof=0)
    return (mtx - mt * mx) / vt


def _person_features(g: pd.DataFrame, p: dict, priors: dict) -> pd.DataFrame:
    g = g.sort_values("day").reset_index(drop=True)
    f = pd.DataFrame({"person_id": g["person_id"], "day": g["day"], "date": g["date"]})
    f["night_7"] = g["night_duty"].rolling(7, min_periods=1).sum()
    f["night_30"] = g["night_duty"].rolling(30, min_periods=1).sum()
    f["duty_hours_7"] = g["duty_hours"].rolling(7, min_periods=1).mean()
    f["duty_hours_30"] = g["duty_hours"].rolling(30, min_periods=1).mean()
    f["duty_slope_30"] = _slope(g["duty_hours"], 30).fillna(0) * 30      # hours change over the window
    f["consec_duty_days"] = _run_length(g["duty_hours"] > 0)
    f["rest_days_14"] = (g["rest_day"] + g["on_leave"]).rolling(14, min_periods=1).sum()
    f["deployed_continuous"] = _run_length(g["deployed"] > 0)
    f["days_since_home_leave"] = np.minimum(_days_since(g["on_leave"] > 0, prior=45), 365)
    f["leave_cancelled_90"] = g["leave_cancelled"].rolling(90, min_periods=1).sum()
    f["sick_leave_30"] = g["sick_leave"].rolling(30, min_periods=1).sum()
    f["transfers_24m"] = p["transfers_24m"]
    since = p["days_since_transfer_d0"] - (N_DAYS - 1 - g["day"])
    f["days_since_transfer"] = np.where(since < 0, since + 420, since)
    f["home_distance_km"] = p["home_distance_km"]
    f["family_separation"] = ((f["days_since_transfer"] < 240) & (p["home_distance_km"] > 800)).astype(int)
    f["training_hours_30"] = g["training_hours"].rolling(30, min_periods=1).sum()
    f["incidents_30"] = g["incident"].rolling(30, min_periods=1).sum()
    f["hardship_tier"] = p["hardship_tier"]

    for sig, (kind, worse_high, min_scale) in SIGNALS.items():
        x = g[sig]
        recent = x.rolling(7, min_periods=1).mean() if kind == "mean7" else x.ffill(limit=21)
        hist = x.shift(14)
        base = hist.rolling(90, min_periods=1).median()
        q75, q25 = hist.rolling(90, min_periods=1).quantile(0.75), hist.rolling(90, min_periods=1).quantile(0.25)
        scale = ((q75 - q25) / 1.349).clip(lower=min_scale)
        n = hist.rolling(90, min_periods=1).count()
        w = n / (n + 8)                                  # cold-start shrinkage towards the population prior
        pm, ps = priors[sig]
        base = (w * base.fillna(pm) + (1 - w) * pm)
        scale = (w * scale.fillna(ps) + (1 - w) * ps)
        z = (recent - base) / scale
        f[Z_NAME[sig]] = (z if worse_high else -z).clip(-6, 6)
        if sig == "who5":
            f["who5_last"] = recent
        if sig == "burnout_pulse":
            f["burnout_pulse_last"] = recent
    f["workload_feel_7"] = g["workload_feel"].rolling(7, min_periods=1).mean()
    f["days_since_checkin"] = np.minimum(_days_since(g["energy"].notna(), prior=60), 60)
    f["days_since_pvt"] = np.minimum(_days_since(g["rt_median"].notna(), prior=60), 60)
    f["days_since_physio"] = np.minimum(_days_since(g["hr_rest"].notna(), prior=60), 60)
    f["open_needs"] = g["open_needs"]
    f["need_age"] = _run_length(g["open_needs"] > 0)
    return f


def population_priors(daily: pd.DataFrame) -> dict:
    hist = daily[~daily["is_future"]]
    out = {}
    for sig, (_, _, min_scale) in SIGNALS.items():
        x = hist[sig].dropna()
        out[sig] = (float(x.median()), max(float((x.quantile(.75) - x.quantile(.25)) / 1.349), min_scale))
    return out


def compute_features(daily: pd.DataFrame, people: pd.DataFrame, priors: dict | None = None) -> pd.DataFrame:
    priors = priors or population_priors(daily)
    pmap = people.set_index("person_id").to_dict("index")
    parts = [_person_features(g, {**pmap[pid], "person_id": pid}, priors) for pid, g in daily.groupby("person_id", sort=False)]
    feats = pd.concat(parts, ignore_index=True)
    feats = feats.merge(people[["person_id", "company"]], on="person_id")
    unit = feats.groupby(["company", "day"])[["night_7", "duty_hours_7"]].transform("mean")
    feats["unit_night_7"], feats["unit_duty_hours_7"] = unit["night_7"], unit["duty_hours_7"]
    return feats.drop(columns=["company"])


def make_labels(daily: pd.DataFrame, history_days: int = N_DAYS) -> tuple[pd.DataFrame, dict]:
    """Label = latent state of that dimension crosses its 93rd percentile within the horizon."""
    hist = daily[daily["day"] < history_days]
    thresholds = {d: float(hist[f"lat_{d}"].quantile(0.93)) for d in DIMENSIONS}
    thresholds["welfare_concern"] = max(thresholds["welfare_concern"], 1.4)
    out = hist[["person_id", "day"]].copy()
    for dim, (_, h) in DIMENSIONS.items():
        col = f"lat_{dim}"
        fut = (hist.groupby("person_id")[col]
               .transform(lambda s: s[::-1].rolling(h, min_periods=1).max()[::-1].shift(-1)))
        lab = (fut > thresholds[dim]).astype(float)
        lab[hist["day"] > history_days - 1 - h] = np.nan        # horizon runs past the data
        out[f"y_{dim}"] = lab.to_numpy()
    return out, thresholds
