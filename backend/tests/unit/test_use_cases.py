"""UC-01 a UC-07: casos de uso con repositorios en memoria y clasificador fijo.
UC-08 (transacción) se prueba contra SQLite en tests/integration/test_repository.py."""

import pytest

from app.application.auth import AutenticarToken, CerrarSesion, IniciarSesion
from app.application.tickets import (
    CambiarEstado,
    ConfirmarRespuesta,
    CrearTicket,
    ListarEventos,
    ListarTickets,
    ObtenerTicket,
)
from app.domain.entities import TicketEntrante
from app.domain.enums import Categoria, Estado, SistemaOrigen, TipoEvento
from app.domain.errors import NoAutenticado, TicketNoEncontrado, ValidacionError
from app.domain.ports import Filtros
from app.infrastructure.router import LeastLoadedRouter
from app.infrastructure.sessions import InMemorySessionStore
from tests.fakes import (
    DOCENTE,
    ESTUDIANTE,
    FUNCIONAL1,
    FUNCIONAL2,
    TECNICO,
    FakeClock,
    FakeUoW,
    FixedClassifier,
    clasificacion,
    entrante,
)


def _crear(uow: FakeUoW, categoria: Categoria, actor=ESTUDIANTE, e: TicketEntrante | None = None):
    caso = CrearTicket(
        uow,
        FixedClassifier(clasificacion(categoria)),
        LeastLoadedRouter(uow.users, uow.tickets),
        FakeClock(),
    )
    return caso.ejecutar(e or entrante(), actor)


def test_uc01_crear_auto() -> None:
    uow = FakeUoW()
    t = _crear(uow, Categoria.AUTO)
    assert t.estado is Estado.PENDIENTE_CONFIRMACION
    assert t.responsable_id is None
    assert t.respuesta_sugerida
    assert uow.commits == 1
    tipos = [e.tipo for e in uow.tickets.list_events(t.id)]
    assert tipos == [TipoEvento.CREADO, TipoEvento.CLASIFICADO]


@pytest.mark.parametrize(
    ("categoria", "agente"), [(Categoria.FUNCIONAL, FUNCIONAL1), (Categoria.TECNICO, TECNICO)]
)
def test_uc02_crear_y_asignar(categoria: Categoria, agente) -> None:
    uow = FakeUoW()
    t = _crear(uow, categoria)
    assert t.estado is Estado.ABIERTO
    assert t.responsable_id == agente.id
    assert t.respuesta_sugerida is None
    assert TipoEvento.ASIGNADO in [e.tipo for e in uow.tickets.list_events(t.id)]


def test_uc02_balancea_entre_agentes() -> None:
    uow = FakeUoW()
    primeros = [_crear(uow, Categoria.FUNCIONAL).responsable_id for _ in range(4)]
    assert primeros == [FUNCIONAL1.id, FUNCIONAL2.id, FUNCIONAL1.id, FUNCIONAL2.id]


def test_uc03_sin_agentes_disponibles() -> None:
    uow = FakeUoW(usuarios=[ESTUDIANTE])
    t = _crear(uow, Categoria.TECNICO)
    assert t.estado is Estado.ABIERTO
    assert t.responsable_id is None
    assert uow.tickets.list_events(t.id)[-1].tipo is TipoEvento.SIN_AGENTE_DISPONIBLE


def test_uc_crear_solo_solicitantes_y_usuario_coherente() -> None:
    uow = FakeUoW()
    with pytest.raises(ValidacionError):
        _crear(uow, Categoria.AUTO, actor=FUNCIONAL1)
    ajeno = TicketEntrante(
        SistemaOrigen.MAIA, "Asunto", "Descripción larga", usuario_email=DOCENTE.email
    )
    with pytest.raises(ValidacionError) as exc:
        _crear(uow, Categoria.AUTO, e=ajeno)
    assert exc.value.campo == "usuario"
    assert uow.commits == 0


def test_uc04_rechazo_reasigna_a_funcional() -> None:
    uow = FakeUoW()
    t = _crear(uow, Categoria.AUTO)
    router = LeastLoadedRouter(uow.users, uow.tickets)
    r = ConfirmarRespuesta(uow, router, FakeClock()).ejecutar(ESTUDIANTE, t.id, resuelto=False)
    assert r.categoria is Categoria.FUNCIONAL
    assert r.estado is Estado.ABIERTO
    assert r.responsable_id == FUNCIONAL1.id
    tipos = [e.tipo for e in uow.tickets.list_events(t.id)]
    assert TipoEvento.RESPUESTA_RECHAZADA in tipos
    assert TipoEvento.RECLASIFICADO in tipos
    assert tipos[-1] is TipoEvento.ASIGNADO


def test_uc04_confirmacion_resuelve() -> None:
    uow = FakeUoW()
    t = _crear(uow, Categoria.AUTO)
    router = LeastLoadedRouter(uow.users, uow.tickets)
    r = ConfirmarRespuesta(uow, router, FakeClock()).ejecutar(ESTUDIANTE, t.id, resuelto=True)
    assert r.estado is Estado.RESUELTO
    assert uow.tickets.get(t.id).estado is Estado.RESUELTO  # type: ignore[union-attr]


