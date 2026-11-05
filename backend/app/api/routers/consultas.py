from fastapi import APIRouter

from app.api.deps import ActorDep, ContainerDep, UowDep
from app.api.schemas import (
    ConsultaFrecuenteResponse,
    ErrorResponse,
    SugerenciaRequest,
    SugerenciaResponse,
    consulta_response,
)
from app.application.tickets import SugerirConsulta

router = APIRouter(prefix="/consultas-frecuentes", tags=["consultas frecuentes"])


@router.get(
    "",
    response_model=list[ConsultaFrecuenteResponse],
    responses={401: {"model": ErrorResponse}},
)
def listar(_actor: ActorDep, uow: UowDep) -> list[ConsultaFrecuenteResponse]:
    """Las mismas consultas que usa el clasificador, para resolver dudas sin crear ticket."""
    return [consulta_response(f) for f in uow.faqs.list_all()]


@router.post(
    "/sugerencia",
    response_model=SugerenciaResponse,
    responses={401: {"model": ErrorResponse}},
)
def sugerir(
    body: SugerenciaRequest, _actor: ActorDep, container: ContainerDep
) -> SugerenciaResponse:
    """Consulta frecuente que respondería el texto, con la misma regla que usa el clasificador
    al crear el ticket. El frontend la muestra mientras el usuario escribe."""
    faq = SugerirConsulta(container.sugeridor).ejecutar(body.asunto, body.descripcion)
    return SugerenciaResponse(consulta=consulta_response(faq) if faq else None)
