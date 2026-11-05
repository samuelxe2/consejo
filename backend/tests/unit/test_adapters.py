"""ADP-01 a ADP-05: adaptadores de sistemas de origen."""

from typing import Any

import pytest

from app.domain.enums import SistemaOrigen
from app.domain.errors import ValidacionError
from app.infrastructure.adapters import default_registry

USUARIO = "estudiante@demo.unad.edu.co"
DESCRIPCION = "Descripción suficientemente larga del problema."

PAYLOADS: dict[str, dict[str, Any]] = {
    "MAIA": {
        "usuario": USUARIO,
        "curso": "Cálculo I",
        "consulta": "¿Dónde veo mis actividades?",
        "descripcion": DESCRIPCION,
    },
    "EVALUIA": {
        "usuario": USUARIO,
        "evaluacion_id": "EV-204",
        "error": "Error HTTP 500 al enviar",
        "descripcion": DESCRIPCION,
    },
    "COURSE_BUILDER": {
        "usuario": USUARIO,
        "curso": "Física",
        "operacion": "Publicar foro",
        "descripcion": DESCRIPCION,
    },
}


@pytest.mark.parametrize(
    ("sistema", "asunto", "contexto"),
    [
        ("MAIA", "¿Dónde veo mis actividades?", "Curso: Cálculo I"),
        ("EVALUIA", "Error HTTP 500 al enviar", "Evaluación: EV-204"),
        ("COURSE_BUILDER", "Publicar foro en Física", "Curso: Física; operación: Publicar foro"),
    ],
)
def test_adp01_normaliza_cada_sistema(sistema: str, asunto: str, contexto: str) -> None:
    e = default_registry().normalize(sistema, PAYLOADS[sistema])
    assert e.sistema_origen is SistemaOrigen(sistema)
    assert e.asunto == asunto
    assert e.descripcion == DESCRIPCION
    assert e.contexto == contexto
    assert e.usuario_email == USUARIO


def test_adp02_evaluia_sin_error() -> None:
    payload = {k: v for k, v in PAYLOADS["EVALUIA"].items() if k != "error"}
    assert (
        default_registry().normalize("EVALUIA", payload).asunto
        == "Consulta sobre evaluación EV-204"
    )


@pytest.mark.parametrize(
    ("sistema", "campo"),
    [
        ("MAIA", "curso"),
        ("MAIA", "consulta"),
        ("EVALUIA", "evaluacion_id"),
        ("EVALUIA", "usuario"),
        ("COURSE_BUILDER", "operacion"),
        ("COURSE_BUILDER", "descripcion"),
    ],
)
def test_adp03_campo_obligatorio_faltante(sistema: str, campo: str) -> None:
    payload = {k: v for k, v in PAYLOADS[sistema].items() if k != campo}
    with pytest.raises(ValidacionError) as exc:
        default_registry().normalize(sistema, payload)
    assert exc.value.campo == campo


def test_adp03_campo_vacio_o_de_otro_tipo() -> None:
    with pytest.raises(ValidacionError):
        default_registry().normalize("MAIA", PAYLOADS["MAIA"] | {"curso": "   "})
    with pytest.raises(ValidacionError):
        default_registry().normalize("MAIA", PAYLOADS["MAIA"] | {"curso": 123})


def test_adp04_sistema_no_registrado() -> None:
    with pytest.raises(ValidacionError) as exc:
        default_registry().normalize("SAKAI", PAYLOADS["MAIA"])
    assert exc.value.campo == "sistema_origen"


def test_adp05_ignora_campos_calculados() -> None:
    payload = PAYLOADS["MAIA"] | {"categoria": "TECNICO", "estado": "RESUELTO", "responsable": 5}
    e = default_registry().normalize("MAIA", payload)
    assert not hasattr(e, "categoria")
    assert not hasattr(e, "estado")
