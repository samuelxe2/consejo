"""Manejador único de errores: excepciones de dominio -> HTTP (SDD 5.5, 5.6)."""

import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.domain.errors import (
    DominioError,
    NoAutenticado,
    TicketNoEncontrado,
    TransicionInvalida,
    ValidacionError,
)

logger = logging.getLogger(__name__)


# Mensajes por defecto de Starlette/FastAPI, en español.
_HTTP_ES: dict[int, tuple[str, str]] = {
    404: ("no_encontrado", "El recurso solicitado no existe."),
    405: ("metodo_no_permitido", "Método no permitido para este recurso."),
}


def _error(codigo: int, error: str, detalle: str, campo: str | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=codigo, content={"error": error, "detalle": detalle, "campo": campo}
    )


def _detalle_validacion(exc: RequestValidationError) -> tuple[str, str | None]:
    primero = exc.errors()[0]
    # Los índices de listas (p. ej. ?estado=X&estado=Y) no son nombres de campo.
    loc = [
        str(p)
        for p in primero.get("loc", ())
        if p not in ("body", "query", "path") and not isinstance(p, int)
    ]
    campo = loc[-1] if loc else None
    tipo = primero.get("type", "")
    if tipo == "json_invalid":
        return "El cuerpo de la petición no es un JSON válido.", None
    if tipo == "missing":
        return f"El campo '{campo}' es obligatorio.", campo
    if tipo == "enum":
        return f"Valor no permitido para '{campo}'.", campo
    return f"Valor inválido para '{campo}': {primero.get('msg', '')}", campo


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def _validacion_esquema(_: Request, exc: RequestValidationError) -> JSONResponse:
        # FastAPI usa 422 por defecto; el contrato del proyecto usa 400.
        detalle, campo = _detalle_validacion(exc)
        return _error(status.HTTP_400_BAD_REQUEST, "validacion", detalle, campo)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        # Rutas inexistentes, método no permitido, etc.: mismo formato que el resto.
        error, detalle = _HTTP_ES.get(exc.status_code, ("http", str(exc.detail)))
        return _error(exc.status_code, error, detalle)

    @app.exception_handler(DominioError)
    async def _dominio(_: Request, exc: DominioError) -> JSONResponse:
        if isinstance(exc, ValidacionError):
            return _error(400, "validacion", exc.detalle, exc.campo)
        if isinstance(exc, TransicionInvalida):
            return _error(400, "transicion_invalida", exc.detalle)
        if isinstance(exc, TicketNoEncontrado):
            return _error(404, "no_encontrado", exc.detalle)
        if isinstance(exc, NoAutenticado):
            return _error(401, "no_autenticado", exc.detalle)
        return _error(400, "validacion", exc.detalle)

    @app.exception_handler(Exception)
    async def _inesperado(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("error_inesperado tipo=%s", type(exc).__name__)
        return _error(500, "interno", "Ocurrió un error inesperado.")
