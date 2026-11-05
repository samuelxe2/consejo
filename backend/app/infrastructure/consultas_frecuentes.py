"""Diccionario de consultas frecuentes (FAQ) y estados de su flujo.

Antes de pasar una solicitud a una persona, se busca aquí una respuesta sugerida.
Si hay coincidencia, el ticket recorre los estados de FLUJO_CONSULTA_FRECUENTE:
la respuesta se entrega en PENDIENTE_CONFIRMACION y el usuario decide si quedó
RESUELTO o si pasa a soporte funcional (ABIERTO). Las transiciones válidas viven
en app.domain.state_machine.
"""

from dataclasses import dataclass

from app.domain.entities import Faq
from app.domain.enums import Estado


@dataclass(frozen=True)
class ConsultaFrecuente:
    pregunta: str
    palabras_clave: tuple[str, ...]
    respuesta: str


CONSULTAS_FRECUENTES: dict[str, ConsultaFrecuente] = {
    "ubicar_actividades": ConsultaFrecuente(
        "ubicar actividades",
        ("donde veo", "actividades"),
        "Ingresa al curso y abre la sección Actividades del menú lateral; allí verás las "
        "actividades vigentes con su fecha de cierre.",
    ),
    "estado_evaluacion": ConsultaFrecuente(
        "consultar estado de evaluación",
        ("consultar", "estado", "evaluacion"),
        "En EvaluIA abre 'Mis evaluaciones'; cada evaluación muestra su estado "
        "(pendiente, enviada o calificada).",
    ),
    "calificaciones": ConsultaFrecuente(
        "consultar calificaciones",
        ("calificaciones",),
        "Las calificaciones están en el curso, opción Calificaciones, y se actualizan "
        "al cerrar cada actividad.",
    ),
    "certificado": ConsultaFrecuente(
        "descargar certificado",
        ("certificado",),
        "Descarga tu certificado desde Perfil > Certificados cuando el curso esté aprobado.",
    ),
    "fechas_entrega": ConsultaFrecuente(
        "fechas de entrega",
        ("fecha", "entrega"),
        "Las fechas de entrega aparecen en la agenda del curso y en cada actividad.",
    ),
    "cambiar_contrasena": ConsultaFrecuente(
        "cambiar contraseña",
        ("cambiar", "contrasena"),
        "Cambia tu contraseña desde el portal institucional en la opción "
        "'Recuperar o cambiar contraseña'.",
    ),
    "contactar_tutor": ConsultaFrecuente(
        "contactar al tutor",
        ("tutor",),
        "Escribe a tu tutor desde la mensajería interna del curso (icono de sobre) o en el "
        "foro de dudas; el directorio de tutores está en la sección Participantes.",
    ),
}

FLUJO_CONSULTA_FRECUENTE: dict[Estado, str] = {
    Estado.PENDIENTE_CONFIRMACION: "Se entrega la respuesta sugerida y se espera que el "
    "usuario confirme si resolvió su caso.",
    Estado.RESUELTO: "El usuario confirmó que la respuesta resolvió su caso.",
    Estado.ABIERTO: "La respuesta no resolvió; el caso pasa a soporte funcional.",
}


def como_faqs() -> list[Faq]:
    """Entidades Faq en el orden del diccionario (ids estables desde 1)."""
    return [
        Faq(i, c.pregunta, c.palabras_clave, c.respuesta)
        for i, c in enumerate(CONSULTAS_FRECUENTES.values(), start=1)
    ]
