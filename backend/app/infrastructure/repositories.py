"""Repositorios SQLAlchemy y Unit of Work (SDD 3.8, 4)."""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session, sessionmaker

from app.domain.entities import Evento, Faq, Ticket, Usuario, generar_id
from app.domain.enums import (
    ESTADOS_ACTIVOS,
    Categoria,
    Estado,
    Metodo,
    Rol,
    SistemaOrigen,
    TipoEvento,
)
from app.domain.ports import PAGINACION_POR_DEFECTO, Filtros, Pagina, Paginacion
from app.infrastructure.db import (
    SECUENCIA_TICKETS,
    EventoModel,
    FaqModel,
    SecuenciaModel,
    TicketModel,
    UserModel,
)


def _utc(fecha: datetime) -> datetime:
    return fecha.replace(tzinfo=UTC) if fecha.tzinfo is None else fecha.astimezone(UTC)


def _naive(fecha: datetime) -> datetime:
    return _utc(fecha).replace(tzinfo=None)


# ---------- mappers ----------
def user_to_entity(m: UserModel) -> Usuario:
    return Usuario(m.id, m.nombre, m.email, Rol(m.rol))


def ticket_to_entity(m: TicketModel) -> Ticket:
    return Ticket(
        id=m.id,
        sistema_origen=SistemaOrigen(m.sistema_origen),
        usuario_id=m.usuario_id,
        asunto=m.asunto,
        descripcion=m.descripcion,
        contexto=m.contexto,
        categoria=Categoria(m.categoria),
        motivo=m.motivo,
        confianza=m.confianza,
        metodo_clasificacion=Metodo(m.metodo_clasificacion),
        respuesta_sugerida=m.respuesta_sugerida,
        estado=Estado(m.estado),
        responsable_id=m.responsable_id,
        fecha_creacion=_utc(m.fecha_creacion),
        fecha_actualizacion=_utc(m.fecha_actualizacion),
    )


def _copiar_a_modelo(t: Ticket, m: TicketModel) -> TicketModel:
    m.id = t.id
    m.sistema_origen = t.sistema_origen.value
    m.usuario_id = t.usuario_id
    m.asunto = t.asunto
    m.descripcion = t.descripcion
    m.contexto = t.contexto
    m.categoria = t.categoria.value
    m.motivo = t.motivo
    m.confianza = t.confianza
    m.metodo_clasificacion = t.metodo_clasificacion.value
    m.respuesta_sugerida = t.respuesta_sugerida
    m.estado = t.estado.value
    m.responsable_id = t.responsable_id
    m.fecha_creacion = _naive(t.fecha_creacion)
    m.fecha_actualizacion = _naive(t.fecha_actualizacion)
    return m


