"""Número de ticket con secuencia atómica (antes: max(id) + 1)."""

import threading
import time
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import Engine, select
from sqlalchemy.orm import sessionmaker

from app.infrastructure.db import (
    SECUENCIA_TICKETS,
    SecuenciaModel,
    TicketModel,
    create_schema,
    make_engine,
    make_session_factory,
)
from app.infrastructure.repositories import SqlUnitOfWork
from app.infrastructure.seed import seed
from tests.fakes import FakeClock, ticket

Fabrica = Callable[[Path], sessionmaker[Any]]


@pytest.fixture
def motores() -> Iterator[list[Engine]]:
    """Cierra al final las bases en archivo que abra cada prueba."""
    lista: list[Engine] = []
    yield lista
    for e in lista:
        e.dispose()


@pytest.fixture
def base_en_archivo(motores: list[Engine]) -> Fabrica:
    def crear(ruta: Path) -> sessionmaker[Any]:
        engine = make_engine(f"sqlite:///{ruta}")
        motores.append(engine)
        create_schema(engine)
        factory = make_session_factory(engine)
        seed(factory, FakeClock(), demo_tickets=False)
        return factory

    return crear


def test_numeros_unicos_con_solicitudes_simultaneas(
    tmp_path: Path, base_en_archivo: Fabrica
) -> None:
    """Varias transacciones piden número a la vez: ninguno se repite ni se salta."""
    factory = base_en_archivo(tmp_path / "concurrencia.db")
    ids: list[str] = []
    errores: list[BaseException] = []
    candado = threading.Lock()

    def crear() -> None:
        uow = SqlUnitOfWork(factory)
        try:
            numero = uow.tickets.next_id()
            time.sleep(0.02)  # ensancha la ventana en la que max(id) + 1 se repetía
            uow.commit()
            with candado:
                ids.append(numero)
        except BaseException as e:  # noqa: BLE001 - se reporta en la aserción
            errores.append(e)
        finally:
            uow.close()

    hilos = [threading.Thread(target=crear) for _ in range(8)]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join()

    assert errores == []
    assert sorted(ids) == [f"TCK-{n:04d}" for n in range(1, 9)]


def test_un_rollback_devuelve_el_numero(session_factory: sessionmaker[Any]) -> None:
    uow = SqlUnitOfWork(session_factory)
    assert uow.tickets.next_id() == "TCK-0001"
    uow.rollback()
    assert uow.tickets.next_id() == "TCK-0001"
    uow.close()


def test_pasa_de_9999_a_10000(session_factory: sessionmaker[Any]) -> None:
    """Con max(id) como texto, 'TCK-9999' > 'TCK-10000' y se repetiría el número."""
    with session_factory() as s:
        s.execute(
            SecuenciaModel.__table__.update()
            .where(SecuenciaModel.nombre == SECUENCIA_TICKETS)
            .values(valor=9999)
        )
        s.commit()
    uow = SqlUnitOfWork(session_factory)
    assert uow.tickets.next_id() == "TCK-10000"
    uow.close()


def test_una_base_anterior_continua_desde_su_mayor_numero(
    tmp_path: Path, base_en_archivo: Fabrica, motores: list[Engine]
) -> None:
    """Al actualizar, el contador arranca después del mayor ticket existente."""
    ruta = tmp_path / "anterior.db"
    factory = base_en_archivo(ruta)
    original = ticket(ticket_id="TCK-0041")
    uow = SqlUnitOfWork(factory)
    uow.tickets.add(original)
    uow.commit()
    uow.close()
    # Simula una base creada antes de existir la tabla de secuencias.
    with factory() as s:
        s.execute(SecuenciaModel.__table__.delete())
        s.commit()

    engine = make_engine(f"sqlite:///{ruta}")
    motores.append(engine)
    create_schema(engine)
    nueva = SqlUnitOfWork(make_session_factory(engine))
    assert nueva.tickets.next_id() == "TCK-0042"
    nueva.commit()
    nueva.close()

    # create_schema es idempotente: no reinicia un contador que ya existe.
    create_schema(engine)
    with factory() as s:
        assert s.scalar(select(TicketModel.id)) == "TCK-0041"
        assert (
            s.scalar(select(SecuenciaModel.valor).where(SecuenciaModel.nombre == SECUENCIA_TICKETS))
            == 42
        )
