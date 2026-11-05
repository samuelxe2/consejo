"""RUT-01 a RUT-06: enrutador por menor carga."""

from app.domain.enums import Categoria, Estado
from app.infrastructure.router import LeastLoadedRouter
from tests.fakes import AHORA, FUNCIONAL1, FUNCIONAL2, TECNICO, FakeUoW, ticket


def _con_tickets(uow: FakeUoW, asignaciones: list[tuple[object, Estado]]) -> None:
    for n, (agente, estado) in enumerate(asignaciones, start=1):
        t = ticket(responsable=agente, ticket_id=f"TCK-{n:04d}")  # type: ignore[arg-type]
        t.estado = estado
        uow.tickets.add(t)


def _router(uow: FakeUoW) -> LeastLoadedRouter:
    return LeastLoadedRouter(uow.users, uow.tickets)


def test_rut01_elige_menor_carga() -> None:
    uow = FakeUoW()
    _con_tickets(uow, [(FUNCIONAL1, Estado.ABIERTO)] * 3 + [(FUNCIONAL2, Estado.ABIERTO)])
    assert _router(uow).select_agent(Categoria.FUNCIONAL) == FUNCIONAL2


def test_rut02_empate_menor_id() -> None:
    uow = FakeUoW()
    _con_tickets(uow, [(FUNCIONAL1, Estado.ABIERTO), (FUNCIONAL2, Estado.EN_ATENCION)])
    assert _router(uow).select_agent(Categoria.FUNCIONAL) == FUNCIONAL1


def test_rut03_respeta_el_rol() -> None:
    uow = FakeUoW()
    _con_tickets(uow, [(FUNCIONAL1, Estado.ABIERTO)])
    assert _router(uow).select_agent(Categoria.TECNICO) == TECNICO
    assert _router(uow).select_agent(Categoria.AUTO) is None


def test_rut04_agente_sin_tickets_gana() -> None:
    uow = FakeUoW()
    _con_tickets(uow, [(FUNCIONAL1, Estado.ABIERTO)])
    assert _router(uow).select_agent(Categoria.FUNCIONAL) == FUNCIONAL2


def test_rut05_resueltos_no_cuentan() -> None:
    uow = FakeUoW()
    _con_tickets(uow, [(FUNCIONAL1, Estado.RESUELTO)] * 3 + [(FUNCIONAL2, Estado.ABIERTO)])
    assert _router(uow).select_agent(Categoria.FUNCIONAL) == FUNCIONAL1


def test_rut06_sin_agentes_del_rol() -> None:
    uow = FakeUoW(usuarios=[FUNCIONAL1])
    assert _router(uow).select_agent(Categoria.TECNICO) is None
    assert AHORA  # el reloj fijo se usa en los tickets creados
