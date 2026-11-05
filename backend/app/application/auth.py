from app.domain.errors import NoAutenticado
from app.domain.ports import Sesion, SessionStore, UnitOfWork


class IniciarSesion:
    def __init__(self, uow: UnitOfWork, sessions: SessionStore) -> None:
        self._uow = uow
        self._sessions = sessions

    def ejecutar(self, email: str) -> Sesion:
        usuario = self._uow.users.get_by_email(email)
        if usuario is None:
            raise NoAutenticado("Identidad de demostración no encontrada.")
        return self._sessions.create(usuario)


class CerrarSesion:
    def __init__(self, sessions: SessionStore) -> None:
        self._sessions = sessions

    def ejecutar(self, token: str) -> None:
        self._sessions.revoke(token)


class AutenticarToken:
    def __init__(self, sessions: SessionStore) -> None:
        self._sessions = sessions

    def ejecutar(self, token: str | None) -> Sesion:
        sesion = self._sessions.get(token) if token else None
        if sesion is None:
            raise NoAutenticado("Token ausente, inválido o expirado.")
        return sesion
