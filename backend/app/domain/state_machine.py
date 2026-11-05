"""Única fuente de verdad sobre las transiciones de estado (SDD 6.1)."""

from enum import StrEnum

from app.domain.enums import Estado


class TipoActor(StrEnum):
    SOLICITANTE = "SOLICITANTE"
    AGENTE = "AGENTE"


TRANSICIONES: dict[tuple[Estado, Estado], TipoActor] = {
    (Estado.PENDIENTE_CONFIRMACION, Estado.RESUELTO): TipoActor.SOLICITANTE,
    (Estado.PENDIENTE_CONFIRMACION, Estado.ABIERTO): TipoActor.SOLICITANTE,
    (Estado.ABIERTO, Estado.EN_ATENCION): TipoActor.AGENTE,
    (Estado.EN_ATENCION, Estado.RESUELTO): TipoActor.AGENTE,
}


def puede_transitar(desde: Estado, hacia: Estado, actor: TipoActor) -> bool:
    return TRANSICIONES.get((desde, hacia)) is actor


def destinos_permitidos(desde: Estado, actor: TipoActor) -> list[Estado]:
    return [h for (d, h), a in TRANSICIONES.items() if d is desde and a is actor]
