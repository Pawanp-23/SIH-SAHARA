"""Logging setup: console + rotating files (app.log for everything, error.log for errors).

Log lines never contain welfare content or real identities, only pseudonymous IDs,
routes, timings and error types.
"""
import logging
import logging.config

from .config import LOG_DIR, LOG_LEVEL

_FORMAT = "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s"
_configured = False


def setup_logging() -> None:
    global _configured
    if _configured:
        return
    logging.config.dictConfig({
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {"std": {"format": _FORMAT}},
        "handlers": {
            "console": {"class": "logging.StreamHandler", "formatter": "std", "level": LOG_LEVEL},
            "app_file": {
                "class": "logging.handlers.RotatingFileHandler", "formatter": "std", "level": "INFO",
                "filename": str(LOG_DIR / "app.log"), "maxBytes": 5_000_000, "backupCount": 5, "encoding": "utf-8",
            },
            "error_file": {
                "class": "logging.handlers.RotatingFileHandler", "formatter": "std", "level": "ERROR",
                "filename": str(LOG_DIR / "error.log"), "maxBytes": 5_000_000, "backupCount": 5, "encoding": "utf-8",
            },
        },
        "root": {"handlers": ["console", "app_file", "error_file"], "level": LOG_LEVEL},
        "loggers": {"uvicorn.access": {"level": "WARNING"}},
    })
    _configured = True


def get_logger(name: str) -> logging.Logger:
    setup_logging()
    return logging.getLogger(name)
