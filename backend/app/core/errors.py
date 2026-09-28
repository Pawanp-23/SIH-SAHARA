"""Domain errors and global FastAPI exception handlers.

Every error returns the same JSON shape: {"error": {"code", "message", "request_id"}}.
Unexpected exceptions are logged with a traceback but never leak internals to the client.
"""
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .logging import get_logger

log = get_logger("sahara.errors")


class SaharaError(Exception):
    status_code = 400
    code = "bad_request"

    def __init__(self, message: str, *, code: str | None = None):
        super().__init__(message)
        self.message = message
        if code:
            self.code = code


class NotFound(SaharaError):
    status_code = 404
    code = "not_found"


class Forbidden(SaharaError):
    status_code = 403
    code = "forbidden"


class Unauthorized(SaharaError):
    status_code = 401
    code = "unauthorized"


class ModelNotReady(SaharaError):
    status_code = 503
    code = "model_not_ready"


def _body(request: Request, code: str, message: str) -> dict:
    return {"error": {"code": code, "message": message, "request_id": getattr(request.state, "request_id", None)}}


def register_handlers(app: FastAPI) -> None:
    @app.exception_handler(SaharaError)
    async def _sahara(request: Request, exc: SaharaError):
        log.warning("%s %s -> %s (%s)", request.method, request.url.path, exc.status_code, exc.code)
        return JSONResponse(status_code=exc.status_code, content=_body(request, exc.code, exc.message))

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException):
        return JSONResponse(status_code=exc.status_code, content=_body(request, "http_error", str(exc.detail)))

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError):
        fields = ", ".join(".".join(str(p) for p in e["loc"][1:]) for e in exc.errors())
        return JSONResponse(status_code=422, content=_body(request, "validation_error", f"Invalid fields: {fields}"))

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        log.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content=_body(request, "internal_error", "Something went wrong. It has been logged."))
