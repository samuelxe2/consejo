"""CLS-01 a CLS-09: clasificador por reglas."""

import pytest

from app.domain.entities import ClassificationResult, Faq
from app.domain.enums import Categoria, Estado, Metodo
from app.domain.state_machine import TipoActor, destinos_permitidos
from app.infrastructure.classifiers.rules import (
    CONFIANZA_INCIERTA,
    CONFIANZA_TECNICO_DEBIL,
    CONFIANZA_TECNICO_FUERTE,
    MOTIVO_INCIERTO,
    RuleBasedClassifier,
    SugerenciaPrimero,
    normalizar,
)
from app.infrastructure.consultas_frecuentes import (
    CONSULTAS_FRECUENTES,
    FLUJO_CONSULTA_FRECUENTE,
    como_faqs,
)
from tests.fakes import entrante

FAQ_SEMILLA = como_faqs()


@pytest.fixture
def clasificador() -> RuleBasedClassifier:
    return RuleBasedClassifier(FAQ_SEMILLA, umbral_faq=0.6)


def _clasificar(
    c: RuleBasedClassifier, asunto: str, descripcion: str = "Sin más detalles por ahora."
):
    return c.classify(entrante(asunto, descripcion))


@pytest.mark.parametrize(
    ("asunto", "esperada", "en_motivo"),
    [
        ("¿Dónde veo mis actividades en MAIA?", Categoria.AUTO, "ubicar actividades"),
        ("No encuentro la opción para adjuntar tarea", Categoria.FUNCIONAL, "no encuentro"),
        ("Error HTTP 500 en integración EvaluIA–Moodle", Categoria.TECNICO, "500"),
    ],
)
def test_cls01_escenarios_de_aceptacion(
    clasificador: RuleBasedClassifier, asunto: str, esperada: Categoria, en_motivo: str
) -> None:
    resultado = _clasificar(clasificador, asunto)
    assert resultado.categoria is esperada
    assert en_motivo in resultado.motivo


def test_cls01_auto_incluye_respuesta(clasificador: RuleBasedClassifier) -> None:
    resultado = _clasificar(clasificador, "¿Dónde veo mis actividades en MAIA?")
    assert resultado.respuesta_sugerida and "Actividades" in resultado.respuesta_sugerida


@pytest.mark.parametrize(
    ("asunto", "esperada"),
    [
        ("¿Cómo puedo consultar el estado de mi evaluación?", Categoria.AUTO),
        ("No puedo consultar mi evaluación porque aparece error 500", Categoria.TECNICO),
        ("No encuentro dónde consultar mi evaluación", Categoria.AUTO),
    ],
)
def test_cls02_desambiguacion_consultar(
    clasificador: RuleBasedClassifier, asunto: str, esperada: Categoria
) -> None:
    assert _clasificar(clasificador, asunto).categoria is esperada


def test_cls03_error_bloquea_auto(clasificador: RuleBasedClassifier) -> None:
    resultado = _clasificar(
        clasificador, "¿Dónde veo mis actividades?", "Me sale un error al abrir la página."
    )
    assert resultado.categoria is not Categoria.AUTO
    assert resultado.respuesta_sugerida is None


def test_cls04_sin_coincidencias(clasificador: RuleBasedClassifier) -> None:
    resultado = _clasificar(clasificador, "Tengo una duda")
    assert resultado.categoria is Categoria.FUNCIONAL
    assert resultado.confianza == CONFIANZA_INCIERTA
    assert resultado.motivo == MOTIVO_INCIERTO


def test_cls05_normalizacion(clasificador: RuleBasedClassifier) -> None:
    assert normalizar("¿DÓNDE   veo, mis ACTIVIDADES?") == "donde veo mis actividades"
    a = _clasificar(clasificador, "¿DÓNDE VEO MIS ACTIVIDADES?")
    b = _clasificar(clasificador, "donde veo mis actividades")
    assert a == b


@pytest.mark.parametrize(("presentes", "esperada"), [(2, Categoria.FUNCIONAL), (3, Categoria.AUTO)])
def test_cls06_umbral_faq(presentes: int, esperada: Categoria) -> None:
    claves = ("alfa", "beta", "gamma", "delta", "epsilon")
    c = RuleBasedClassifier([Faq(1, "prueba", claves, "respuesta")], umbral_faq=0.6)
    texto = " ".join(claves[:presentes])  # 2/5 = 0.4 (bajo) ; 3/5 = 0.6 (en el umbral)
    assert c.classify(entrante(texto, "Texto adicional sin señales.")).categoria is esperada


