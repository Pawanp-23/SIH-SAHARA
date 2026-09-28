"""Synthetic personnel generator.

Every person carries a hidden (latent) strain state driven by operational load and
individual sensitivity. Observable signals (check-ins, reaction test, heart rate,
sleep) are noisy, delayed and often missing functions of that state. Labels come
from the latent state; models only ever see the observable columns.
"""
from datetime import timedelta

import numpy as np
import pandas as pd

from ..core.config import DEMO_PERSON, END_DATE, FORECAST_DAYS, N_DAYS, SEED

BATTALIONS = {
    "1 Bn": {"tier": 1, "companies": {"A": 25, "B": 25, "C": 25, "D": 25}},
    "2 Bn": {"tier": 2, "companies": {"A": 25, "B": 25, "C": 25, "D": 25}},
    "3 Bn": {"tier": 3, "companies": {"A": 24, "B": 24, "C": 24, "D": 24, "Det": 4}},
}
RANKS = ["Constable", "Head Constable", "ASI", "SI", "Inspector"]
RANK_P = [0.52, 0.22, 0.1, 0.1, 0.06]
DUTY_TYPES = {"Patrol": 0.30, "Static Guard": 0.25, "QRT": 0.18, "Admin": 0.10, "Comms": 0.17}
NIGHT_BASE = {"Patrol": 0.22, "Static Guard": 0.30, "QRT": 0.20, "Admin": 0.05, "Comms": 0.18}

LATENT_COLS = ["S", "lat_acute_stress", "lat_burnout", "lat_emotional_fatigue", "lat_welfare_concern"]


def _tempo(bn: str, t: int) -> float:
    """Operational tempo by battalion and day index."""
    if bn == "1 Bn":
        return 1.0
    if bn == "2 Bn":
        return 1.3 if 60 <= t < 82 else 1.05
    return 1.0 + (0.25 if t >= 135 else 0.0) + 0.1   # 3 Bn: surge in the last 45 days


def make_personnel(rng: np.random.Generator) -> pd.DataFrame:
    rows, i = [], 1
    for bn, spec in BATTALIONS.items():
        for coy, n in spec["companies"].items():
            for _ in range(n):
                duty = rng.choice(list(DUTY_TYPES), p=list(DUTY_TYPES.values()))
                rows.append(dict(
                    person_id=f"P-{i:03d}", battalion=bn, company=f"{bn} {coy}",
                    rank_band=rng.choice(RANKS, p=RANK_P), duty_type=duty,
                    hardship_tier=spec["tier"],
                    qrt_qualified=bool(duty == "QRT" or rng.random() < 0.25),
                    sensitivity=float(rng.lognormal(0, 0.35)),
                    transfers_24m=int(rng.poisson(0.8)),
                    days_since_transfer_d0=int(rng.integers(30, 900)),
                    home_distance_km=int(np.clip(rng.lognormal(6.3, 0.8), 40, 3200)),
                    p_checkin=float(rng.beta(4, 2)),
                    p_pvt=float(rng.uniform(0.08, 0.2)),
                    wearable=bool(rng.random() < 0.3),
                    under_reporter=bool(rng.random() < 0.1),
                    base_rt=float(rng.normal(285, 28)), base_hr=float(rng.normal(68, 6)),
                    base_hrv=float(np.clip(rng.normal(46, 11), 18, 90)), base_sleep=float(rng.normal(6.8, 0.5)),
                    language=rng.choice(["en", "hi"], p=[0.35, 0.65]),
                ))
                i += 1
    df = pd.DataFrame(rows)
    # Scripted demo case (see PRD section 20).
    m = df.person_id == DEMO_PERSON
    df.loc[m, ["battalion", "company", "duty_type", "hardship_tier", "rank_band"]] = ["3 Bn", "3 Bn C", "Static Guard", 3, "Head Constable"]
    df.loc[m, ["sensitivity", "transfers_24m", "days_since_transfer_d0", "home_distance_km"]] = [0.9, 2, 30, 1450]
    df.loc[m, ["p_checkin", "p_pvt", "wearable", "under_reporter", "qrt_qualified"]] = [0.8, 0.15, False, False, False]
    return df


