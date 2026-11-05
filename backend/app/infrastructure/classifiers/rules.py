"""Clasificador determinista por reglas (SDD 7.1–7.3).

Prioridad: TÉCNICO > consulta frecuente > dificultad de uso > incierto.
Una consulta frecuente recibe primero la respuesta sugerida, aunque esté redactada
como dificultad ("no sé dónde veo mis actividades"); solo si el usuario la rechaza
pasa a una persona.
"""

import re
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass

from app.domain.entities import ClassificationResult, Faq, TicketEntrante
from app.domain.enums import Categoria, Metodo
from app.domain.ports import TicketClassifier

CONFIANZA_TECNICO_FUERTE = 0.9
CONFIANZA_TECNICO_DEBIL = 0.6
CONFIANZA_FUNCIONAL = 0.7
CONFIANZA_INCIERTA = 0.3
MOTIVO_INCIERTO = "Clasificación incierta, requiere revisión humana."

_CODIGO_5XX = re.compile(r"\b5\d\d\b")


def normalizar(texto: str) -> str:
    """Minúsculas, sin tildes ni signos, espacios simples."""
    sin_tildes = "".join(
        c for c in unicodedata.normalize("NFKD", texto.lower()) if not unicodedata.combining(c)
    )
    return " ".join(re.sub(r"[^a-z0-9]+", " ", sin_tildes).split())


def _texto_de(entrante: TicketEntrante) -> str:
    return normalizar(f"{entrante.asunto} {entrante.descripcion}")


def _presentes(texto: str, terminos: Iterable[str]) -> list[str]:
    relleno = f" {texto} "
    return [t for t in terminos if f" {t} " in relleno]


@dataclass(frozen=True)
class ReglasClasificacion:
    tecnicas_fuertes: tuple[str, ...] = ("5xx", "excepcion", "stack trace", "stacktrace")
    tecnicas_debiles: tuple[str, ...] = (
        "timeout",
        "api",
        "integracion",
        "token",
        "endpoint",
        "base de datos",
        "servidor",
        "moodle",
        "no carga",
        "caido",
        "caida",
    )
    errores: tuple[str, ...] = ("error", "falla", "fallo", "no funciona")
    dificultad: tuple[str, ...] = (
        "no encuentro",
        "no puedo",
        "no me aparece",
        "como adjunto",
        "opcion",
        "boton",
        "no se donde",
        "no se como",
    )


class RuleBasedClassifier:
    def __init__(
        self,
        faqs: Iterable[Faq],
        umbral_faq: float = 0.6,
        reglas: ReglasClasificacion | None = None,
    ) -> None:
        self._faqs = [(f, [normalizar(k) for k in f.palabras_clave]) for f in faqs]
        self._umbral = umbral_faq
        self._reglas = reglas or ReglasClasificacion()

    def classify(self, entrante: TicketEntrante) -> ClassificationResult:
        texto = _texto_de(entrante)
        r = self._reglas

        fuertes, debiles = self._senales_tecnicas(texto)
        if fuertes or len(debiles) >= 2:
            return self._resultado(Categoria.TECNICO, CONFIANZA_TECNICO_FUERTE, fuertes + debiles)
        if debiles:
            return self._resultado(Categoria.TECNICO, CONFIANZA_TECNICO_DEBIL, debiles)

        sugerencia = self._sugerencia(texto)
        if sugerencia is not None:
            return sugerencia

        dificultad = _presentes(texto, r.dificultad)
        if dificultad:
            return ClassificationResult(
                Categoria.FUNCIONAL,
                f"Dificultad de uso ({', '.join(dificultad)}), sin indicios técnicos.",
                CONFIANZA_FUNCIONAL,
                None,
                Metodo.RULES,
            )

        return ClassificationResult(
            Categoria.FUNCIONAL, MOTIVO_INCIERTO, CONFIANZA_INCIERTA, None, Metodo.RULES
        )

    def sugerir(self, entrante: TicketEntrante) -> ClassificationResult | None:
        """Respuesta de consulta frecuente si aplica (sin indicios técnicos ni de error)."""
        texto = _texto_de(entrante)
        return None if self._es_tecnico(texto) else self._sugerencia(texto)

    def consulta_frecuente(self, texto: str) -> Faq | None:
        """Consulta frecuente que se sugeriría al crear el ticket, para ayudar mientras se
        escribe (el texto puede estar incompleto). Usa la misma regla que `sugerir`."""
        normalizado = normalizar(texto)
        if self._es_tecnico(normalizado):
            return None
        coincidencia = self._coincidencia(normalizado)
        return coincidencia[0] if coincidencia else None

    def _senales_tecnicas(self, texto: str) -> tuple[list[str], list[str]]:
        """(fuertes, débiles): única definición de qué es un indicio técnico."""
        r = self._reglas
        fuertes = _presentes(texto, r.tecnicas_fuertes) + _CODIGO_5XX.findall(texto)
        return fuertes, _presentes(texto, r.tecnicas_debiles)

    def _es_tecnico(self, texto: str) -> bool:
        fuertes, debiles = self._senales_tecnicas(texto)
        return bool(fuertes or debiles)

    def _coincidencia(self, texto: str) -> tuple[Faq, float] | None:
        if _presentes(texto, self._reglas.errores):
            return None
        faq, puntaje = self._mejor_faq(texto)
        if faq is None or puntaje < self._umbral:
            return None
        return faq, puntaje

    def _sugerencia(self, texto: str) -> ClassificationResult | None:
        coincidencia = self._coincidencia(texto)
        if coincidencia is None:
            return None
        faq, puntaje = coincidencia
        return ClassificationResult(
            Categoria.AUTO,
            f"Coincide con la consulta frecuente '{faq.pregunta}'.",
            round(puntaje, 2),
            faq.respuesta,
            Metodo.RULES,
        )

    def _mejor_faq(self, texto: str) -> tuple[Faq | None, float]:
        mejor: tuple[Faq | None, float] = (None, 0.0)
        for faq, claves in self._faqs:
            if not claves:
                continue
            puntaje = len(_presentes(texto, claves)) / len(claves)
            if puntaje > mejor[1]:
                mejor = (faq, puntaje)
        return mejor

    @staticmethod
    def _resultado(
        categoria: Categoria, confianza: float, senales: list[str]
    ) -> ClassificationResult:
        unicas = list(dict.fromkeys(senales))
        return ClassificationResult(
            categoria,
            f"Indicios técnicos: {', '.join(unicas)}.",
            confianza,
            None,
            Metodo.RULES,
        )


class SugerenciaPrimero:
    """Antes de enviar a una persona, ofrece la respuesta de una consulta frecuente.

    Envuelve otro clasificador (p. ej. el LLM): si el diccionario de consultas
    frecuentes responde la solicitud, el ticket queda AUTO con respuesta sugerida.
    """

    def __init__(self, principal: TicketClassifier, reglas: RuleBasedClassifier) -> None:
        self._principal = principal
        self._reglas = reglas

    def classify(self, entrante: TicketEntrante) -> ClassificationResult:
        return self._reglas.sugerir(entrante) or self._principal.classify(entrante)
