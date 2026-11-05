from collections.abc import Iterable

from app.domain.entities import Faq
from app.domain.ports import TicketClassifier
from app.infrastructure.classifiers.llm import (
    AnthropicClient,
    FallbackClassifier,
    LLMClassifier,
    LLMClient,
)
from app.infrastructure.classifiers.rules import RuleBasedClassifier, SugerenciaPrimero
from app.infrastructure.config import Settings


def create_classifier(
    settings: Settings, faqs: Iterable[Faq], llm_client: LLMClient | None = None
) -> TicketClassifier:
    reglas = RuleBasedClassifier(faqs, settings.faq_threshold)
    if settings.classifier == "rules":
        return reglas
    if settings.classifier == "llm":
        client = llm_client or AnthropicClient(
            settings.llm_api_key, settings.llm_model, settings.llm_timeout_s
        )
        return SugerenciaPrimero(
            FallbackClassifier(LLMClassifier(client), reglas, settings.llm_min_confidence),
            reglas,
        )
    raise ValueError(f"CLASSIFIER no válido: {settings.classifier!r} (use 'rules' o 'llm').")
