"""Dobles de prueba: repositorios en memoria, reloj fijo y clasificador/enrutador fijos."""

import copy
from datetime import UTC, datetime, timedelta

from app.domain.entities import (
    ClassificationResult,
    Evento,
    Faq,
    Ticket,
    TicketEntrante,
    Usuario,
    generar_id,
)
from app.domain.enums import ESTADOS_ACTIVOS, Categoria, Estado, Metodo, Rol, SistemaOrigen
from app.domain.ports import PAGINACION_POR_DEFECTO, Filtros, Pagina, Paginacion

AHORA = datetime(2026, 11, 3, 15, 0, tzinfo=UTC)

ESTUDIANTE = Usuario(1, "Estudiante Demo", "estudiante@demo.unad.edu.co", Rol.SOLICITANTE)
DOCENTE = Usuario(2, "Docente Demo", "docente@demo.unad.edu.co", Rol.SOLICITANTE)
FUNCIONAL1 = Usuario(3, "Funcional Uno", "funcional1@demo.unad.edu.co", Rol.SOPORTE_FUNCIONAL)
FUNCIONAL2 = Usuario(4, "Funcional Dos", "funcional2@demo.unad.edu.co", Rol.SOPORTE_FUNCIONAL)
TECNICO = Usuario(5, "Técnico Demo", "tecnico@demo.unad.edu.co", Rol.SOPORTE_TECNICO)
TODOS = [ESTUDIANTE, DOCENTE, FUNCIONAL1, FUNCIONAL2, TECNICO]


class FakeClock:
    def __init__(self, inicio: datetime = AHORA) -> None:
        self.ahora = inicio

    def __call__(self) -> datetime:
        return self.ahora

    def avanzar(self, **kwargs: float) -> None:
        self.ahora += timedelta(**kwargs)


def entrante(
    asunto: str = "¿Dónde veo mis actividades?",
    descripcion: str = "No sé en qué parte están mis actividades.",
    sistema: SistemaOrigen = SistemaOrigen.MAIA,
) -> TicketEntrante:
    return TicketEntrante(sistema, asunto, descripcion)


def clasificacion(
    categoria: Categoria, confianza: float = 0.8, metodo: Metodo = Metodo.RULES
) -> ClassificationResult:
    respuesta = "Ingresa al curso y abre Actividades." if categoria is Categoria.AUTO else None
    return ClassificationResult(categoria, f"motivo {categoria}", confianza, respuesta, metodo)


def ticket(
    categoria: Categoria = Categoria.FUNCIONAL,
    responsable: Usuario | None = FUNCIONAL1,
    solicitante: Usuario = ESTUDIANTE,
    ticket_id: str = "TCK-0001",
) -> Ticket:
    t = Ticket.registrar(ticket_id, entrante(), solicitante.id, clasificacion(categoria), AHORA)
    if categoria is not Categoria.AUTO and responsable is not None:
        t.asignar(responsable, AHORA)
    return t


class InMemoryUserRepository:
    def __init__(self, usuarios: list[Usuario] | None = None) -> None:
        self._usuarios = {u.id: u for u in (TODOS if usuarios is None else usuarios)}

    def get(self, user_id: int) -> Usuario | None:
        return self._usuarios.get(user_id)

    def get_by_email(self, email: str) -> Usuario | None:
        return next((u for u in self._usuarios.values() if u.email == email.lower()), None)

    def list_by_rol(self, rol: Rol) -> list[Usuario]:
        return sorted((u for u in self._usuarios.values() if u.rol is rol), key=lambda u: u.id)

    def list_all(self) -> list[Usuario]:
        return list(self._usuarios.values())


