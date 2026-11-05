from app.domain.entities import Usuario
from app.domain.enums import ROL_POR_CATEGORIA, Categoria
from app.domain.ports import TicketRepository, UserRepository


class LeastLoadedRouter:
    """Elige el agente del rol con menos tickets activos; empate -> menor id (SDD 6.4)."""

    def __init__(self, users: UserRepository, tickets: TicketRepository) -> None:
        self._users = users
        self._tickets = tickets

    def select_agent(self, categoria: Categoria) -> Usuario | None:
        rol = ROL_POR_CATEGORIA.get(categoria)
        if rol is None:
            return None
        agentes = self._users.list_by_rol(rol)
        if not agentes:
            return None
        carga = self._tickets.count_open_by_agent(rol)
        return min(agentes, key=lambda a: (carga.get(a.id, 0), a.id))