def _simulate_person(p: dict, rng: np.random.Generator, n_days: int, n_future: int):
    total = n_days + n_future
    demo = p["person_id"] == DEMO_PERSON
    rec = {k: np.zeros(total) for k in [
        "duty_hours", "night_duty", "on_leave", "leave_cancelled", "sick_leave", "deployed", "rest_day",
        "training_hours", "incident", "open_needs", "new_need"]}
    # Deployment episodes
    deployed = np.zeros(total, bool)
    t = int(rng.integers(0, 40))
    while t < total:
        if rng.random() < (0.35 + 0.1 * p["hardship_tier"]):
            L = int(rng.integers(15, 46))
            deployed[t:t + L] = True
            t += L + int(rng.integers(20, 60))
        else:
            t += int(rng.integers(20, 50))
    if p["battalion"] == "3 Bn" and rng.random() < 0.35:
        deployed[150:total] = True
    if demo:
        deployed[:] = False
        deployed[40:62] = True
        deployed[n_days - 31:total] = True          # 31-day continuous deployment
    # Planned leave blocks
    next_leave = int(rng.integers(10, 80))
    leave_days = set()
    while next_leave < total:
        tempo = _tempo(p["battalion"], next_leave)
        cancel = (tempo > 1.4 and rng.random() < 0.5) or (demo and next_leave > 120)
        if cancel:
            rec["leave_cancelled"][next_leave] = 1
        else:
            leave_days.update(range(next_leave, min(total, next_leave + 10)))
        next_leave += int(rng.normal(75, 18))
    if demo:
        leave_days = {d for d in leave_days if d < 90}
        rec["leave_cancelled"][:] = 0
        rec["leave_cancelled"][n_days - 20] = 1
    # Welfare needs (family, housing, finance...)
    needs = []
    for d in range(total):
        pr = 0.004 + (0.02 if rec["leave_cancelled"][max(0, d - 3):d + 1].any() else 0)
        if rng.random() < pr:
            needs.append((d, d + int(rng.geometric(1 / 20))))
            rec["new_need"][d] = 1
    if demo:
        needs = [(n_days - 18, 10 ** 6)]
        rec["new_need"][:] = 0
        rec["new_need"][n_days - 18] = 1
    for s, e in needs:
        rec["open_needs"][s:min(e, total)] += 1

    S = np.zeros(total)
    s_prev = 0.8 * rng.random()
    consec = 0
    fam = 1.0 if (p["days_since_transfer_d0"] < 240 and p["home_distance_km"] > 800) else 0.0
    for d in range(total):
        tempo = _tempo(p["battalion"], d)
        on_leave = d in leave_days
        sick = (not on_leave) and rng.random() < 0.004 + 0.01 * s_prev
        rest = (not on_leave) and (not deployed[d]) and rng.random() < 1 / 7
        rec["on_leave"][d] = on_leave
        rec["sick_leave"][d] = sick
        rec["deployed"][d] = deployed[d]
        rec["rest_day"][d] = rest
        if on_leave or sick or rest:
            consec = 0
        else:
            consec += 1
            night_p = NIGHT_BASE[p["duty_type"]] * tempo + (0.15 if deployed[d] else 0)
            rec["night_duty"][d] = rng.random() < night_p
            rec["duty_hours"][d] = max(4, rng.normal(8 + 3 * (tempo - 1) + (1.5 if deployed[d] else 0), 1.2))
            rec["training_hours"][d] = rng.choice([0, 0, 0, 0, 0, 0, 2, 4]) if not deployed[d] else 0
            rec["incident"][d] = rng.random() < 0.006 * tempo * p["hardship_tier"]
        if demo:
            if d >= n_days - 10 and not on_leave:
                # 6 nights in the last 10 days, and 4 more already planned for next week (breaks the 3-night rule)
                rec["night_duty"][d] = d in {n_days - 10, n_days - 9, n_days - 7, n_days - 5, n_days - 3, n_days - 2,
                                             n_days, n_days + 1, n_days + 3, n_days + 5}
                rec["duty_hours"][d] = 10.5
        load = ((rec["duty_hours"][d] - 8) / 2 + 1.1 * rec["night_duty"][d] + 0.45 * rec["deployed"][d]
                + 2.5 * rec["incident"][d] + 0.08 * rec["training_hours"][d] + 0.05 * max(0, consec - 6)
                + 0.05 * p["hardship_tier"])
        recovery = 1.6 * on_leave + 0.9 * rest + 0.5 * sick
        s_prev = float(np.clip(0.90 * s_prev + 0.16 * p["sensitivity"] * (load - recovery) + 0.05 * fam
                               + 0.04 * rec["open_needs"][d] + rng.normal(0, 0.12), 0, 12))
        S[d] = s_prev
    return rec, S, fam, leave_days


def _ewm(x, span):
    return pd.Series(x).ewm(span=span, adjust=False).mean().to_numpy()


