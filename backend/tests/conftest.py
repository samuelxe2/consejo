from collections.abc import Callable, Iterator
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.infrastructure.config import Settings
from app.infrastructure.db import create_schema, make_engine, make_session_factory
from app.infrastructure.seed import seed
from app.main import create_app
from tests.fakes import FakeClock

Headers = dict[str, str]


@pytest.fixture
def reloj() -> FakeClock:
    return FakeClock()


@pytest.fixture
def settings() -> Settings:
    return Settings(_env_file=None, database_url="sqlite://", seed_demo_tickets=False)  # type: ignore[call-arg]


@pytest.fixture
def session_factory(reloj: FakeClock) -> Iterator[sessionmaker[Any]]:
    engine = make_engine("sqlite://")
    create_schema(engine)
    factory = make_session_factory(engine)
    seed(factory, reloj, demo_tickets=False)
    yield factory
    engine.dispose()


@pytest.fixture
def app(settings: Settings, reloj: FakeClock) -> Iterator[FastAPI]:
    aplicacion = create_app(settings, clock=reloj)
    yield aplicacion
    aplicacion.state.engine.dispose()


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def login(client: TestClient) -> Callable[[str], Headers]:
    def _login(alias: str) -> Headers:
        r = client.post("/api/auth/login", json={"email": f"{alias}@demo.unad.edu.co"})
        assert r.status_code == 200, r.text
        return {"Authorization": f"Bearer {r.json()['token']}"}

    return _login
