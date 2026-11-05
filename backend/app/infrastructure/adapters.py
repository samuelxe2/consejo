"""Adaptadores por sistema de origen: payload propio -> TicketEntrante (SDD 3.4)."""

from collections.abc import Iterable, Mapping
from typing import Any

from app.domain.entities import TicketEntrante
from app.domain.enums import SistemaOrigen
from app.domain.errors import ValidacionError
from app.domain.ports import SourceAdapter


def _requerido(payload: Mapping[str, Any], campo: str) -> str:
    valor = payload.get(campo)
    if not isinstance(valor, str) or not valor.strip():
        raise ValidacionError(f"El campo '{campo}' es obligatorio.", campo)
    return valor.strip()


def _opcional(payload: Mapping[str, Any], campo: str) -> str | None:
    valor = payload.get(campo)
    return valor.strip() if isinstance(valor, str) and valor.strip() else None


class MaiaAdapter:
    sistema = SistemaOrigen.MAIA

    def normalize(self, payload: Mapping[str, Any]) -> TicketEntrante:
        return TicketEntrante(
            sistema_origen=self.sistema,
            usuario_email=_requerido(payload, "usuario"),
            asunto=_requerido(payload, "consulta"),
            descripcion=_requerido(payload, "descripcion"),
            contexto=f"Curso: {_requerido(payload, 'curso')}",
        )


class EvaluIAAdapter:
    sistema = SistemaOrigen.EVALUIA

    def normalize(self, payload: Mapping[str, Any]) -> TicketEntrante:
        evaluacion = _requerido(payload, "evaluacion_id")
        return TicketEntrante(
            sistema_origen=self.sistema,
            usuario_email=_requerido(payload, "usuario"),
            asunto=_opcional(payload, "error") or f"Consulta sobre evaluación {evaluacion}",
            descripcion=_requerido(payload, "descripcion"),
            contexto=f"Evaluación: {evaluacion}",
        )


class CourseBuilderAdapter:
    sistema = SistemaOrigen.COURSE_BUILDER

    def normalize(self, payload: Mapping[str, Any]) -> TicketEntrante:
        curso = _requerido(payload, "curso")
        operacion = _requerido(payload, "operacion")
        return TicketEntrante(
            sistema_origen=self.sistema,
            usuario_email=_requerido(payload, "usuario"),
            asunto=f"{operacion} en {curso}",
            descripcion=_requerido(payload, "descripcion"),
            contexto=f"Curso: {curso}; operación: {operacion}",
        )


class AdapterRegistry:
    """Agregar un sistema nuevo = registrar un adaptador nuevo (OCP)."""

    def __init__(self, adapters: Iterable[SourceAdapter]) -> None:
        self._adapters = {a.sistema: a for a in adapters}

    def normalize(self, sistema: str, payload: Mapping[str, Any]) -> TicketEntrante:
        try:
            adapter = self._adapters[SistemaOrigen(sistema)]
        except (ValueError, KeyError):
            raise ValidacionError(
                f"Sistema de origen no permitido: {sistema}.", "sistema_origen"
            ) from None
        return adapter.normalize(payload)


def default_registry() -> AdapterRegistry:
    return AdapterRegistry([MaiaAdapter(), EvaluIAAdapter(), CourseBuilderAdapter()])
