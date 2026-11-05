"""IA-01 a IA-06: clasificador con IA, fallback y fábrica. Nunca se llama a la red."""

import json

import httpx
import pytest

from app.domain.enums import Categoria, Metodo
from app.infrastructure.classifiers.factory import create_classifier
from app.infrastructure.classifiers.llm import (
    AnthropicClient,
    FallbackClassifier,
    LLMClassifier,
)
from app.infrastructure.classifiers.rules import RuleBasedClassifier, SugerenciaPrimero
from app.infrastructure.config import Settings
from tests.fakes import entrante

ERROR_500 = entrante("Error HTTP 500 en integración EvaluIA–Moodle", "Falla al enviar.")


class FakeLLM:
    def __init__(self, respuesta: str | None = None, error: Exception | None = None) -> None:
        self.respuesta = respuesta
        self.error = error
        self.prompts: list[str] = []

    def complete(self, prompt: str) -> str:
        self.prompts.append(prompt)
        if self.error:
            raise self.error
        assert self.respuesta is not None
        return self.respuesta


def _json(**kwargs: object) -> str:
    base = {"categoria": "TECNICO", "motivo": "Error 5xx", "confianza": 0.95, "respuesta": None}
    return json.dumps(base | kwargs)


def _fallback(llm: FakeLLM) -> FallbackClassifier:
    return FallbackClassifier(LLMClassifier(llm), RuleBasedClassifier([]), min_confianza=0.6)


def test_ia01_usa_resultado_del_llm() -> None:
    llm = FakeLLM(_json(categoria="AUTO", respuesta="Ve a Actividades", confianza=0.9))
    resultado = _fallback(llm).classify(entrante())
    assert resultado.metodo is Metodo.LLM
    assert resultado.categoria is Categoria.AUTO
    assert resultado.respuesta_sugerida == "Ve a Actividades"
    assert "¿Dónde veo mis actividades?" in llm.prompts[0]


def test_ia01_descarta_respuesta_si_no_es_auto() -> None:
    resultado = LLMClassifier(FakeLLM(_json(respuesta="algo"))).classify(ERROR_500)
    assert resultado.respuesta_sugerida is None


@pytest.mark.parametrize(
    "error",
    [RuntimeError("caído"), httpx.ConnectError("sin red"), httpx.ReadTimeout("timeout")],
)
def test_ia02_ia03_excepcion_o_timeout_usa_reglas(error: Exception) -> None:
    resultado = _fallback(FakeLLM(error=error)).classify(ERROR_500)
    assert resultado.metodo is Metodo.RULES
    assert resultado.categoria is Categoria.TECNICO


@pytest.mark.parametrize(
    "crudo",
    [
        "esto no es json",
        _json(categoria="URGENTE"),
        _json(confianza=1.5),
        json.dumps({"categoria": "AUTO"}),
    ],
)
def test_ia04_salida_invalida_usa_reglas(crudo: str) -> None:
    resultado = _fallback(FakeLLM(crudo)).classify(ERROR_500)
    assert resultado.metodo is Metodo.RULES


def test_ia05_confianza_baja_usa_reglas() -> None:
    resultado = _fallback(FakeLLM(_json(categoria="AUTO", confianza=0.4))).classify(ERROR_500)
    assert resultado.metodo is Metodo.RULES
    assert resultado.categoria is Categoria.TECNICO


def test_ia06_fabrica() -> None:
    assert isinstance(create_classifier(Settings(classifier="rules"), []), RuleBasedClassifier)
    con_llm = create_classifier(Settings(classifier="llm"), [], FakeLLM(_json()))
    assert isinstance(con_llm, SugerenciaPrimero)
    assert isinstance(create_classifier(Settings(classifier="llm"), []), SugerenciaPrimero)


def test_ia06_configuracion_invalida() -> None:
    with pytest.raises(ValueError):
        Settings(classifier="magia")  # type: ignore[arg-type]
    config = Settings()
    object.__setattr__(config, "classifier", "magia")
    with pytest.raises(ValueError):
        create_classifier(config, [])


def test_cliente_anthropic_arma_la_peticion(monkeypatch: pytest.MonkeyPatch) -> None:
    capturado: dict[str, object] = {}

    def fake_post(url: str, **kwargs: object) -> httpx.Response:
        capturado.update(url=url, **kwargs)
        return httpx.Response(
            200,
            json={"content": [{"type": "text", "text": _json()}]},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx, "post", fake_post)
    texto = AnthropicClient("clave-de-prueba", "modelo-x", 3).complete("hola")
    assert json.loads(texto)["categoria"] == "TECNICO"
    assert capturado["timeout"] == 3
    assert capturado["json"]["model"] == "modelo-x"  # type: ignore[index]
