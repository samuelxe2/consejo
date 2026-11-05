"""Composición de la aplicación: configuración, base de datos, dependencias y rutas."""

import logging
from datetime import UTC, datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.deps import Container
from app.api.errors import register_error_handlers
from app.api.routers import auth, consultas, tickets
from app.domain.ports import Clock
from app.infrastructure.adapters import default_registry
from app.infrastructure.classifiers.factory import create_classifier
from app.infrastructure.classifiers.llm import LLMClient
from app.infrastructure.classifiers.rules import RuleBasedClassifier
from app.infrastructure.config import Settings
from app.infrastructure.db import create_schema, make_engine, make_session_factory
from app.infrastructure.repositories import SqlUnitOfWork
from app.infrastructure.seed import seed
from app.infrastructure.sessions import InMemorySessionStore


def _ahora() -> datetime:
    return datetime.now(UTC)


def create_app(
    settings: Settings | None = None,
    llm_client: LLMClient | None = None,
    clock: Clock = _ahora,
) -> FastAPI:
    settings = settings or Settings()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

    engine = make_engine(settings.database_url)
    create_schema(engine)
    session_factory = make_session_factory(engine)
    seed(session_factory, clock, settings.seed_demo_tickets, settings.faq_threshold)

    uow = SqlUnitOfWork(session_factory)
    try:
        faqs = uow.faqs.list_all()
    finally:
        uow.close()

    app = FastAPI(
        title="Mesa de Ayuda Inteligente – UNAD IA 360°",
        version="1.1.0",
        description="Recepción, clasificación y enrutamiento de tickets de soporte.",
    )
    app.state.engine = engine
    app.state.container = Container(
        settings=settings,
        session_factory=session_factory,
        sessions=InMemorySessionStore(settings.token_ttl_min, clock),
        classifier=create_classifier(settings, faqs, llm_client),
        # Siempre por reglas: se consulta mientras el usuario escribe (sin costo de LLM).
        sugeridor=RuleBasedClassifier(faqs, settings.faq_threshold),
        adapters=default_registry(),
        clock=clock,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["X-Total-Count"],
    )
    register_error_handlers(app)
    app.include_router(auth.router, prefix="/api")
    app.include_router(tickets.router, prefix="/api")
    app.include_router(consultas.router, prefix="/api")
    return app


def __getattr__(name: str) -> FastAPI:
    # `uvicorn app.main:app` crea la app al pedirla; importar create_app en las pruebas
    # no abre ni siembra helpdesk.db.
    if name == "app":
        instancia = create_app()
        globals()["app"] = instancia
        return instancia
    raise AttributeError(name)
