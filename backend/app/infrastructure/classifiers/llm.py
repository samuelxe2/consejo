"""Clasificador opcional con LLM, siempre envuelto en FallbackClassifier (SDD 7.4)."""

import json
import logging
from typing import Literal, Protocol

import httpx
from pydantic import BaseModel, Field

from app.domain.entities import ClassificationResult, TicketEntrante
from app.domain.enums import Categoria, Metodo
from app.domain.ports import TicketClassifier

logger = logging.getLogger(__name__)

PROMPT = """Clasifica una solicitud de soporte de una plataforma educativa.
Categorías:
- AUTO: consulta frecuente que se responde con una indicación breve.
- FUNCIONAL: dificultad de uso que atiende personal no técnico.
- TECNICO: fallos de API, integración, infraestructura o código.
Responde SOLO con JSON: {{"categoria": "AUTO|FUNCIONAL|TECNICO", "motivo": "...",
"confianza": 0.0-1.0, "respuesta": "respuesta sugerida si es AUTO, si no null"}}

Sistema: {sistema}
Asunto: {asunto}
Descripción: {descripcion}"""


class LLMClient(Protocol):
    def complete(self, prompt: str) -> str: ...


class _SalidaLLM(BaseModel):
    categoria: Literal["AUTO", "FUNCIONAL", "TECNICO"]
    motivo: str = Field(min_length=1)
    confianza: float = Field(ge=0, le=1)
    respuesta: str | None = None


class LLMClassifier:
    def __init__(self, client: LLMClient) -> None:
        self._client = client

    def classify(self, entrante: TicketEntrante) -> ClassificationResult:
        crudo = self._client.complete(
            PROMPT.format(
                sistema=entrante.sistema_origen,
                asunto=entrante.asunto,
                descripcion=entrante.descripcion,
            )
        )
        salida = _SalidaLLM.model_validate(json.loads(crudo))  # lanza si es inválido
        categoria = Categoria(salida.categoria)
        if categoria is Categoria.AUTO and not (salida.respuesta or "").strip():
            # Un AUTO sin respuesta dejaría al usuario sin nada que confirmar.
            raise ValueError("El LLM clasificó AUTO sin respuesta sugerida.")
        return ClassificationResult(
            categoria,
            salida.motivo,
            salida.confianza,
            salida.respuesta if categoria is Categoria.AUTO else None,
            Metodo.LLM,
        )


class FallbackClassifier:
    """Decorator: usa el principal y, ante error o baja confianza, el respaldo."""

    def __init__(
        self, principal: TicketClassifier, respaldo: TicketClassifier, min_confianza: float
    ) -> None:
        self._principal = principal
        self._respaldo = respaldo
        self._min = min_confianza

    def classify(self, entrante: TicketEntrante) -> ClassificationResult:
        try:
            resultado = self._principal.classify(entrante)
        except Exception as exc:  # cualquier fallo de la IA degrada a reglas
            logger.warning("clasificador principal falló, se usan reglas: %s", type(exc).__name__)
            return self._respaldo.classify(entrante)
        if resultado.confianza < self._min:
            logger.info("confianza baja (%.2f), se usan reglas", resultado.confianza)
            return self._respaldo.classify(entrante)
        return resultado


class AnthropicClient:
    """Cliente HTTP mínimo para la API de mensajes de Anthropic."""

    URL = "https://api.anthropic.com/v1/messages"

    def __init__(self, api_key: str, model: str, timeout_s: float) -> None:
        self._api_key = api_key
        self._model = model
        self._timeout = timeout_s

    def complete(self, prompt: str) -> str:
        respuesta = httpx.post(
            self.URL,
            headers={
                "x-api-key": self._api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": self._model,
                "max_tokens": 400,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=self._timeout,
        )
        respuesta.raise_for_status()
        bloques = respuesta.json()["content"]
        return "".join(b.get("text", "") for b in bloques if b.get("type") == "text")