def test_cls07_confianza_tecnica(clasificador: RuleBasedClassifier) -> None:
    assert _clasificar(clasificador, "Stack trace al guardar").confianza == CONFIANZA_TECNICO_FUERTE
    assert _clasificar(clasificador, "La API y el servidor").confianza == CONFIANZA_TECNICO_FUERTE
    assert _clasificar(clasificador, "Pregunta sobre el token").confianza == CONFIANZA_TECNICO_DEBIL


@pytest.mark.parametrize(
    "asunto",
    [
        "¿Dónde veo mis actividades?",
        "No me aparece el botón",
        "Timeout en Moodle",
        "Hola",
        "Error 502 en la plataforma",
    ],
)
def test_cls08_invariantes(clasificador: RuleBasedClassifier, asunto: str) -> None:
    resultado = _clasificar(clasificador, asunto)
    assert resultado.metodo is Metodo.RULES
    assert 0.0 <= resultado.confianza <= 1.0
    assert (resultado.respuesta_sugerida is not None) == (resultado.categoria is Categoria.AUTO)


def test_cls09_tecnico_tiene_prioridad(clasificador: RuleBasedClassifier) -> None:
    resultado = _clasificar(clasificador, "No encuentro el archivo, sale error 500")
    assert resultado.categoria is Categoria.TECNICO


def test_faq_sin_palabras_clave_se_ignora() -> None:
    c = RuleBasedClassifier([Faq(1, "vacía", (), "r")])
    assert (
        c.classify(entrante("Hola equipo", "Texto sin señales.")).categoria is Categoria.FUNCIONAL
    )


# ---------- consulta frecuente antes de pasar a una persona ----------
@pytest.mark.parametrize(
    "asunto",
    [
        "No sé dónde veo mis actividades",
        "No encuentro mis calificaciones",
        "No puedo descargar el certificado",
    ],
)
def test_cls10_consulta_frecuente_antes_que_dificultad(
    clasificador: RuleBasedClassifier, asunto: str
) -> None:
    resultado = _clasificar(clasificador, asunto)
    assert resultado.categoria is Categoria.AUTO
    assert resultado.respuesta_sugerida


def test_cls10_sin_consulta_frecuente_la_dificultad_va_a_funcional(
    clasificador: RuleBasedClassifier,
) -> None:
    resultado = _clasificar(clasificador, "No encuentro la opción para adjuntar tarea")
    assert resultado.categoria is Categoria.FUNCIONAL


class _PrincipalFijo:
    def __init__(self, categoria: Categoria) -> None:
        self.llamadas = 0
        self._categoria = categoria

    def classify(self, entrante):  # type: ignore[no-untyped-def]
        self.llamadas += 1
        return ClassificationResult(self._categoria, "principal", 0.9, None, Metodo.LLM)


def test_cls11_sugerencia_primero_antes_del_clasificador_principal(
    clasificador: RuleBasedClassifier,
) -> None:
    principal = _PrincipalFijo(Categoria.FUNCIONAL)
    c = SugerenciaPrimero(principal, clasificador)
    resultado = c.classify(entrante("No sé dónde veo mis actividades", "Ayuda por favor."))
    assert resultado.categoria is Categoria.AUTO
    assert principal.llamadas == 0


@pytest.mark.parametrize(
    "asunto",
    [
        "Error 500 al ver mis calificaciones",  # técnico
        "Falla al consultar calificaciones",  # error explícito
        "No encuentro la opción para adjuntar tarea",  # sin consulta frecuente
    ],
)
def test_cls11_sugerencia_primero_delega_si_no_aplica(
    clasificador: RuleBasedClassifier, asunto: str
) -> None:
    principal = _PrincipalFijo(Categoria.TECNICO)
    resultado = SugerenciaPrimero(principal, clasificador).classify(
        entrante(asunto, "Sin más detalles por ahora.")
    )
    assert resultado.metodo is Metodo.LLM
    assert principal.llamadas == 1


def test_flujo_consulta_frecuente_coincide_con_maquina_de_estados() -> None:
    esperados = {
        Estado.PENDIENTE_CONFIRMACION,
        *destinos_permitidos(Estado.PENDIENTE_CONFIRMACION, TipoActor.SOLICITANTE),
    }
    assert set(FLUJO_CONSULTA_FRECUENTE) == esperados


def test_diccionario_sin_claves_repetidas_ni_vacias() -> None:
    for clave, consulta in CONSULTAS_FRECUENTES.items():
        assert consulta.palabras_clave, clave
        assert consulta.respuesta.strip(), clave