# ---------- repositorios ----------
class SqlTicketRepository:
    def __init__(self, session: Session) -> None:
        self._s = session

    def next_id(self) -> str:
        """Incrementa el contador y lee el valor en una sola sentencia.

        El UPDATE bloquea la fila (o la base, en SQLite) hasta el commit del caso de uso,
        así dos solicitudes simultáneas nunca obtienen el mismo número. Si la transacción
        se revierte, el número también, y no quedan huecos.
        """
        valor = self._s.execute(
            update(SecuenciaModel)
            .where(SecuenciaModel.nombre == SECUENCIA_TICKETS)
            .values(valor=SecuenciaModel.valor + 1)
            .returning(SecuenciaModel.valor)
        ).scalar_one()
        return generar_id(valor)

    def add(self, ticket: Ticket) -> None:
        self._s.add(_copiar_a_modelo(ticket, TicketModel()))
        self._s.flush()
        self._guardar_eventos(ticket)

    def save(self, ticket: Ticket) -> None:
        modelo = self._s.get(TicketModel, ticket.id)
        if modelo is None:
            raise LookupError(ticket.id)
        _copiar_a_modelo(ticket, modelo)
        self._s.flush()
        self._guardar_eventos(ticket)

    def get(self, ticket_id: str) -> Ticket | None:
        modelo = self._s.get(TicketModel, ticket_id)
        return ticket_to_entity(modelo) if modelo else None

    def list_by_requester(
        self, user_id: int, filtros: Filtros, paginacion: Paginacion = PAGINACION_POR_DEFECTO
    ) -> Pagina[Ticket]:
        return self._listar(TicketModel.usuario_id == user_id, filtros, paginacion)

    def list_by_assignee(
        self, user_id: int, filtros: Filtros, paginacion: Paginacion = PAGINACION_POR_DEFECTO
    ) -> Pagina[Ticket]:
        return self._listar(TicketModel.responsable_id == user_id, filtros, paginacion)

    def count_by_estado_for_requester(self, user_id: int) -> dict[Estado, int]:
        return self._contar_por_estado(TicketModel.usuario_id == user_id)

    def count_by_estado_for_assignee(self, user_id: int) -> dict[Estado, int]:
        return self._contar_por_estado(TicketModel.responsable_id == user_id)

    def count_open_by_agent(self, rol: Rol) -> dict[int, int]:
        filas = self._s.execute(
            select(TicketModel.responsable_id, func.count())
            .join(UserModel, UserModel.id == TicketModel.responsable_id)
            .where(UserModel.rol == rol.value)
            .where(TicketModel.estado.in_([e.value for e in ESTADOS_ACTIVOS]))
            .group_by(TicketModel.responsable_id)
        ).all()
        # el join con users descarta responsable_id nulo
        return {agente: total for agente, total in filas if agente is not None}

    def list_unassigned(self, categoria: Categoria) -> list[Ticket]:
        modelos = self._s.scalars(
            select(TicketModel)
            .where(TicketModel.responsable_id.is_(None))
            .where(TicketModel.categoria == categoria.value)
            .where(TicketModel.estado.in_([e.value for e in ESTADOS_ACTIVOS]))
            .order_by(TicketModel.fecha_creacion, TicketModel.id)
        )
        return [ticket_to_entity(m) for m in modelos]

    def list_events(self, ticket_id: str) -> list[Evento]:
        modelos = self._s.scalars(
            select(EventoModel)
            .where(EventoModel.ticket_id == ticket_id)
            .order_by(EventoModel.fecha, EventoModel.id)
        )
        return [
            Evento(m.ticket_id, TipoEvento(m.tipo), m.detalle, m.actor_id, _utc(m.fecha))
            for m in modelos
        ]

    def _listar(self, condicion: Any, filtros: Filtros, paginacion: Paginacion) -> Pagina[Ticket]:
        condiciones = [condicion]
        if filtros.estados:
            condiciones.append(TicketModel.estado.in_([e.value for e in filtros.estados]))
        if filtros.categoria:
            condiciones.append(TicketModel.categoria == filtros.categoria.value)
        if filtros.sistema_origen:
            condiciones.append(TicketModel.sistema_origen == filtros.sistema_origen.value)
        if filtros.texto and filtros.texto.strip():
            patron = f"%{filtros.texto.strip().lower()}%"
            condiciones.append(
                or_(
                    func.lower(TicketModel.id).like(patron),
                    func.lower(TicketModel.asunto).like(patron),
                )
            )

        total = self._s.scalar(select(func.count()).select_from(TicketModel).where(*condiciones))
        consulta = (
            select(TicketModel)
            .where(*condiciones)
            .order_by(TicketModel.fecha_actualizacion.desc(), TicketModel.id.desc())
            .limit(paginacion.limite)
            .offset(paginacion.desplazamiento)
        )
        return Pagina([ticket_to_entity(m) for m in self._s.scalars(consulta)], total or 0)

    def _contar_por_estado(self, condicion: Any) -> dict[Estado, int]:
        filas = self._s.execute(
            select(TicketModel.estado, func.count()).where(condicion).group_by(TicketModel.estado)
        ).all()
        return {Estado(estado): total for estado, total in filas}

    def _guardar_eventos(self, ticket: Ticket) -> None:
        for e in ticket.eventos_nuevos:
            self._s.add(
                EventoModel(
                    ticket_id=e.ticket_id,
                    tipo=e.tipo.value,
                    detalle=e.detalle,
                    actor_id=e.actor_id,
                    fecha=_naive(e.fecha),
                )
            )
        ticket.eventos_nuevos.clear()
        self._s.flush()


class SqlUserRepository:
    def __init__(self, session: Session) -> None:
        self._s = session

    def get(self, user_id: int) -> Usuario | None:
        modelo = self._s.get(UserModel, user_id)
        return user_to_entity(modelo) if modelo else None

    def get_by_email(self, email: str) -> Usuario | None:
        modelo = self._s.scalar(
            select(UserModel).where(func.lower(UserModel.email) == email.strip().lower())
        )
        return user_to_entity(modelo) if modelo else None

    def list_by_rol(self, rol: Rol) -> list[Usuario]:
        modelos = self._s.scalars(
            select(UserModel).where(UserModel.rol == rol.value).order_by(UserModel.id)
        )
        return [user_to_entity(m) for m in modelos]

    def list_all(self) -> list[Usuario]:
        return [
            user_to_entity(m) for m in self._s.scalars(select(UserModel).order_by(UserModel.id))
        ]


class SqlFaqRepository:
    def __init__(self, session: Session) -> None:
        self._s = session

    def list_all(self) -> list[Faq]:
        return [
            Faq(
                m.id, m.pregunta, tuple(k.strip() for k in m.palabras_clave.split(",")), m.respuesta
            )
            for m in self._s.scalars(select(FaqModel).order_by(FaqModel.id))
        ]


class SqlUnitOfWork:
    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self.session = session_factory()
        self.tickets = SqlTicketRepository(self.session)
        self.users = SqlUserRepository(self.session)
        self.faqs = SqlFaqRepository(self.session)

    def commit(self) -> None:
        self.session.commit()

    def rollback(self) -> None:
        self.session.rollback()

    def close(self) -> None:
        """Descarta lo no confirmado y libera la conexión."""
        self.session.rollback()
        self.session.close()
