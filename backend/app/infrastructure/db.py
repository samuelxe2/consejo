from datetime import datetime
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Engine,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    create_engine,
    event,
    func,
    insert,
    select,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from sqlalchemy.pool import StaticPool

from app.domain.enums import Categoria, Estado, Metodo, Rol, SistemaOrigen


def _valores(enum: Any) -> str:
    return ", ".join(f"'{e.value}'" for e in enum)


class Base(DeclarativeBase):
    pass


class UserModel(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint(f"rol IN ({_valores(Rol)})", name="ck_users_rol"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(160), unique=True)
    rol: Mapped[str] = mapped_column(String(30))


class TicketModel(Base):
    __tablename__ = "tickets"
    __table_args__ = (
        CheckConstraint(f"sistema_origen IN ({_valores(SistemaOrigen)})", name="ck_t_sistema"),
        CheckConstraint(f"categoria IN ({_valores(Categoria)})", name="ck_t_categoria"),
        CheckConstraint(f"estado IN ({_valores(Estado)})", name="ck_t_estado"),
        CheckConstraint(f"metodo_clasificacion IN ({_valores(Metodo)})", name="ck_t_metodo"),
        CheckConstraint("confianza >= 0 AND confianza <= 1", name="ck_t_confianza"),
        Index("ix_tickets_usuario", "usuario_id"),
        Index("ix_tickets_responsable_estado", "responsable_id", "estado"),
    )

    id: Mapped[str] = mapped_column(String(12), primary_key=True)
    sistema_origen: Mapped[str] = mapped_column(String(20))
    usuario_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    asunto: Mapped[str] = mapped_column(String(150))
    descripcion: Mapped[str] = mapped_column(Text)
    contexto: Mapped[str | None] = mapped_column(Text, nullable=True)
    categoria: Mapped[str] = mapped_column(String(12))
    motivo: Mapped[str] = mapped_column(Text)
    confianza: Mapped[float] = mapped_column(Float)
    metodo_clasificacion: Mapped[str] = mapped_column(String(8))
    respuesta_sugerida: Mapped[str | None] = mapped_column(Text, nullable=True)
    estado: Mapped[str] = mapped_column(String(25))
    responsable_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    fecha_creacion: Mapped[datetime] = mapped_column(DateTime)
    fecha_actualizacion: Mapped[datetime] = mapped_column(DateTime)


class EventoModel(Base):
    __tablename__ = "ticket_eventos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_id: Mapped[str] = mapped_column(ForeignKey("tickets.id"), index=True)
    tipo: Mapped[str] = mapped_column(String(30))
    detalle: Mapped[str | None] = mapped_column(Text, nullable=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    fecha: Mapped[datetime] = mapped_column(DateTime)


class SecuenciaModel(Base):
    """Contadores atómicos: el número de ticket sale de aquí, no de max(id)."""

    __tablename__ = "secuencias"

    nombre: Mapped[str] = mapped_column(String(30), primary_key=True)
    valor: Mapped[int] = mapped_column(Integer)


class FaqModel(Base):
    __tablename__ = "faq"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pregunta: Mapped[str] = mapped_column(Text)
    palabras_clave: Mapped[str] = mapped_column(Text)  # separadas por comas
    respuesta: Mapped[str] = mapped_column(Text)


def make_engine(url: str) -> Engine:
    if not url.startswith("sqlite"):
        return create_engine(url)
    if url in ("sqlite://", "sqlite:///:memory:"):
        engine = create_engine(url, connect_args={"check_same_thread": False}, poolclass=StaticPool)
    else:
        engine = create_engine(url, connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def _activar_fk(dbapi_conn: Any, _: Any) -> None:
        dbapi_conn.execute("PRAGMA foreign_keys = ON")

    return engine


def make_session_factory(engine: Engine) -> sessionmaker[Any]:
    return sessionmaker(bind=engine, expire_on_commit=False)


SECUENCIA_TICKETS = "tickets"


def create_schema(engine: Engine) -> None:
    Base.metadata.create_all(engine)
    _inicializar_secuencias(engine)


def _inicializar_secuencias(engine: Engine) -> None:
    """Crea el contador de tickets partiendo del mayor número existente (bases anteriores)."""
    with engine.begin() as conn:
        existe = conn.scalar(
            select(SecuenciaModel.valor).where(SecuenciaModel.nombre == SECUENCIA_TICKETS)
        )
        if existe is not None:
            return
        # Numérico, no texto: 'TCK-10000' es mayor que 'TCK-9999'.
        ultimo = conn.scalar(select(func.max(func.cast(func.substr(TicketModel.id, 5), Integer))))
        conn.execute(insert(SecuenciaModel).values(nombre=SECUENCIA_TICKETS, valor=ultimo or 0))
