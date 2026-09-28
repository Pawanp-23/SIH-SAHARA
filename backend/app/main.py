"""SAHARA API entry point.

    uvicorn app.main:app --reload --port 8000
"""
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect

from .core.config import DB_URL
from .core.db import SessionLocal, engine
from .core.errors import register_handlers
from .core.logging import get_logger, setup_logging
from .routers import admin, commander, personnel, welfare
from .services.alerts import escalate_overdue

setup_logging()
log = get_logger("sahara.api")


@asynccontextmanager
async def lifespan(_: FastAPI):
    tables = set(inspect(engine).get_table_names())
    if not {"personnel", "features", "scores"} <= tables:
        log.error("Database not seeded (%s). Run: python -m scripts.seed", DB_URL)
    else:
        db = SessionLocal()
        try:
            escalate_overdue(db)
        except Exception:
            log.exception("startup escalation check failed")
        finally:
            db.close()
        log.info("SAHARA API ready (%s)", DB_URL)
    yield


app = FastAPI(title="SAHARA API", version="1.0.0", lifespan=lifespan,
              description="AI-Based Predictive Personnel Stress and Welfare Monitoring System (SIH26186). "
                          "Prototype on synthetic data.")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_methods=["*"], allow_headers=["*"])
register_handlers(app)


@app.middleware("http")
async def request_context(request: Request, call_next):
    request.state.request_id = uuid.uuid4().hex[:12]
    start = time.perf_counter()
    response = await call_next(request)
    ms = (time.perf_counter() - start) * 1000
    response.headers["X-Request-ID"] = request.state.request_id
    log.info("%s %s %s %.0fms rid=%s", request.method, request.url.path, response.status_code, ms, request.state.request_id)
    return response


for r in (admin.router, personnel.router, welfare.router, commander.router):
    app.include_router(r)
