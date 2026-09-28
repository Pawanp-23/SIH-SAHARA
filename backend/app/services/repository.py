"""Read/write helpers for the analytics tables (pandas <-> SQL)."""
from functools import lru_cache

import pandas as pd
from sqlalchemy import text

from ..core.config import N_DAYS
from ..core.db import engine
from ..core.errors import NotFound

TODAY = N_DAYS - 1


def read_sql(sql: str, **params) -> pd.DataFrame:
    with engine.connect() as c:
        return pd.read_sql(text(sql), c, params=params)


@lru_cache(maxsize=1)
def people() -> pd.DataFrame:
    return read_sql("SELECT * FROM personnel")


def person(pid: str) -> dict:
    p = people()
    row = p[p["person_id"] == pid]
    if row.empty:
        raise NotFound(f"Unknown person {pid}")
    return row.iloc[0].to_dict()


def battalion_people(bn: str) -> pd.DataFrame:
    p = people()
    return p[p["battalion"] == bn]


def daily(pid: str) -> pd.DataFrame:
    return read_sql("SELECT * FROM daily WHERE person_id = :pid ORDER BY day", pid=pid)


def features(pid: str) -> pd.DataFrame:
    return read_sql("SELECT * FROM features WHERE person_id = :pid ORDER BY day", pid=pid)


def features_on(day: int) -> pd.DataFrame:
    return read_sql("SELECT * FROM features WHERE day = :d", d=day)


def scores(pid: str) -> pd.DataFrame:
    return read_sql("SELECT * FROM scores WHERE person_id = :pid ORDER BY day", pid=pid)


def scores_between(d0: int, d1: int) -> pd.DataFrame:
    return read_sql("SELECT * FROM scores WHERE day BETWEEN :a AND :b", a=d0, b=d1)


def forecast(bn: str) -> pd.DataFrame:
    return read_sql("SELECT f.* FROM forecast f JOIN personnel p ON p.person_id = f.person_id WHERE p.battalion = :bn", bn=bn)


def replace_person_rows(table: str, pid: str, df: pd.DataFrame) -> None:
    """Replace one person's rows in an analytics table inside a single transaction."""
    with engine.begin() as c:
        c.execute(text(f"DELETE FROM {table} WHERE person_id = :pid"), {"pid": pid})
        df.to_sql(table, c, if_exists="append", index=False)


WRITABLE_DAILY = {"energy", "sleep_quality", "workload_feel", "who5", "burnout_pulse",
                  "rt_median", "rt_lapses", "hr_rest", "hrv", "sleep_hours", "open_needs"}


def update_daily(pid: str, day: int, values: dict) -> None:
    bad = set(values) - WRITABLE_DAILY
    if bad:
        raise ValueError(f"Not writable: {sorted(bad)}")
    cols = ", ".join(f"{k} = :{k}" for k in values)
    with engine.begin() as c:
        c.execute(text(f"UPDATE daily SET {cols} WHERE person_id = :pid AND day = :day"), {**values, "pid": pid, "day": day})