def test_uc05_confirmar_ticket_ajeno() -> None:
    uow = FakeUoW()
    t = _crear(uow, Categoria.AUTO)
    router = LeastLoadedRouter(uow.users, uow.tickets)
    with pytest.raises(TicketNoEncontrado):
        ConfirmarRespuesta(uow, router, FakeClock()).ejecutar(DOCENTE, t.id, resuelto=True)


def test_uc06_agente_no_asignado() -> None:
    uow = FakeUoW()
    t = _crear(uow, Categoria.FUNCIONAL)
    with pytest.raises(TicketNoEncontrado):
        CambiarEstado(uow, FakeClock()).ejecutar(FUNCIONAL2, t.id, Estado.EN_ATENCION)
    with pytest.raises(TicketNoEncontrado):
        CambiarEstado(uow, FakeClock()).ejecutar(FUNCIONAL1, "TCK-9999", Estado.EN_ATENCION)
    r = CambiarEstado(uow, FakeClock()).ejecutar(FUNCIONAL1, t.id, Estado.EN_ATENCION)
    assert r.estado is Estado.EN_ATENCION


def test_uc07_listar_por_rol_y_filtros() -> None:
    uow = FakeUoW()
    auto = _crear(uow, Categoria.AUTO)
    funcional = _crear(uow, Categoria.FUNCIONAL)
    tecnico = _crear(uow, Categoria.TECNICO)
    _crear(uow, Categoria.AUTO, actor=DOCENTE)

    listar = ListarTickets(uow)
    assert {t.id for t in listar.ejecutar(ESTUDIANTE, Filtros()).items} == {
        auto.id,
        funcional.id,
        tecnico.id,
    }
    assert [t.id for t in listar.ejecutar(FUNCIONAL1, Filtros()).items] == [funcional.id]
    assert [t.id for t in listar.ejecutar(TECNICO, Filtros()).items] == [tecnico.id]
    assert listar.ejecutar(FUNCIONAL2, Filtros()).items == []
    filtrados = listar.ejecutar(ESTUDIANTE, Filtros(categoria=Categoria.TECNICO))
    assert [t.id for t in filtrados.items] == [tecnico.id]
    pendientes = listar.ejecutar(ESTUDIANTE, Filtros(estados=(Estado.PENDIENTE_CONFIRMACION,)))
    assert [t.id for t in pendientes.items] == [auto.id]


def test_obtener_y_eventos_con_control_de_pertenencia() -> None:
    uow = FakeUoW()
    t = _crear(uow, Categoria.FUNCIONAL)
    assert ObtenerTicket(uow).ejecutar(ESTUDIANTE, t.id).id == t.id
    assert ObtenerTicket(uow).ejecutar(FUNCIONAL1, t.id).id == t.id
    assert len(ListarEventos(uow).ejecutar(ESTUDIANTE, t.id)) == 3
    for intruso in (DOCENTE, FUNCIONAL2, TECNICO):
        with pytest.raises(TicketNoEncontrado):
            ObtenerTicket(uow).ejecutar(intruso, t.id)
        with pytest.raises(TicketNoEncontrado):
            ListarEventos(uow).ejecutar(intruso, t.id)


def test_casos_de_uso_de_sesion() -> None:
    uow = FakeUoW()
    reloj = FakeClock()
    store = InMemorySessionStore(ttl_min=60, clock=reloj)
    sesion = IniciarSesion(uow, store, FakeClock()).ejecutar("ESTUDIANTE@demo.unad.edu.co")
    assert AutenticarToken(store).ejecutar(sesion.token).usuario == ESTUDIANTE
    with pytest.raises(NoAutenticado):
        IniciarSesion(uow, store, FakeClock()).ejecutar("nadie@demo.unad.edu.co")
    with pytest.raises(NoAutenticado):
        AutenticarToken(store).ejecutar(None)
    CerrarSesion(store).ejecutar(sesion.token)
    with pytest.raises(NoAutenticado):
        AutenticarToken(store).ejecutar(sesion.token)


def test_sesion_expira() -> None:
    reloj = FakeClock()
    store = InMemorySessionStore(ttl_min=60, clock=reloj)
    sesion = store.create(ESTUDIANTE)
    reloj.avanzar(minutes=59)
    assert store.get(sesion.token) is not None
    reloj.avanzar(minutes=1)
    assert store.get(sesion.token) is None


def test_agente_que_inicia_sesion_toma_tickets_huerfanos() -> None:
    # Sin agentes funcionales, el ticket queda sin responsable.
    uow = FakeUoW(usuarios=[ESTUDIANTE, TECNICO])
    reloj = FakeClock()
    store = InMemorySessionStore(ttl_min=60, clock=reloj)
    crear = CrearTicket(
        uow,
        FixedClassifier(clasificacion(Categoria.FUNCIONAL)),
        LeastLoadedRouter(uow.users, uow.tickets),
        reloj,
    )
    huerfano = crear.ejecutar(entrante(), ESTUDIANTE)
    assert huerfano.responsable_id is None

    # Llega un agente funcional: al iniciar sesión se queda con el ticket.
    uow.users._usuarios[FUNCIONAL1.id] = FUNCIONAL1
    IniciarSesion(uow, store, reloj).ejecutar(FUNCIONAL1.email)
    asignado = uow.tickets.get(huerfano.id)
    assert asignado is not None and asignado.responsable_id == FUNCIONAL1.id
