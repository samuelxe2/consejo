from fastapi import APIRouter

from app.api.deps import ContainerDep, SesionDep, UowDep
from app.api.schemas import ErrorResponse, LoginRequest, LoginResponse, MensajeResponse
from app.application.auth import CerrarSesion, IniciarSesion

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/login",
    response_model=LoginResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}},
)
def login(body: LoginRequest, uow: UowDep, container: ContainerDep) -> LoginResponse:
    sesion = IniciarSesion(uow, container.sessions, container.clock).ejecutar(body.email)
    return LoginResponse(
        token=sesion.token,
        rol=sesion.usuario.rol,
        nombre=sesion.usuario.nombre,
        email=sesion.usuario.email,
        expira=sesion.expira,
    )


@router.post("/logout", response_model=MensajeResponse, responses={401: {"model": ErrorResponse}})
def logout(sesion: SesionDep, container: ContainerDep) -> MensajeResponse:
    CerrarSesion(container.sessions).ejecutar(sesion.token)
    return MensajeResponse(detalle="Sesión cerrada.")
