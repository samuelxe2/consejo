"""Datos semilla (SDD 4.5). Uso: python -m app.infrastructure.seed --reset"""

import argparse
from typing import Any

from sqlalchemy import Engine, select
from sqlalchemy.orm import sessionmaker

from app.application.tickets import CrearTicket
from app.domain.entities import TicketEntrante
from app.domain.enums import Rol, SistemaOrigen
from app.domain.ports import Clock, ahora_utc
from app.infrastructure.classifiers.rules import RuleBasedClassifier
from app.infrastructure.config import Settings
from app.infrastructure.consultas_frecuentes import como_faqs
from app.infrastructure.db import (
    Base,
    FaqModel,
    UserModel,
    create_schema,
    make_engine,
    make_session_factory,
)
from app.infrastructure.repositories import SqlUnitOfWork
from app.infrastructure.router import LeastLoadedRouter

USUARIOS = [
    (1, "Estudiante Demo", "estudiante@demo.unad.edu.co", Rol.SOLICITANTE),
    (2, "Docente Demo", "docente@demo.unad.edu.co", Rol.SOLICITANTE),
    (3, "Funcional Uno", "funcional1@demo.unad.edu.co", Rol.SOPORTE_FUNCIONAL),
    (4, "Funcional Dos", "funcional2@demo.unad.edu.co", Rol.SOPORTE_FUNCIONAL),
    (5, "Técnico Demo", "tecnico@demo.unad.edu.co", Rol.SOPORTE_TECNICO),
]

TICKETS_DEMO = [
    (
        SistemaOrigen.MAIA,
        "¿Cómo consulto mis calificaciones?",
        "Quiero saber dónde aparecen mis calificaciones del curso.",
    ),
    (
        SistemaOrigen.COURSE_BUILDER,
        "No me aparece el botón para publicar el foro",
        "Terminé de configurar el foro pero no me aparece el botón de publicar.",
    ),
    (
        SistemaOrigen.EVALUIA,
        "Timeout al sincronizar con Moodle",
        "La sincronización de notas con Moodle termina en timeout desde esta mañana.",
    ),
]


def seed(
    session_factory: sessionmaker[Any],
    clock: Clock = ahora_utc,
    demo_tickets: bool = True,
    faq_threshold: float = 0.6,
) -> None:
    """Carga usuarios, FAQ y tickets de ejemplo si la base está vacía."""
    with session_factory() as s:
        # Las consultas frecuentes viven en código: se sincronizan siempre, también en bases
        # que ya tenían usuarios, para que las nuevas lleguen sin recrear la base.
        for f in como_faqs():
            s.merge(
                FaqModel(
                    id=f.id,
                    pregunta=f.pregunta,
                    palabras_clave=",".join(f.palabras_clave),
                    respuesta=f.respuesta,
                )
            )
        s.commit()
        if s.scalar(select(UserModel.id).limit(1)) is not None:
            return
        s.add_all(UserModel(id=i, nombre=n, email=e, rol=r.value) for i, n, e, r in USUARIOS)
        s.commit()

    if not demo_tickets:
        return
    for sistema, asunto, descripcion in TICKETS_DEMO:
        uow = SqlUnitOfWork(session_factory)
        try:
            estudiante = uow.users.get(1)
            if estudiante is None:
                raise RuntimeError("Falta el usuario semilla 1 (solicitante demo).")
            clasificador = RuleBasedClassifier(uow.faqs.list_all(), faq_threshold)
            CrearTicket(
                uow, clasificador, LeastLoadedRouter(uow.users, uow.tickets), clock
            ).ejecutar(TicketEntrante(sistema, asunto, descripcion), estudiante)
        finally:
            uow.close()


def reset(engine: Engine, settings: Settings) -> None:
    Base.metadata.drop_all(engine)
    create_schema(engine)
    seed(
        make_session_factory(engine),
        demo_tickets=settings.seed_demo_tickets,
        faq_threshold=settings.faq_threshold,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Carga los datos semilla.")
    parser.add_argument("--reset", action="store_true", help="borra y recrea la base")
    args = parser.parse_args()
    config = Settings()
    motor = make_engine(config.database_url)
    if args.reset:
        reset(motor, config)
    else:
        create_schema(motor)
        seed(
            make_session_factory(motor),
            demo_tickets=config.seed_demo_tickets,
            faq_threshold=config.faq_threshold,
        )
    print("Datos semilla cargados.")
