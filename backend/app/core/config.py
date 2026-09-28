"""Central configuration. Values can be overridden with environment variables."""
import os
from datetime import date
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]          # backend/
ARTIFACTS = BASE_DIR / "artifacts"                     # trained models + metrics
LOG_DIR = BASE_DIR / "logs"
DATA_DIR = BASE_DIR / "data"                            # SQLite database file
for _d in (ARTIFACTS, LOG_DIR, DATA_DIR):
    _d.mkdir(exist_ok=True)

LOG_LEVEL = os.getenv("SAHARA_LOG_LEVEL", "INFO")

# SQLite for the local prototype; set SAHARA_DB_URL to a PostgreSQL URL in production.
DB_URL = os.getenv("SAHARA_DB_URL", f"sqlite:///{DATA_DIR / 'sahara.db'}")

JWT_SECRET = os.getenv("SAHARA_JWT_SECRET", "dev-only-secret-change-me-in-production-2026")
JWT_ALGO = "HS256"

SEED = 26186              # PS ID doubles as the deterministic seed
N_DAYS = 180              # history length
FORECAST_DAYS = 14
END_DATE = date(2026, 9, 25)   # "today" in the simulation

# Risk dimensions: key -> (label, horizon days)
DIMENSIONS = {
    "acute_stress": ("Acute Stress", 7),
    "burnout": ("Burnout", 30),
    "emotional_fatigue": ("Emotional Fatigue", 14),
    "welfare_concern": ("Welfare Concern", 7),
}
BAND_MODERATE = 0.30
BAND_HIGH = 0.60

MIN_GROUP_SIZE = 10       # commander aggregates below this size are suppressed
DP_EPSILON = 1.0          # Laplace noise budget per aggregate query

DEMO_PERSON = "P-104"
