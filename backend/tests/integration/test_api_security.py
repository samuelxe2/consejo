"""SEG-01 a SEG-08: autenticación y autorización."""

from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient

from tests.fakes import FakeClock

Login = Callable[[str], dict[str, str]]
DESCRIPCION = "Descripción suficientemente larga del problema."


def _crear(client: TestClient, headers: dict[str, str], asunto: str) -> str:
    r = client.post(
        "/api/tickets",
        headers=headers,
        json={"sistema_origen": "MAIA", "asunto": asunto, "descripcion": DESCRIPCION},
    )
    assert r.status_code == 201, r.text
    return str(r.json()["id"])


@pytest.mark.parametrize(
    "headers",
    [{}, {"Authorization": "Bearer inventado"}, {"Authorization": "Basic abc"}],
)
def test_seg01_sin_token_o_invalido(client: TestClient, headers: dict[str, str]) -> None:
    r = client.get("/api/tickets", headers=headers)
    assert r.status_code == 401
    assert r.json()["error"] == "no_autenticado"


def test_seg01_token_expirado(client: TestClient, login: Login, reloj: FakeClock) -> None:
    headers = login("estudiante")
    assert client.get("/api/tickets", headers=headers).status_code == 200
    reloj.avanzar(minutes=480)
    assert client.get("/api/tickets", headers=headers).status_code == 401


def test_login_devuelve_rol_y_expiracion(client: TestClient) -> None:
    r = client.post("/api/auth/login", json={"email": "tecnico@demo.unad.edu.co"})
    assert r.status_code == 200
    assert r.json()["rol"] == "soporte_tecnico"
    assert r.json()["expira"] == "2026-11-03T23:00:00Z"


def test_seg02_login_identidad_inexistente(client: TestClient) -> None:
    r = client.post("/api/auth/login", json={"email": "nadie@demo.unad.edu.co"})
    assert r.status_code == 401
    assert client.post("/api/auth/login", json={}).status_code == 400


def test_seg03_logout_invalida_token(client: TestClient, login: Login) -> None:
    headers = login("estudiante")
    assert client.post("/api/auth/logout", headers=headers).status_code == 200
    assert client.get("/api/tickets", headers=headers).status_code == 401
    assert client.post("/api/auth/logout", headers=headers).status_code == 401


def test_seg04_solicitante_no_ve_tickets_ajenos(client: TestClient, login: Login) -> None:
    tid = _crear(client, login("estudiante"), "¿Dónde veo mis actividades?")
    docente = login("docente")
    assert client.get(f"/api/tickets/{tid}", headers=docente).status_code == 404
    assert client.get(f"/api/tickets/{tid}/eventos", headers=docente).status_code == 404
    assert client.get("/api/tickets", headers=docente).json() == []
    r = client.patch(f"/api/tickets/{tid}/confirmacion", json={"resuelto": True}, headers=docente)
    assert r.status_code == 404


def test_seg05_agente_no_ve_ni_modifica_no_asignados(client: TestClient, login: Login) -> None:
    tid = _crear(client, login("estudiante"), "No encuentro la opción para adjuntar tarea")
    for intruso in ("funcional2", "tecnico"):
        headers = login(intruso)
        assert client.get(f"/api/tickets/{tid}", headers=headers).status_code == 404
        r = client.patch(f"/api/tickets/{tid}", json={"estado": "EN_ATENCION"}, headers=headers)
        assert r.status_code == 404
        assert client.get("/api/tickets", headers=headers).json() == []


def test_seg06_solicitante_no_cambia_estado(client: TestClient, login: Login) -> None:
    est = login("estudiante")
    auto = _crear(client, est, "¿Dónde veo mis actividades?")
    funcional = _crear(client, est, "No encuentro la opción para adjuntar tarea")
    for tid, destino in ((auto, "RESUELTO"), (funcional, "EN_ATENCION")):
        r = client.patch(f"/api/tickets/{tid}", json={"estado": destino}, headers=est)
        assert r.status_code == 400
        assert r.json()["error"] == "transicion_invalida"


def test_seg07_agente_no_confirma(client: TestClient, login: Login) -> None:
    tid = _crear(client, login("estudiante"), "No encuentro la opción para adjuntar tarea")
    r = client.patch(
        f"/api/tickets/{tid}/confirmacion", json={"resuelto": True}, headers=login("funcional1")
    )
    assert r.status_code == 400


def test_seg07_agente_no_crea_tickets(client: TestClient, login: Login) -> None:
    r = client.post(
        "/api/tickets",
        headers=login("tecnico"),
        json={"sistema_origen": "MAIA", "asunto": "Asunto", "descripcion": DESCRIPCION},
    )
    assert r.status_code == 400


def test_seg08_rol_y_responsable_del_cliente_se_ignoran(client: TestClient, login: Login) -> None:
    est = login("estudiante")
    r = client.post(
        "/api/tickets",
        headers=est,
        json={
            "sistema_origen": "MAIA",
            "asunto": "No encuentro el botón",
            "descripcion": DESCRIPCION,
            "rol": "soporte_tecnico",
            "responsable_id": 5,
        },
    )
    assert r.status_code == 201
    assert r.json()["responsable"]["id"] == 3
    tid = r.json()["id"]
    r2 = client.patch(
        f"/api/tickets/{tid}",
        headers=est,
        json={"estado": "EN_ATENCION", "rol": "soporte_funcional"},
    )
    assert r2.status_code == 400
