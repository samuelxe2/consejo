from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from app.domain.enums import (
    ROL_POR_CATEGORIA,
    Categoria,
    Estado,
    Metodo,
    Rol,
    SistemaOrigen,
    TipoEvento,
)
from app.domain.errors import TransicionInvalida, ValidacionError
from app.domain.state_machine import TipoActor, puede_transitar

ASUNTO_MIN, ASUNTO_MAX = 3, 150
DESCRIPCION_MIN, DESCRIPCION_MAX = 10, 2000


def generar_id(secuencia: int) -> str:
    return f"TCK-{secuencia:04d}"


def _validar_longitud(valor: str, campo: str, minimo: int, maximo: int) -> str:
    limpio = (valor or "").strip()
    if not limpio:
        raise ValidacionError(f"El campo '{campo}' es obligatorio.", campo)
    if not minimo <= len(limpio) <= maximo:
        raise ValidacionError(
            f"El campo '{campo}' debe tener entre {minimo} y {maximo} caracteres.", campo
        )
    return limpio


@dataclass(frozen=True)
class Usuario:
    id: int
    nombre: str
    email: str
    rol: Rol


@dataclass(frozen=True)
class Faq:
    id: int
    pregunta: str
    palabras_clave: tuple[str, ...]
    respuesta: str


@dataclass(frozen=True)
class TicketEntrante:
    """Solicitud normalizada por un adaptador, antes de clasificarse."""

    sistema_origen: SistemaOrigen
    asunto: str
    descripcion: str
    contexto: str | None = None
    usuario_email: str | None = None

    def __post_init__(self) -> None:
        asunto = _validar_longitud(self.asunto, "asunto", ASUNTO_MIN, ASUNTO_MAX)
        descripcion = _validar_longitud(
            self.descripcion, "descripcion", DESCRIPCION_MIN, DESCRIPCION_MAX
        )
        object.__setattr__(self, "asunto", asunto)
        object.__setattr__(self, "descripcion", descripcion)


@dataclass(frozen=True)
class ClassificationResult:
    categoria: Categoria
    motivo: str
    confianza: float
    respuesta_sugerida: str | None
    metodo: Metodo

    def __post_init__(self) -> None:
        if not 0.0 <= self.confianza <= 1.0:
            raise ValueError("La confianza debe estar entre 0 y 1.")


@dataclass(frozen=True)
class Evento:
    ticket_id: str
    tipo: TipoEvento
    detalle: str | None
    actor_id: int | None
    fecha: datetime


@dataclass
class Ticket:
    id: str
    sistema_origen: SistemaOrigen
    usuario_id: int
    asunto: str
    descripcion: str
    contexto: str | None
    categoria: Categoria
    motivo: str
    confianza: float
    metodo_clasificacion: Metodo
    respuesta_sugerida: str | None
    estado: Estado
    responsable_id: int | None
    fecha_creacion: datetime
    fecha_actualizacion: datetime
    eventos_nuevos: list[Evento] = field(default_factory=list, repr=False, compare=False)

    @classmethod
    def registrar(
        cls,
        ticket_id: str,
        entrante: TicketEntrante,
        solicitante_id: int,
        clasificacion: ClassificationResult,
        ahora: datetime,
    ) -> Ticket:
        es_auto = clasificacion.categoria is Categoria.AUTO
        ticket = cls(
            id=ticket_id,
            sistema_origen=entrante.sistema_origen,
            usuario_id=solicitante_id,
            asunto=entrante.asunto,
            descripcion=entrante.descripcion,
            contexto=entrante.contexto,
            categoria=clasificacion.categoria,
            motivo=clasificacion.motivo,
            confianza=clasificacion.confianza,
            metodo_clasificacion=clasificacion.metodo,
            respuesta_sugerida=clasificacion.respuesta_sugerida if es_auto else None,
            estado=Estado.PENDIENTE_CONFIRMACION if es_auto else Estado.ABIERTO,
            responsable_id=None,
            fecha_creacion=ahora,
            fecha_actualizacion=ahora,
        )
        ticket._evento(TipoEvento.CREADO, f"Creado desde {entrante.sistema_origen}", None, ahora)
        ticket._evento(
            TipoEvento.CLASIFICADO,
            f"{clasificacion.categoria} ({clasificacion.confianza:.2f}, "
            f"{clasificacion.metodo}): {clasificacion.motivo}",
            None,
            ahora,
        )
        return ticket

    @property
    def requiere_agente(self) -> bool:
        return self.categoria is not Categoria.AUTO and self.responsable_id is None

    def asignar(self, agente: Usuario | None, ahora: datetime) -> None:
        if self.categoria is Categoria.AUTO:
            raise TransicionInvalida("Los tickets AUTO no se asignan a agentes.")
        if agente is None:
            self._evento(TipoEvento.SIN_AGENTE_DISPONIBLE, "Sin agente disponible", None, ahora)
            return
        if agente.rol is not ROL_POR_CATEGORIA[self.categoria]:
            raise TransicionInvalida(
                f"Un agente con rol {agente.rol} no puede atender tickets {self.categoria}."
            )
        self.responsable_id = agente.id
        self._evento(TipoEvento.ASIGNADO, f"Asignado a {agente.nombre}", None, ahora)

    def cambiar_estado(self, nuevo: Estado, actor: Usuario, ahora: datetime) -> None:
        if not actor.rol.es_agente:
            raise TransicionInvalida(
                "Solo el agente asignado puede cambiar el estado; "
                "el solicitante usa la confirmación."
            )
        if actor.id != self.responsable_id:
            raise TransicionInvalida("Solo el agente asignado puede cambiar el estado.")
        if not puede_transitar(self.estado, nuevo, TipoActor.AGENTE):
            raise TransicionInvalida(f"Transición no permitida: {self.estado} → {nuevo}.")
        self._transitar(nuevo, actor.id, ahora)

    def confirmar(self, resuelto: bool, actor: Usuario, ahora: datetime) -> None:
        if actor.rol.es_agente or actor.id != self.usuario_id:
            raise TransicionInvalida("Solo el solicitante puede confirmar la respuesta automática.")
        destino = Estado.RESUELTO if resuelto else Estado.ABIERTO
        if not puede_transitar(self.estado, destino, TipoActor.SOLICITANTE):
            raise TransicionInvalida("El ticket no está pendiente de confirmación.")
        if resuelto:
            self._evento(TipoEvento.RESPUESTA_CONFIRMADA, None, actor.id, ahora)
        else:
            self._evento(TipoEvento.RESPUESTA_RECHAZADA, None, actor.id, ahora)
            self.categoria = Categoria.FUNCIONAL
            self.motivo = "Respuesta automática rechazada por el usuario; requiere revisión humana."
            self._evento(TipoEvento.RECLASIFICADO, "AUTO → FUNCIONAL", None, ahora)
        self._transitar(destino, actor.id, ahora)

    def _transitar(self, nuevo: Estado, actor_id: int | None, ahora: datetime) -> None:
        anterior = self.estado
        self.estado = nuevo
        self._evento(TipoEvento.ESTADO_CAMBIADO, f"{anterior} → {nuevo}", actor_id, ahora)

    def _evento(
        self, tipo: TipoEvento, detalle: str | None, actor_id: int | None, ahora: datetime
    ) -> None:
        self.fecha_actualizacion = ahora
        self.eventos_nuevos.append(Evento(self.id, tipo, detalle, actor_id, ahora))