def _observe(p, rec, S, fam, rng, n_days, total):
    """Noisy, partially missing observations. Future days carry no observations."""
    A, Bn = _ewm(S, 3), _ewm(S, 30)
    F = _ewm(S, 14)
    demo = p["person_id"] == DEMO_PERSON
    obs = {k: np.full(total, np.nan) for k in [
        "energy", "sleep_quality", "workload_feel", "who5", "burnout_pulse",
        "rt_median", "rt_lapses", "hr_rest", "hrv", "sleep_hours"]}
    bias = 0.8 if p["under_reporter"] else 0.0
    for d in range(n_days):
        engaged = p["p_checkin"] * (0.7 if S[d] > 5 else 1.0)
        if rng.random() < engaged:
            obs["energy"][d] = np.clip(round(4.3 - 0.33 * S[d] + bias + rng.normal(0, 0.55)), 1, 5)
            obs["sleep_quality"][d] = np.clip(round(4.1 - 0.3 * S[d] + bias + rng.normal(0, 0.6)), 1, 5)
            obs["workload_feel"][d] = np.clip(round(2.2 + 0.3 * S[d] - bias + rng.normal(0, 0.6)), 1, 5)
            if d % 7 == 0:
                obs["who5"][d] = np.clip(round(19.5 - 1.45 * F[d] - 2.2 * fam + bias * 2 + rng.normal(0, 2.3)), 0, 25)
                obs["burnout_pulse"][d] = np.clip(22 + 7.5 * Bn[d] - bias * 8 + rng.normal(0, 7), 0, 100)
        if rng.random() < p["p_pvt"]:
            obs["rt_median"][d] = p["base_rt"] + 10 * A[d] + rng.normal(0, 11)
            obs["rt_lapses"][d] = rng.poisson(0.5 + 0.55 * A[d])
            if rng.random() < 0.6:
                obs["hr_rest"][d] = p["base_hr"] + 1.5 * A[d] + rng.normal(0, 2.2)
                obs["hrv"][d] = max(8, p["base_hrv"] - 2.4 * A[d] + rng.normal(0, 3.5))
        if p["wearable"]:
            obs["sleep_hours"][d] = p["base_sleep"] - 0.17 * S[d] + rng.normal(0, 0.45)
            obs["hr_rest"][d] = p["base_hr"] + 1.3 * A[d] + rng.normal(0, 2)
            obs["hrv"][d] = max(8, p["base_hrv"] - 2.1 * A[d] + rng.normal(0, 3.5))
    if demo:
        # Individual evidence went stale: last check-in 9 days ago, last readiness test 21 days ago.
        for k in ["energy", "sleep_quality", "workload_feel", "who5", "burnout_pulse"]:
            obs[k][n_days - 9:] = np.nan
        for k in ["rt_median", "rt_lapses", "hr_rest", "hrv"]:
            obs[k][n_days - 21:] = np.nan
    return obs, A, Bn, F


def generate(seed: int = SEED, n_days: int = N_DAYS, n_future: int = FORECAST_DAYS):
    """Returns (personnel, daily). `daily` includes latent columns and `is_future` rows."""
    rng = np.random.default_rng(seed)
    people = make_personnel(rng)
    total = n_days + n_future
    start = END_DATE - timedelta(days=n_days - 1)
    dates = [start + timedelta(days=i) for i in range(total)]
    frames = []
    for p in people.to_dict("records"):
        rec, S, fam, _ = _simulate_person(p, rng, n_days, n_future)
        obs, A, Bn, F = _observe(p, rec, S, fam, rng, n_days, total)
        f = pd.DataFrame({**rec, **obs})
        f.insert(0, "person_id", p["person_id"])
        f.insert(1, "day", np.arange(total))
        f.insert(2, "date", [d.isoformat() for d in dates])
        f["is_future"] = f["day"] >= n_days
        f["S"] = S
        f["lat_acute_stress"] = A
        f["lat_burnout"] = Bn
        f["lat_emotional_fatigue"] = F + 1.2 * fam
        f["lat_welfare_concern"] = rec["open_needs"] * 1.5 + pd.Series(rec["leave_cancelled"]).rolling(30, min_periods=1).sum().to_numpy() * 1.5
        frames.append(f)
    daily = pd.concat(frames, ignore_index=True)
    for c in ["night_duty", "on_leave", "leave_cancelled", "sick_leave", "deployed", "rest_day", "incident", "new_need"]:
        daily[c] = daily[c].astype(int)
    daily["open_needs"] = daily["open_needs"].astype(int)
    return people, daily
