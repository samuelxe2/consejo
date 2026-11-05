from enum import StrEnum


class SistemaOrigen(StrEnum):
    MAIA = "MAIA"
    EVALUIA = "EVALUIA"
    COURSE_BUILDER = "COURSE_BUILDER"


class Categoria(StrEnum):
    AUTO = "AUTO"
    FUNCIONAL = "FUNCIONAL"
    TECNICO = "TECNICO"


class Estado(StrEnum):
    PENDIENTE_CONFIRMACION = "PENDIENTE_CONFIRMACION"
    ABIERTO = "ABIERTO"
    EN_ATENCION = "EN_ATENCION"
    RESUELTO = "RESUELTO"


class Metodo(StrEnum):
    RULES = "RULES"
    LLM = "LLM"


class Rol(StrEnum):
    SOLICITANTE = "solicitante"
    SOPORTE_FUNCIONAL = "soporte_funcional"
    SOPORTE_TECNICO = "soporte_tecnico"

    @property
    def es_agente(self) -> bool:
        return self is not Rol.SOLICITANTE


class TipoEvento(StrEnum):
    CREADO = "CREADO"
    CLASIFICADO = "CLASIFICADO"
    ASIGNADO = "ASIGNADO"
    SIN_AGENTE_DISPONIBLE = "SIN_AGENTE_DISPONIBLE"
    ESTADO_CAMBIADO = "ESTADO_CAMBIADO"
    RESPUESTA_CONFIRMADA = "RESPUESTA_CONFIRMADA"
    RESPUESTA_RECHAZADA = "RESPUESTA_RECHAZADA"
    RECLASIFICADO = "RECLASIFICADO"


ROL_POR_CATEGORIA: dict[Categoria, Rol] = {
    Categoria.FUNCIONAL: Rol.SOPORTE_FUNCIONAL,
    Categoria.TECNICO: Rol.SOPORTE_TECNICO,
}

ESTADOS_ACTIVOS: frozenset[Estado] = frozenset({Estado.ABIERTO, Estado.EN_ATENCION})
