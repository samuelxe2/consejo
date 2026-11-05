"""DOM-01 a DOM-08: máquina de estados y entidades."""

import pytest

from app.domain.entities import TicketEntrante, generar_id
from app.domain.enums import Categoria, Estado, SistemaOrigen, TipoEvento
from app.domain.errors import TransicionInvalida, ValidacionError
from app.domain.state_machine import TipoActor, destinos_permitidos, puede_transitar
from tests.fakes import AHORA, ESTUDIANTE, FUNCIONAL1, FUNCIONAL2, TECNICO, FakeClock, ticket


@pytest.mark.parametrize(
    ("desde", "hacia", "actor"),
    [
        (Estado.PENDIENTE_CONFIRMACION, Estado.RESUELTO, TipoActor.SOLICITANTE),
        (Estado.PENDIENTE_CONFIRMACION, Estado.ABIERTO, TipoActor.SOLICITANTE),
        (Estado.ABIERTO, Estado.EN_ATENCION, TipoActor.AGENTE),
        (Estado.EN_ATENCION, Estado.RESUELTO, TipoActor.AGENTE),
    ],
)
def test_dom01_transiciones_permitidas(desde: Estado, hacia: Estado, actor: TipoActor) -> None:
    assert puede_transitar(desde, hacia, actor)


def test_dom01_agente_avanza_y_actualiza_fecha() -> None:
    t = ticket()
    reloj = FakeClock()
    reloj.avanzar(minutes=5)
    t.cambiar_estado(Estado.EN_ATENCION, FUNCIONAL1, reloj())
    assert t.estado is Estado.EN_ATENCION
    assert t.fecha_actualizacion == reloj()
    t.cambiar_estado(Estado.RESUELTO, FUNCIONAL1, reloj())
    assert t.estado is Estado.RESUELTO


@pytest.mark.parametrize(
    ("desde", "hacia"),
    [
        (Estado.ABIERTO, Estado.RESUELTO),
        (Estado.RESUELTO, Estado.ABIERTO),
        (Estado.RESUELTO, Estado.EN_ATENCION),
        (Estado.EN_ATENCION, Estado.ABIERTO),
        (Estado.PENDIENTE_CONFIRMACION, Estado.EN_ATENCION),
        (Estado.ABIERTO, Estado.ABIERTO),
    ],
)
def test_dom02_transiciones_no_permitidas(desde: Estado, hacia: Estado) -> None:
    assert not puede_transitar(desde, hacia, TipoActor.AGENTE)
    assert not puede_transitar(desde, hacia, TipoActor.SOLICITANTE)


def test_dom02_agente_no_puede_saltar_a_resuelto() -> None:
    t = ticket()
    with pytest.raises(TransicionInvalida):
        t.cambiar_estado(Estado.RESUELTO, FUNCIONAL1, AHORA)
    assert t.estado is Estado.ABIERTO


def test_dom02_resuelto_es_final() -> None:
    t = ticket()
    t.cambiar_estado(Estado.EN_ATENCION, FUNCIONAL1, AHORA)
    t.cambiar_estado(Estado.RESUELTO, FUNCIONAL1, AHORA)
    for destino in Estado:
        with pytest.raises(TransicionInvalida):
            t.cambiar_estado(destino, FUNCIONAL1, AHORA)


def test_dom03_actor_incorrecto() -> None:
    t = ticket()
    with pytest.raises(TransicionInvalida):
        t.cambiar_estado(Estado.EN_ATENCION, ESTUDIANTE, AHORA)  # solicitante
    with pytest.raises(TransicionInvalida):
        t.cambiar_estado(Estado.EN_ATENCION, FUNCIONAL2, AHORA)  # agente no asignado

    auto = ticket(Categoria.AUTO)
    with pytest.raises(TransicionInvalida):
        auto.confirmar(True, FUNCIONAL1, AHORA)  # agente confirma
    assert puede_transitar(Estado.ABIERTO, Estado.EN_ATENCION, TipoActor.SOLICITANTE) is False


def test_dom03_solicitante_no_dueno_no_confirma() -> None:
    from tests.fakes import DOCENTE

    auto = ticket(Categoria.AUTO)
    with pytest.raises(TransicionInvalida):
        auto.confirmar(True, DOCENTE, AHORA)


