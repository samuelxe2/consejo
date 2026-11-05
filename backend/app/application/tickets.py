"""Casos de uso de tickets. Cada uno es una transacción (SDD 3.7)."""

import logging

from app.domain.entities import Evento, Faq, Ticket, TicketEntrante, Usuario
from app.domain.enums import Categoria, Estado
from app.domain.errors import TicketNoEncontrado, ValidacionError
from app.domain.ports import (
    PAGINACION_POR_DEFECTO,
    Clock,
    Filtros,
    Pagina,
    Paginacion,
    SugeridorConsultas,
    TicketClassifier,
    TicketRouter,
    UnitOfWork,
)

logger = logging.getLogger(__name__)


def _obtener_accesible(uow: UnitOfWork, ticket_id: str, actor: Usuario) -> Ticket:
    """Un ticket ajeno se trata como inexistente para no revelar que existe (404)."""
    ticket = uow.tickets.get(ticket_id)
    if ticket is None:
        raise TicketNoEncontrado(ticket_id)
    propietario = ticket.responsable_id if actor.rol.es_agente else ticket.usuario_id
    if propietario != actor.id:
        raise TicketNoEncontrado(ticket_id)
    return ticket


class CrearTicket:
    def __init__(
        self, uow: UnitOfWork, classifier: TicketClassifier, router: TicketRouter, clock: Clock
    ) -> None:
        self._uow = uow
        self._classifier = classifier
        self._router = router
        self._clock = clock

    def ejecutar(self, entrante: TicketEntrante, actor: Usuario) -> Ticket:
        if actor.rol.es_agente:
            raise ValidacionError("Solo los solicitantes pueden crear tickets.")
        email = entrante.usuario_email
        if email is not None and email.lower() != actor.email.lower():
            raise ValidacionError("El usuario del payload no coincide con la sesión.", "usuario")

        clasificacion = self._classifier.classify(entrante)
        ahora = self._clock()
        ticket = Ticket.registrar(
            self._uow.tickets.next_id(), entrante, actor.id, clasificacion, ahora
        )
        if ticket.requiere_agente:
            ticket.asignar(self._router.select_agent(ticket.categoria), ahora)
        self._uow.tickets.add(ticket)
        self._uow.commit()
        logger.info(
            "ticket_creado ticket_id=%s categoria=%s metodo=%s responsable_id=%s",
            ticket.id,
            ticket.categoria,
            ticket.metodo_clasificacion,
            ticket.responsable_id,
        )
        return ticket


class ListarTickets:
    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    def ejecutar(
        self, actor: Usuario, filtros: Filtros, paginacion: Paginacion = PAGINACION_POR_DEFECTO
    ) -> Pagina[Ticket]:
        if actor.rol.es_agente:
            return self._uow.tickets.list_by_assignee(actor.id, filtros, paginacion)
        return self._uow.tickets.list_by_requester(actor.id, filtros, paginacion)


class ResumenTickets:
    """Cuántos tickets tiene el actor en cada estado, calculado en la base (no en el cliente)."""

    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    def ejecutar(self, actor: Usuario) -> dict[Estado, int]:
        if actor.rol.es_agente:
            conteo = self._uow.tickets.count_by_estado_for_assignee(actor.id)
        else:
            conteo = self._uow.tickets.count_by_estado_for_requester(actor.id)
        return {estado: conteo.get(estado, 0) for estado in Estado}


class SugerirConsulta:
    """Consulta frecuente que respondería lo que el usuario está escribiendo (sin crear ticket)."""

    def __init__(self, sugeridor: SugeridorConsultas) -> None:
        self._sugeridor = sugeridor

    def ejecutar(self, asunto: str, descripcion: str) -> Faq | None:
        texto = f"{asunto} {descripcion}".strip()
        return self._sugeridor.consulta_frecuente(texto) if len(texto) >= 3 else None


class ObtenerTicket:
    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    def ejecutar(self, actor: Usuario, ticket_id: str) -> Ticket:
        return _obtener_accesible(self._uow, ticket_id, actor)


class ListarEventos:
    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    def ejecutar(self, actor: Usuario, ticket_id: str) -> list[Evento]:
        _obtener_accesible(self._uow, ticket_id, actor)
        return self._uow.tickets.list_events(ticket_id)


class CambiarEstado:
    def __init__(self, uow: UnitOfWork, clock: Clock) -> None:
        self._uow = uow
        self._clock = clock

    def ejecutar(self, actor: Usuario, ticket_id: str, nuevo: Estado) -> Ticket:
        ticket = _obtener_accesible(self._uow, ticket_id, actor)
        ticket.cambiar_estado(nuevo, actor, self._clock())
        self._uow.tickets.save(ticket)
        self._uow.commit()
        logger.info("estado_cambiado ticket_id=%s estado=%s", ticket.id, ticket.estado)
        return ticket


class ConfirmarRespuesta:
    def __init__(self, uow: UnitOfWork, router: TicketRouter, clock: Clock) -> None:
        self._uow = uow
        self._router = router
        self._clock = clock

    def ejecutar(self, actor: Usuario, ticket_id: str, resuelto: bool) -> Ticket:
        ticket = _obtener_accesible(self._uow, ticket_id, actor)
        ahora = self._clock()
        ticket.confirmar(resuelto, actor, ahora)
        if not resuelto:
            ticket.asignar(self._router.select_agent(Categoria.FUNCIONAL), ahora)
        self._uow.tickets.save(ticket)
        self._uow.commit()
        logger.info("respuesta_confirmada ticket_id=%s resuelto=%s", ticket.id, resuelto)
        return ticket
