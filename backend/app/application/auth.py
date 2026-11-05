from app.domain.entities import Usuario
from app.domain.enums import ROL_POR_CATEGORIA
from app.domain.errors import NoAutenticado
from app.domain.ports import Clock, Sesion, SessionStore, UnitOfWork


class IniciarSesion:
    def __init__(self, uow: UnitOfWork, sessions: SessionStore, clock: Clock) -> None:
        self._uow = uow
        self._sessions = sessions
        self._clock = clock

    def ejecutar(self, email: str) -> Sesion:
        usuario = self._uow.users.get_by_email(email)
        if usuario is None:
            raise NoAutenticado("Identidad de demostración no encontrada.")
        self._tomar_huerfanos(usuario)
        return self._sessions.create(usuario)

    def _tomar_huerfanos(self, agente: Usuario) -> None:
        """Tickets que quedaron sin responsable porque no había agente de su rol."""
        if not agente.rol.es_agente:
            return
        ahora = self._clock()
        for categoria, rol in ROL_POR_CATEGORIA.items():
            if rol is not agente.rol:
                continue
            huerfanos = self._uow.tickets.list_unassigned(categoria)
            for ticket in huerfanos:
                ticket.asignar(agente, ahora)
                self._uow.tickets.save(ticket)
            if huerfanos:
                self._uow.commit()


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
