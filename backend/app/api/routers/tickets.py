from typing import Annotated, Any

from fastapi import APIRouter, Query, Response, status

from app.api.deps import ActorDep, ContainerDep, RouterDep, UowDep
from app.api.schemas import (
    CambiarEstadoRequest,
    ConfirmacionRequest,
    CrearTicketRequest,
    ErrorResponse,
    EventoResponse,
    ResumenResponse,
    TicketResponse,
    evento_response,
    ticket_response,
)
from app.application.tickets import (
    CambiarEstado,
    ConfirmarRespuesta,
    CrearTicket,
    ListarEventos,
    ListarTickets,
    ObtenerTicket,
    ResumenTickets,
)
from app.domain.entities import TicketEntrante, Usuario
from app.domain.enums import Categoria, Estado, SistemaOrigen
from app.domain.ports import LIMITE_MAXIMO, LIMITE_POR_DEFECTO, Filtros, Paginacion
from app.infrastructure.repositories import SqlUnitOfWork

router = APIRouter(prefix="/tickets", tags=["tickets"])

_ERRORES: dict[int | str, dict[str, Any]] = {
    400: {"model": ErrorResponse},
    401: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
}


def _usuarios(uow: SqlUnitOfWork) -> dict[int, Usuario]:
    return {u.id: u for u in uow.users.list_all()}


@router.get("", response_model=list[TicketResponse], responses=_ERRORES)
def listar(
    actor: ActorDep,
    uow: UowDep,
    response: Response,
    estado: Annotated[list[Estado] | None, Query()] = None,
    categoria: Annotated[Categoria | None, Query()] = None,
    sistema_origen: Annotated[SistemaOrigen | None, Query()] = None,
    q: Annotated[str | None, Query(max_length=150, description="Número o asunto")] = None,
    limite: Annotated[int, Query(ge=1, le=LIMITE_MAXIMO)] = LIMITE_POR_DEFECTO,
    desplazamiento: Annotated[int, Query(ge=0)] = 0,
) -> list[TicketResponse]:
    """Página de tickets, del más reciente al más antiguo. El total va en `X-Total-Count`.

    `estado` se puede repetir (`?estado=ABIERTO&estado=EN_ATENCION`).
    """
    filtros = Filtros(
        categoria=categoria, sistema_origen=sistema_origen, estados=tuple(estado or ()), texto=q
    )
    pagina = ListarTickets(uow).ejecutar(actor, filtros, Paginacion(limite, desplazamiento))
    response.headers["X-Total-Count"] = str(pagina.total)
    usuarios = _usuarios(uow)
    return [ticket_response(t, usuarios) for t in pagina.items]


@router.get("/resumen", response_model=ResumenResponse, responses=_ERRORES)
def resumen(actor: ActorDep, uow: UowDep) -> ResumenResponse:
    """Conteo por estado de los tickets del actor, para los contadores del panel."""
    por_estado = ResumenTickets(uow).ejecutar(actor)
    return ResumenResponse(total=sum(por_estado.values()), por_estado=por_estado)


@router.post(
    "", response_model=TicketResponse, status_code=status.HTTP_201_CREATED, responses=_ERRORES
)
def crear(
    body: CrearTicketRequest,
    actor: ActorDep,
    uow: UowDep,
    container: ContainerDep,
    router_agentes: RouterDep,
) -> TicketResponse:
    if body.payload is not None:
        entrante = container.adapters.normalize(body.sistema_origen.value, body.payload)
    else:
        entrante = TicketEntrante(body.sistema_origen, body.asunto or "", body.descripcion or "")
    ticket = CrearTicket(uow, container.classifier, router_agentes, container.clock).ejecutar(
        entrante, actor
    )
    return ticket_response(ticket, _usuarios(uow))


@router.get("/{ticket_id}", response_model=TicketResponse, responses=_ERRORES)
def obtener(ticket_id: str, actor: ActorDep, uow: UowDep) -> TicketResponse:
    ticket = ObtenerTicket(uow).ejecutar(actor, ticket_id)
    return ticket_response(ticket, _usuarios(uow))


@router.get("/{ticket_id}/eventos", response_model=list[EventoResponse], responses=_ERRORES)
def eventos(ticket_id: str, actor: ActorDep, uow: UowDep) -> list[EventoResponse]:
    lista = ListarEventos(uow).ejecutar(actor, ticket_id)
    usuarios = _usuarios(uow)
    return [evento_response(e, usuarios) for e in lista]


@router.patch("/{ticket_id}", response_model=TicketResponse, responses=_ERRORES)
def cambiar_estado(
    ticket_id: str,
    body: CambiarEstadoRequest,
    actor: ActorDep,
    uow: UowDep,
    container: ContainerDep,
) -> TicketResponse:
    ticket = CambiarEstado(uow, container.clock).ejecutar(actor, ticket_id, body.estado)
    return ticket_response(ticket, _usuarios(uow))


@router.patch("/{ticket_id}/confirmacion", response_model=TicketResponse, responses=_ERRORES)
def confirmar(
    ticket_id: str,
    body: ConfirmacionRequest,
    actor: ActorDep,
    uow: UowDep,
    container: ContainerDep,
    router_agentes: RouterDep,
) -> TicketResponse:
    ticket = ConfirmarRespuesta(uow, router_agentes, container.clock).ejecutar(
        actor, ticket_id, body.resuelto
    )
    return ticket_response(ticket, _usuarios(uow))
