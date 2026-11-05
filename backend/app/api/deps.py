from collections.abc import Iterator
from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import sessionmaker

from app.application.auth import AutenticarToken
from app.domain.entities import Usuario
from app.domain.ports import Clock, Sesion, SessionStore, SugeridorConsultas, TicketClassifier
from app.infrastructure.adapters import AdapterRegistry
from app.infrastructure.config import Settings
from app.infrastructure.repositories import SqlUnitOfWork
from app.infrastructure.router import LeastLoadedRouter


@dataclass
class Container:
    """Dependencias compartidas, armadas una vez en create_app."""

    settings: Settings
    session_factory: sessionmaker[Any]
    sessions: SessionStore
    classifier: TicketClassifier
    sugeridor: SugeridorConsultas
    adapters: AdapterRegistry
    clock: Clock


def get_container(request: Request) -> Container:
    container: Container = request.app.state.container
    return container


ContainerDep = Annotated[Container, Depends(get_container)]


def get_uow(container: ContainerDep) -> Iterator[SqlUnitOfWork]:
    uow = SqlUnitOfWork(container.session_factory)
    try:
        yield uow
    finally:
        uow.close()


UowDep = Annotated[SqlUnitOfWork, Depends(get_uow)]

_bearer = HTTPBearer(auto_error=False)


def get_sesion(
    container: ContainerDep,
    credenciales: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> Sesion:
    token = credenciales.credentials if credenciales else None
    return AutenticarToken(container.sessions).ejecutar(token)


SesionDep = Annotated[Sesion, Depends(get_sesion)]


def get_actor(sesion: SesionDep) -> Usuario:
    """El rol sale de la sesión del servidor, nunca del cliente."""
    return sesion.usuario


ActorDep = Annotated[Usuario, Depends(get_actor)]


def get_router(uow: UowDep) -> LeastLoadedRouter:
    return LeastLoadedRouter(uow.users, uow.tickets)


RouterDep = Annotated[LeastLoadedRouter, Depends(get_router)]
