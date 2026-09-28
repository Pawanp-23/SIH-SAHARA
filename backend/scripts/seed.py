"""Build the demo database end to end.

    python -m scripts.seed            # full rebuild (data + training), ~2 minutes
    python -m scripts.seed --no-train # reuse trained models in artifacts/

All data is SYNTHETIC. Simulator internals (latent strain, sensitivity) are never written
to the application database.
"""
import argparse
import hashlib
import json
import sys
import time
from datetime import datetime, timezone

import numpy as np
from sqlalchemy import text

from app.core.config import DATA_DIR, DB_URL, DEMO_PERSON, N_DAYS
from app.core.db import Base, SessionLocal, engine
from app.core.logging import get_logger
from app.ml.engine import MODEL_PATH, RiskEngine
from app.ml.features import FEATURES, compute_features, make_labels, population_priors
from app.ml.generator import generate
from app.models import Alert, Consent, IdentityVault, WelfareNeed
from app.services import alerts as alert_svc
from app.services.audit import record
from app.services.privacy import dp_share
from app.services.risk import PRIORS_PATH, score_frame

log = get_logger("sahara.seed")

PERSON_COLS = ["person_id", "battalion", "company", "rank_band", "duty_type", "hardship_tier", "qrt_qualified",
               "transfers_24m", "days_since_transfer_d0", "home_distance_km", "wearable", "language"]
DAILY_COLS = ["person_id", "day", "date", "is_future", "duty_hours", "night_duty", "on_leave", "leave_cancelled",
              "sick_leave", "deployed", "rest_day", "training_hours", "incident", "open_needs", "energy",
              "sleep_quality", "workload_feel", "who5", "burnout_pulse", "rt_median", "rt_lapses", "hr_rest", "hrv",
              "sleep_hours"]
FIRST = ["Rakesh", "Suresh", "Anil", "Vikram", "Manoj", "Deepak", "Arjun", "Ravi", "Sanjay", "Imran", "Gurpreet",
         "Thomas", "Karthik", "Rahul", "Ajay", "Pooja", "Sunita", "Meena", "Kavita", "Anjali", "Lalit", "Biren", "Tenzing"]
LAST = ["Sharma", "Singh", "Yadav", "Kumar", "Nair", "Reddy", "Das", "Patil", "Khan", "Gill", "Iyer", "Bora",
        "Meitei", "Negi", "Rawat", "Thakur", "Pillai", "Mishra", "Chauhan", "Joshi"]
NEED_CATEGORIES = ["family_medical", "housing", "finance", "child_education", "leave", "allowance"]


def step(msg):
    log.info("== %s", msg)
    return time.time()


def main(train: bool) -> None:
    t0 = time.time()
    if DB_URL.startswith("sqlite"):
        db_file = DATA_DIR / "sahara.db"
        if db_file.exists():
            db_file.unlink()
    Base.metadata.create_all(engine)

    step("generating synthetic personnel")
    people, daily = generate()
    people[PERSON_COLS].to_sql("personnel", engine, index=False)
    daily[DAILY_COLS].to_sql("daily", engine, index=False, chunksize=5000)

    step("computing features")
    priors = population_priors(daily)
    PRIORS_PATH.write_text(json.dumps(priors, indent=2))
    feats = compute_features(daily, people, priors)
    feats[["person_id", "day", "date"] + FEATURES].to_sql("features", engine, index=False, chunksize=5000)

    if train or not MODEL_PATH.exists():
        step("training risk models (4 dimensions)")
        labels, thresholds = make_labels(daily)
        risk = RiskEngine.train(feats, labels, daily, thresholds, people)
    else:
        risk = RiskEngine.load()

    step("scoring history and 14-day forecast")
    sc = score_frame(risk, feats)
    sc.to_sql("scores", engine, index=False, chunksize=5000)
    sc[sc["day"] >= N_DAYS].to_sql("forecast", engine, index=False)
    with engine.begin() as c:
        for t in ("daily", "features", "scores", "forecast"):
            c.execute(text(f"CREATE INDEX ix_{t}_pd ON {t} (person_id, day)"))
        c.execute(text("CREATE INDEX ix_features_day ON features (day)"))

    step("identity vault, consents, welfare needs")
    rng = np.random.default_rng(99)
    db = SessionLocal()
    try:
        for pid in people["person_id"]:
            db.add(IdentityVault(person_id=pid, display_name=f"{rng.choice(FIRST)} {rng.choice(LAST)} (synthetic)",
                                 service_no=f"{rng.integers(10, 99)}{rng.integers(100000, 999999)}"))
        for p in people.itertuples():
            mods = ["checkin", "readiness", "hrms_prediction"] + (["wearable"] if p.wearable else []) + \
                   (["camera_ppg"] if rng.random() < 0.5 or p.person_id == DEMO_PERSON else [])
            for m in mods:
                receipt = hashlib.sha256(f"{p.person_id}|{m}|1.0".encode()).hexdigest()
                db.add(Consent(person_id=p.person_id, modality=m, granted=True, receipt_hash=receipt))
        today = daily[daily["day"] == N_DAYS - 1]
        for r in today[today["open_needs"] > 0].itertuples():
            if r.person_id == DEMO_PERSON:
                db.add(WelfareNeed(person_id=r.person_id, category="leave", sla_days=14,
                                   description="Leave request for mother's scheduled surgery (home station, 1,450 km)"))
            else:
                db.add(WelfareNeed(person_id=r.person_id, category=str(rng.choice(NEED_CATEGORIES))))
        db.commit()
        record(db, actor="seed", role="system", action="seed_database", resource="all", purpose="system",
               detail="Synthetic dataset created; 300 personnel x 180 days")

        step("alerts")
        counts = alert_svc.generate_all(db, risk)
        fc = sc[sc["day"] >= N_DAYS].merge(people[["person_id", "company", "battalion"]], on="person_id")
        for (company, bn), g in fc.groupby(["company", "battalion"]):
            peak = max(dp_share(d["p_burnout"] >= 0.6, key=f"fc|{company}|{day}|b")["value"] or 0
                       for day, d in g.groupby("day"))
            if peak >= 0.2:
                db.add(Alert(tier="UH", unit=company, battalion=bn, recipient_role="commander",
                             reason=f"Forecast: {peak:.0%} of {company} at high burnout risk within 14 days",
                             sla_due=datetime.now(timezone.utc) + alert_svc.SLA["UH"]))
        db.commit()
        escalated = alert_svc.escalate_overdue(db)
        log.info("alerts: %s, escalated %d", counts, escalated)
    finally:
        db.close()
    log.info("seed complete in %.0fs -> %s", time.time() - t0, DB_URL)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-train", action="store_true")
    args = ap.parse_args()
    try:
        main(train=not args.no_train)
    except Exception:
        log.exception("seed failed")
        sys.exit(1)
