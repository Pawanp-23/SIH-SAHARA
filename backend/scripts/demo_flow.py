"""Replay the finale scenario against a running API (PRD section 20).

    python -m scripts.demo_flow            # P-104 check-in + readiness test -> T1 alert

Use it to reset the stage before a demo after `python -m scripts.seed`.
"""
import sys

import httpx

from app.core.logging import get_logger

log = get_logger("sahara.demo")
API = "http://127.0.0.1:8000"


def token(c: httpx.Client, user: str) -> dict:
    r = c.post("/v1/auth/login", json={"username": user})
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def main() -> None:
    with httpx.Client(base_url=API, timeout=60) as c:
        me = token(c, "p104")
        r1 = c.post("/v1/checkins", headers=me, json={
            "energy": 2, "sleep_quality": 3, "workload_feel": 4,
            "who5_items": [3, 2, 2, 3, 2], "burnout_items": [3, 2, 3, 2]})
        r1.raise_for_status()
        r2 = c.post("/v1/readiness/summary", headers=me, json={
            "rt_median_ms": 331, "lapses": 3, "false_starts": 0, "trials": 8,
            "hr_bpm": 79, "hrv_ms": 31, "signal_quality": 0.9})
        r2.raise_for_status()
        log.info("P-104 confidence %.0f%% -> %.0f%% -> %.0f%%", 100 * r1.json()["confidence_before"],
                 100 * r1.json()["confidence_after"], 100 * r2.json()["confidence_after"])
        w = {**token(c, "welfare.3bn"), "X-Purpose-Of-Use": "welfare"}
        q = c.get("/v1/welfare/queue", headers=w).json()
        tier = next((i["tier"] for i in q["items"] if i["person_id"] == "P-104"), None)
        log.info("P-104 queue tier: %s (queue counts %s)", tier, q["counts"])
        if tier != "T1":
            raise SystemExit("P-104 did not reach T1; check the seed")


if __name__ == "__main__":
    try:
        main()
    except httpx.ConnectError:
        log.error("API not reachable at %s. Start it with: uvicorn app.main:app --port 8000", API)
        sys.exit(1)