class InMemoryTicketRepository:
    def __init__(self, users: InMemoryUserRepository) -> None:
        self._users = users
        self.tickets: dict[str, Ticket] = {}
        self.eventos: list[Evento] = []

    def next_id(self) -> str:
        return generar_id(len(self.tickets) + 1)

    def add(self, ticket: Ticket) -> None:
        self._guardar(ticket)

    def save(self, ticket: Ticket) -> None:
        self._guardar(ticket)

    def get(self, ticket_id: str) -> Ticket | None:
        t = self.tickets.get(ticket_id)
        return copy.deepcopy(t) if t else None

    def list_by_requester(
        self, user_id: int, filtros: Filtros, paginacion: Paginacion = PAGINACION_POR_DEFECTO
    ) -> Pagina[Ticket]:
        return _paginar(
            [t for t in self.tickets.values() if t.usuario_id == user_id and _cumple(t, filtros)],
            paginacion,
        )

    def list_by_assignee(
        self, user_id: int, filtros: Filtros, paginacion: Paginacion = PAGINACION_POR_DEFECTO
    ) -> Pagina[Ticket]:
        return _paginar(
            [
                t
                for t in self.tickets.values()
                if t.responsable_id == user_id and _cumple(t, filtros)
            ],
            paginacion,
        )

    def count_by_estado_for_requester(self, user_id: int) -> dict[Estado, int]:
        return _contar([t for t in self.tickets.values() if t.usuario_id == user_id])

    def count_by_estado_for_assignee(self, user_id: int) -> dict[Estado, int]:
        return _contar([t for t in self.tickets.values() if t.responsable_id == user_id])

    def count_open_by_agent(self, rol: Rol) -> dict[int, int]:
        conteo: dict[int, int] = {}
        for t in self.tickets.values():
            agente = self._users.get(t.responsable_id) if t.responsable_id else None
            if agente and agente.rol is rol and t.estado in ESTADOS_ACTIVOS:
                conteo[agente.id] = conteo.get(agente.id, 0) + 1
        return conteo

    def list_events(self, ticket_id: str) -> list[Evento]:
        return [e for e in self.eventos if e.ticket_id == ticket_id]

    def _guardar(self, ticket: Ticket) -> None:
        self.eventos.extend(ticket.eventos_nuevos)
        ticket.eventos_nuevos.clear()
        self.tickets[ticket.id] = copy.deepcopy(ticket)


def _paginar(tickets: list[Ticket], p: Paginacion) -> Pagina[Ticket]:
    orden = sorted(tickets, key=lambda t: (t.fecha_actualizacion, t.id), reverse=True)
    return Pagina(orden[p.desplazamiento : p.desplazamiento + p.limite], len(orden))


def _contar(tickets: list[Ticket]) -> dict[Estado, int]:
    conteo: dict[Estado, int] = {}
    for t in tickets:
        conteo[t.estado] = conteo.get(t.estado, 0) + 1
    return conteo


def _cumple(t: Ticket, f: Filtros) -> bool:
    texto = (f.texto or "").strip().lower()
    return (
        (f.estado is None or t.estado is f.estado)
        and (not f.estados or t.estado in f.estados)
        and (not texto or texto in t.id.lower() or texto in t.asunto.lower())
        and (f.categoria is None or t.categoria is f.categoria)
        and (f.sistema_origen is None or t.sistema_origen is f.sistema_origen)
    )


class InMemoryFaqRepository:
    def __init__(self, faqs: list[Faq] | None = None) -> None:
        self._faqs = faqs or []

    def list_all(self) -> list[Faq]:
        return list(self._faqs)


class FakeUoW:
    def __init__(self, usuarios: list[Usuario] | None = None) -> None:
        self.users = InMemoryUserRepository(usuarios)
        self.tickets = InMemoryTicketRepository(self.users)
        self.faqs = InMemoryFaqRepository()
        self.commits = 0

    def commit(self) -> None:
        self.commits += 1

    def rollback(self) -> None:
        pass


class FixedClassifier:
    def __init__(self, resultado: ClassificationResult) -> None:
        self.resultado = resultado

    def classify(self, entrante: TicketEntrante) -> ClassificationResult:
        return self.resultado
