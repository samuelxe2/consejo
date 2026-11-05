"""REP-01 a REP-04 y UC-08: repositorio SQL sobre SQLite en memoria."""

from datetime import UTC
from typing import Any

import pytest
from sqlalchemy import delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.application.tickets import CrearTicket
from app.domain.enums import Categoria, Estado, Rol, TipoEvento
from app.domain.ports import Filtros
from app.infrastructure.classifiers.rules import RuleBasedClassifier
from app.infrastructure.consultas_frecuentes import como_faqs
from app.infrastructure.db import FaqModel, TicketModel
from app.infrastructure.repositories import SqlUnitOfWork, ticket_to_entity
from app.infrastructure.router import LeastLoadedRouter
from app.infrastructure.seed import seed
from tests.fakes import ESTUDIANTE, FUNCIONAL1, FUNCIONAL2, FakeClock, entrante, ticket


def _uow(factory: sessionmaker[Any]) -> SqlUnitOfWork:
    return SqlUnitOfWork(factory)


def test_rep01_guardar_y_recuperar(session_factory: sessionmaker[Any]) -> None:
    original = ticket()
    uow = _uow(session_factory)
    assert uow.tickets.next_id() == original.id  # el número sale de la secuencia
    uow.tickets.add(original)
    uow.commit()
    uow.close()

    otra = _uow(session_factory)
    leido = otra.tickets.get(original.id)
    assert leido == original
    assert leido is not None and leido.fecha_creacion.tzinfo is UTC
    assert [e.tipo for e in otra.tickets.list_events(original.id)] == [
        TipoEvento.CREADO,
        TipoEvento.CLASIFICADO,
        TipoEvento.ASIGNADO,
    ]
    assert otra.tickets.next_id() == "TCK-0002"
    otra.close()


def test_rep01_save_actualiza_y_agrega_eventos(session_factory: sessionmaker[Any]) -> None:
    uow = _uow(session_factory)
    t = ticket()
    uow.tickets.add(t)
    t.cambiar_estado(Estado.EN_ATENCION, FUNCIONAL1, FakeClock()())
    uow.tickets.save(t)
    uow.commit()
    assert uow.tickets.get(t.id).estado is Estado.EN_ATENCION  # type: ignore[union-attr]
    assert len(uow.tickets.list_events(t.id)) == 4
    with pytest.raises(LookupError):
        uow.tickets.save(ticket(ticket_id="TCK-0999"))
    uow.close()


@pytest.mark.parametrize(
    ("campo", "valor"), [("estado", "INVENTADO"), ("usuario_id", 999), ("confianza", 2.0)]
)
def test_rep02_restricciones(session_factory: sessionmaker[Any], campo: str, valor: object) -> None:
    uow = _uow(session_factory)
    t = ticket()
    uow.tickets.add(t)
    uow.commit()
    modelo = uow.session.get(TicketModel, t.id)
    setattr(modelo, campo, valor)
    with pytest.raises(IntegrityError):
        uow.session.flush()
    uow.close()


def test_rep03_conteo_de_carga(session_factory: sessionmaker[Any]) -> None:
    uow = _uow(session_factory)
    for n, (agente, estado) in enumerate(
        [
            (FUNCIONAL1, Estado.ABIERTO),
            (FUNCIONAL1, Estado.EN_ATENCION),
            (FUNCIONAL1, Estado.RESUELTO),
            (FUNCIONAL2, Estado.ABIERTO),
        ],
        start=1,
    ):
        t = ticket(responsable=agente, ticket_id=f"TCK-{n:04d}")
        t.estado = estado
        uow.tickets.add(t)
    assert uow.tickets.count_open_by_agent(Rol.SOPORTE_FUNCIONAL) == {3: 2, 4: 1}
    assert uow.tickets.count_open_by_agent(Rol.SOPORTE_TECNICO) == {}
    uow.close()


def test_rep04_mapeo_ida_y_vuelta(session_factory: sessionmaker[Any]) -> None:
    uow = _uow(session_factory)
    original = ticket(Categoria.AUTO)
    uow.tickets.add(original)
    modelo = uow.session.get(TicketModel, original.id)
    assert modelo is not None
    assert ticket_to_entity(modelo) == original
    uow.close()


def test_repositorios_de_usuarios_faq_y_filtros(session_factory: sessionmaker[Any]) -> None:
    uow = _uow(session_factory)
    assert uow.users.get_by_email(" Estudiante@DEMO.unad.edu.co ") == ESTUDIANTE
    assert uow.users.get(99) is None
    assert [u.id for u in uow.users.list_by_rol(Rol.SOPORTE_FUNCIONAL)] == [3, 4]
    assert len(uow.faqs.list_all()) >= 6
    uow.tickets.add(ticket())
    uow.tickets.add(ticket(Categoria.AUTO, ticket_id="TCK-0002"))
    assert len(uow.tickets.list_by_requester(1, Filtros(categoria=Categoria.AUTO)).items) == 1
    assert len(uow.tickets.list_by_assignee(3, Filtros(estados=(Estado.ABIERTO,))).items) == 1
    uow.close()


def test_uc08_fallo_a_mitad_no_deja_ticket_sin_eventos(
    session_factory: sessionmaker[Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    uow = _uow(session_factory)

    def falla(*_: object) -> None:
        raise RuntimeError("disco lleno")

    monkeypatch.setattr(uow.tickets, "_guardar_eventos", falla)
    caso = CrearTicket(
        uow, RuleBasedClassifier([]), LeastLoadedRouter(uow.users, uow.tickets), FakeClock()
    )
    with pytest.raises(RuntimeError):
        caso.ejecutar(entrante("No encuentro el botón", "Descripción del problema."), ESTUDIANTE)
    uow.close()

    verificacion = _uow(session_factory)
    assert verificacion.tickets.list_by_requester(ESTUDIANTE.id, Filtros()).items == []
    verificacion.close()


def test_seed_sincroniza_faqs_en_bases_existentes(session_factory: sessionmaker[Any]) -> None:
    with session_factory() as s:
        s.execute(delete(FaqModel).where(FaqModel.id == 1))
        s.commit()
    seed(session_factory, demo_tickets=False)
    uow = SqlUnitOfWork(session_factory)
    try:
        assert len(uow.faqs.list_all()) == len(como_faqs())
    finally:
        uow.close()
