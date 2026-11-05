"""DTO de la API: el modelo de dominio nunca se expone directamente (SDD 5.4)."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, StrictBool

from app.domain.entities import Evento, Faq, Ticket, Usuario
from app.domain.enums import Categoria, Estado, Metodo, Rol, SistemaOrigen, TipoEvento


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=160)


class LoginResponse(BaseModel):
    token: str
    rol: Rol
    nombre: str
    email: str
    expira: datetime


class ConsultaFrecuenteResponse(BaseModel):
    """Consulta frecuente del diccionario, para autoservicio antes de crear un ticket."""

    id: int
    pregunta: str
    palabras_clave: list[str]
    respuesta: str


class SugerenciaRequest(BaseModel):
    """Lo que el usuario lleva escrito; no se guarda nada."""

    asunto: str = Field(default="", max_length=300)
    descripcion: str = Field(default="", max_length=2000)


class SugerenciaResponse(BaseModel):
    consulta: ConsultaFrecuenteResponse | None


class ResumenResponse(BaseModel):
    total: int
    por_estado: dict[Estado, int]


class MensajeResponse(BaseModel):
    detalle: str


class CrearTicketRequest(BaseModel):
    """Solo campos de entrada; los calculados que envíe el cliente se ignoran (RF-01)."""

    model_config = ConfigDict(extra="ignore")

    sistema_origen: SistemaOrigen
    asunto: str | None = None
    descripcion: str | None = None
    payload: dict[str, Any] | None = None


class CambiarEstadoRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    estado: Estado


class ConfirmacionRequest(BaseModel):
    resuelto: StrictBool


class PersonaRef(BaseModel):
    id: int
    nombre: str


class TicketResponse(BaseModel):
    id: str
    sistema_origen: SistemaOrigen
    asunto: str
    descripcion: str
    contexto: str | None
    categoria: Categoria
    motivo: str
    confianza: float
    metodo_clasificacion: Metodo
    respuesta_sugerida: str | None
    estado: Estado
    solicitante: PersonaRef | None
    responsable: PersonaRef | None
    fecha_creacion: datetime
    fecha_actualizacion: datetime


class EventoResponse(BaseModel):
    tipo: TipoEvento
    detalle: str | None
    actor: PersonaRef | None
    fecha: datetime


class ErrorResponse(BaseModel):
    error: str
    detalle: str
    campo: str | None = None


def consulta_response(f: Faq) -> ConsultaFrecuenteResponse:
    return ConsultaFrecuenteResponse(
        id=f.id, pregunta=f.pregunta, palabras_clave=list(f.palabras_clave), respuesta=f.respuesta
    )


def _ref(usuarios: dict[int, Usuario], user_id: int | None) -> PersonaRef | None:
    usuario = usuarios.get(user_id) if user_id is not None else None
    return PersonaRef(id=usuario.id, nombre=usuario.nombre) if usuario else None


def ticket_response(t: Ticket, usuarios: dict[int, Usuario]) -> TicketResponse:
    return TicketResponse(
        id=t.id,
        sistema_origen=t.sistema_origen,
        asunto=t.asunto,
        descripcion=t.descripcion,
        contexto=t.contexto,
        categoria=t.categoria,
        motivo=t.motivo,
        confianza=t.confianza,
        metodo_clasificacion=t.metodo_clasificacion,
        respuesta_sugerida=t.respuesta_sugerida,
        estado=t.estado,
        solicitante=_ref(usuarios, t.usuario_id),
        responsable=_ref(usuarios, t.responsable_id),
        fecha_creacion=t.fecha_creacion,
        fecha_actualizacion=t.fecha_actualizacion,
    )


def evento_response(e: Evento, usuarios: dict[int, Usuario]) -> EventoResponse:
    return EventoResponse(
        tipo=e.tipo, detalle=e.detalle, actor=_ref(usuarios, e.actor_id), fecha=e.fecha
    )