def test_dom04_rechazo_reclasifica_y_conserva_respuesta() -> None:
    t = ticket(Categoria.AUTO)
    respuesta = t.respuesta_sugerida
    t.confirmar(False, ESTUDIANTE, AHORA)
    assert t.categoria is Categoria.FUNCIONAL
    assert t.estado is Estado.ABIERTO
    assert t.respuesta_sugerida == respuesta
    assert t.requiere_agente


def test_dom04_aceptacion_resuelve() -> None:
    t = ticket(Categoria.AUTO)
    t.confirmar(True, ESTUDIANTE, AHORA)
    assert t.estado is Estado.RESUELTO
    assert t.categoria is Categoria.AUTO


def test_dom05_confirmar_fuera_de_pendiente() -> None:
    t = ticket(Categoria.AUTO)
    t.confirmar(True, ESTUDIANTE, AHORA)
    with pytest.raises(TransicionInvalida):
        t.confirmar(False, ESTUDIANTE, AHORA)
    funcional = ticket()
    with pytest.raises(TransicionInvalida):
        funcional.confirmar(True, ESTUDIANTE, AHORA)


@pytest.mark.parametrize(
    ("asunto", "descripcion", "campo"),
    [
        ("", "Descripción suficiente", "asunto"),
        ("   ", "Descripción suficiente", "asunto"),
        ("ab", "Descripción suficiente", "asunto"),
        ("x" * 151, "Descripción suficiente", "asunto"),
        ("Asunto válido", "corta", "descripcion"),
        ("Asunto válido", "x" * 2001, "descripcion"),
    ],
)
def test_dom06_validacion_de_entrada(asunto: str, descripcion: str, campo: str) -> None:
    with pytest.raises(ValidacionError) as exc:
        TicketEntrante(SistemaOrigen.MAIA, asunto, descripcion)
    assert exc.value.campo == campo


def test_dom06_limites_validos_y_recorte() -> None:
    e = TicketEntrante(SistemaOrigen.MAIA, "  " + "x" * 150 + "  ", "y" * 10)
    assert len(e.asunto) == 150


def test_dom07_eventos_de_creacion_asignacion_y_transicion() -> None:
    t = ticket()
    tipos = [e.tipo for e in t.eventos_nuevos]
    assert tipos == [TipoEvento.CREADO, TipoEvento.CLASIFICADO, TipoEvento.ASIGNADO]
    t.eventos_nuevos.clear()
    t.cambiar_estado(Estado.EN_ATENCION, FUNCIONAL1, AHORA)
    (evento,) = t.eventos_nuevos
    assert evento.tipo is TipoEvento.ESTADO_CAMBIADO
    assert evento.actor_id == FUNCIONAL1.id
    assert evento.detalle == "ABIERTO → EN_ATENCION"


def test_dom07_eventos_de_rechazo() -> None:
    t = ticket(Categoria.AUTO)
    t.eventos_nuevos.clear()
    t.confirmar(False, ESTUDIANTE, AHORA)
    assert [e.tipo for e in t.eventos_nuevos] == [
        TipoEvento.RESPUESTA_RECHAZADA,
        TipoEvento.RECLASIFICADO,
        TipoEvento.ESTADO_CAMBIADO,
    ]


def test_dom08_generacion_de_id() -> None:
    assert generar_id(1) == "TCK-0001"
    assert generar_id(42) == "TCK-0042"


def test_asignacion_valida_rol_y_categoria() -> None:
    t = ticket(Categoria.TECNICO, responsable=None)
    with pytest.raises(TransicionInvalida):
        t.asignar(FUNCIONAL1, AHORA)
    t.asignar(TECNICO, AHORA)
    assert t.responsable_id == TECNICO.id
    with pytest.raises(TransicionInvalida):
        ticket(Categoria.AUTO).asignar(FUNCIONAL1, AHORA)


def test_asignacion_sin_agente_registra_evento() -> None:
    t = ticket(responsable=None)
    t.asignar(None, AHORA)
    assert t.responsable_id is None
    assert t.eventos_nuevos[-1].tipo is TipoEvento.SIN_AGENTE_DISPONIBLE


def test_destinos_permitidos() -> None:
    assert destinos_permitidos(Estado.ABIERTO, TipoActor.AGENTE) == [Estado.EN_ATENCION]
    assert destinos_permitidos(Estado.RESUELTO, TipoActor.AGENTE) == []
