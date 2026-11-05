"""Puertos del dominio: contratos que implementa la infraestructura (SDD 3.8)."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Generic, Protocol, TypeVar

from app.domain.entities import ClassificationResult, Evento, Faq, Ticket, TicketEntrante, Usuario
from app.domain.enums import Categoria, Estado, Rol, SistemaOrigen

Clock = Callable[[], datetime]


def ahora_utc() -> datetime:
    return datetime.now(UTC)


T = TypeVar("T")

LIMITE_POR_DEFECTO = 50
LIMITE_MAXIMO = 100


@dataclass(frozen=True)
class Filtros:
    categoria: Categoria | None = None
    sistema_origen: SistemaOrigen | None = None
    # Estados admitidos (p. ej. "pendientes" = PENDIENTE_CONFIRMACION + ABIERTO); vacío = todos.
    estados: tuple[Estado, ...] = ()
    # Búsqueda por número o asunto.
    texto: str | None = None


@dataclass(frozen=True)
class Paginacion:
    limite: int = LIMITE_POR_DEFECTO
    desplazamiento: int = 0


# Inmutable: se puede usar como valor por defecto sin compartir estado.
PAGINACION_POR_DEFECTO = Paginacion()


@dataclass(frozen=True)
class Pagina(Generic[T]):
    items: list[T]
    total: int


@dataclass(frozen=True)
class Sesion:
    token: str
    usuario: Usuario
    expira: datetime


class TicketClassifier(Protocol):
    def classify(self, entrante: TicketEntrante) -> ClassificationResult: ...


class SourceAdapter(Protocol):
    sistema: SistemaOrigen

    def normalize(self, payload: Mapping[str, Any]) -> TicketEntrante: ...


class SugeridorConsultas(Protocol):
    """Consulta frecuente que responde una solicitud, con la misma regla del clasificador."""

    def consulta_frecuente(self, texto: str) -> Faq | None: ...


class TicketRouter(Protocol):
    def select_agent(self, categoria: Categoria) -> Usuario | None: ...


class TicketRepository(Protocol):
    def next_id(self) -> str: ...
    def add(self, ticket: Ticket) -> None: ...
    def save(self, ticket: Ticket) -> None: ...
    def get(self, ticket_id: str) -> Ticket | None: ...
    def list_by_requester(
        self, user_id: int, filtros: Filtros, paginacion: Paginacion = PAGINACION_POR_DEFECTO
    ) -> Pagina[Ticket]: ...
    def list_by_assignee(
        self, user_id: int, filtros: Filtros, paginacion: Paginacion = PAGINACION_POR_DEFECTO
    ) -> Pagina[Ticket]: ...
    def count_by_estado_for_requester(self, user_id: int) -> dict[Estado, int]: ...
    def count_by_estado_for_assignee(self, user_id: int) -> dict[Estado, int]: ...
    def count_open_by_agent(self, rol: Rol) -> dict[int, int]: ...
    def list_unassigned(self, categoria: Categoria) -> list[Ticket]: ...
    def list_events(self, ticket_id: str) -> list[Evento]: ...


class UserRepository(Protocol):
    def get(self, user_id: int) -> Usuario | None: ...
    def get_by_email(self, email: str) -> Usuario | None: ...
    def list_by_rol(self, rol: Rol) -> list[Usuario]: ...
    def list_all(self) -> list[Usuario]: ...


class FaqRepository(Protocol):
    def list_all(self) -> list[Faq]: ...


class UnitOfWork(Protocol):
    """Una transacción por caso de uso: o se guarda todo o nada."""

    @property
    def tickets(self) -> TicketRepository: ...
    @property
    def users(self) -> UserRepository: ...
    @property
    def faqs(self) -> FaqRepository: ...

    def commit(self) -> None: ...
    def rollback(self) -> None: ...


class SessionStore(Protocol):
    def create(self, usuario: Usuario) -> Sesion: ...
    def get(self, token: str) -> Sesion | None: ...
    def revoke(self, token: str) -> None: ...
