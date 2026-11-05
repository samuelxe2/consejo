"""API-01 a API-11: endpoints con TestClient y SQLite en memoria."""

from collections.abc import Callable
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

Login = Callable[[str], dict[str, str]]
DESCRIPCION = "Descripción suficientemente larga del problema."


def crear(client: TestClient, headers: dict[str, str], asunto: str, **extra: Any) -> Any:
    body = {"sistema_origen": "MAIA", "asunto": asunto, "descripcion": DESCRIPCION} | extra
    return client.post("/api/tickets", json=body, headers=headers)


@pytest.fixture
def est(login: Login) -> dict[str, str]:
    return login("estudiante")


def test_api01_crear_desde_la_vista(client: TestClient, est: dict[str, str]) -> None:
    r = crear(client, est, "¿Dónde veo mis actividades en MAIA?")
    assert r.status_code == 201
    j = r.json()
    assert j["id"] == "TCK-0001"
    assert j["categoria"] == "AUTO"
    assert j["estado"] == "PENDIENTE_CONFIRMACION"
    assert j["respuesta_sugerida"]
    assert j["metodo_clasificacion"] == "RULES"
    assert j["solicitante"] == {"id": 1, "nombre": "Estudiante Demo"}
    assert j["responsable"] is None
    assert j["fecha_creacion"] == "2026-11-03T15:00:00Z"
    assert set(j) >= {"motivo", "confianza", "fecha_actualizacion", "contexto"}


@pytest.mark.parametrize(
    ("sistema", "payload", "categoria"),
    [
        ("MAIA", {"curso": "Cálculo", "consulta": "¿Dónde veo mis actividades?"}, "AUTO"),
        (
            "EVALUIA",
            {"evaluacion_id": "EV-204", "error": "Error HTTP 500 en integración EvaluIA–Moodle"},
            "TECNICO",
        ),
        (
            "COURSE_BUILDER",
            {"curso": "Física", "operacion": "No encuentro la opción publicar"},
            "FUNCIONAL",
        ),
    ],
)
def test_api01_crear_desde_sistemas_de_origen(
    client: TestClient, est: dict[str, str], sistema: str, payload: dict[str, str], categoria: str
) -> None:
    payload = payload | {"usuario": "estudiante@demo.unad.edu.co", "descripcion": DESCRIPCION}
    r = client.post(
        "/api/tickets", json={"sistema_origen": sistema, "payload": payload}, headers=est
    )
    assert r.status_code == 201, r.text
    assert r.json()["sistema_origen"] == sistema
    assert r.json()["categoria"] == categoria
    assert r.json()["contexto"]


def test_api01_campos_calculados_se_ignoran(client: TestClient, est: dict[str, str]) -> None:
    r = crear(
        client,
        est,
        "¿Dónde veo mis actividades?",
        categoria="TECNICO",
        estado="RESUELTO",
        responsable_id=5,
        id="TCK-9999",
    )
    assert r.status_code == 201
    assert r.json()["id"] == "TCK-0001"
    assert r.json()["categoria"] == "AUTO"


@pytest.mark.parametrize(
    ("body", "campo"),
    [
        ({"sistema_origen": "MAIA", "descripcion": DESCRIPCION}, "asunto"),
        ({"sistema_origen": "MAIA", "asunto": "x" * 151, "descripcion": DESCRIPCION}, "asunto"),
        ({"sistema_origen": "MAIA", "asunto": "Asunto válido"}, "descripcion"),
        (
            {"sistema_origen": "SAKAI", "asunto": "Asunto", "descripcion": DESCRIPCION},
            "sistema_origen",
        ),
        ({"asunto": "Asunto", "descripcion": DESCRIPCION}, "sistema_origen"),
        (
            {"sistema_origen": "EVALUIA", "payload": {"usuario": "estudiante@demo.unad.edu.co"}},
            "evaluacion_id",
        ),
        (
            {
                "sistema_origen": "MAIA",
                "payload": {
                    "usuario": "docente@demo.unad.edu.co",
                    "curso": "C",
                    "consulta": "Consulta",
                    "descripcion": DESCRIPCION,
                },
            },
            "usuario",
        ),
    ],
)
def test_api02_validacion(
    client: TestClient, est: dict[str, str], body: dict[str, Any], campo: str
) -> None:
    r = client.post("/api/tickets", json=body, headers=est)
    assert r.status_code == 400
    assert r.json()["error"] == "validacion"
    assert r.json()["campo"] == campo
    assert r.json()["detalle"]


def test_api03_json_malformado(client: TestClient, est: dict[str, str]) -> None:
    r = client.post(
        "/api/tickets", content=b"{no es json", headers=est | {"Content-Type": "application/json"}
    )
    assert r.status_code == 400
    assert r.json()["error"] == "validacion"


def test_api04_ticket_inexistente(client: TestClient, est: dict[str, str]) -> None:
    r = client.get("/api/tickets/TCK-9999", headers=est)
    assert r.status_code == 404
    assert r.json()["error"] == "no_encontrado"


def test_api05_filtros(client: TestClient, est: dict[str, str]) -> None:
    crear(client, est, "¿Dónde veo mis actividades?")
    crear(client, est, "Error 500 en el servidor")
    todos = client.get("/api/tickets", headers=est).json()
    assert [t["id"] for t in todos] == ["TCK-0002", "TCK-0001"]
    tecnicos = client.get("/api/tickets?categoria=TECNICO", headers=est).json()
    assert [t["id"] for t in tecnicos] == ["TCK-0002"]
    abiertos = client.get("/api/tickets?estado=ABIERTO&sistema_origen=MAIA", headers=est).json()
    assert [t["id"] for t in abiertos] == ["TCK-0002"]
    r = client.get("/api/tickets?estado=CERRADO", headers=est)
    assert r.status_code == 400
    assert r.json()["campo"] == "estado"


def test_api06_flujo_del_agente(client: TestClient, est: dict[str, str], login: Login) -> None:
    tid = crear(client, est, "No encuentro la opción para adjuntar tarea").json()["id"]
    agente = login("funcional1")
    bandeja = client.get("/api/tickets", headers=agente).json()
    assert [t["id"] for t in bandeja] == [tid]

    r1 = client.patch(f"/api/tickets/{tid}", json={"estado": "EN_ATENCION"}, headers=agente)
    assert r1.status_code == 200 and r1.json()["estado"] == "EN_ATENCION"
    r2 = client.patch(f"/api/tickets/{tid}", json={"estado": "RESUELTO"}, headers=agente)
    assert r2.status_code == 200 and r2.json()["estado"] == "RESUELTO"
    # el solicitante ve el cambio en su consulta (lo que hace el polling)
    assert client.get(f"/api/tickets/{tid}", headers=est).json()["estado"] == "RESUELTO"


def test_api07_transicion_invalida_y_doble_envio(
    client: TestClient, est: dict[str, str], login: Login
) -> None:
    tid = crear(client, est, "Error 500 en el servidor").json()["id"]
    tecnico = login("tecnico")
    r = client.patch(f"/api/tickets/{tid}", json={"estado": "RESUELTO"}, headers=tecnico)
    assert r.status_code == 400
    assert r.json()["error"] == "transicion_invalida"
    assert (
        client.patch(
            f"/api/tickets/{tid}", json={"estado": "EN_ATENCION"}, headers=tecnico
        ).status_code
        == 200
    )
    repetido = client.patch(f"/api/tickets/{tid}", json={"estado": "EN_ATENCION"}, headers=tecnico)
    assert repetido.status_code == 400
    invalido = client.patch(f"/api/tickets/{tid}", json={"estado": "CERRADO"}, headers=tecnico)
    assert invalido.status_code == 400


@pytest.mark.parametrize(("resuelto", "estado"), [(True, "RESUELTO"), (False, "ABIERTO")])
def test_api08_confirmacion(
    client: TestClient, est: dict[str, str], login: Login, resuelto: bool, estado: str
) -> None:
    tid = crear(client, est, "¿Dónde veo mis actividades?").json()["id"]
    r = client.patch(f"/api/tickets/{tid}/confirmacion", json={"resuelto": resuelto}, headers=est)
    assert r.status_code == 200
    assert r.json()["estado"] == estado
    if not resuelto:
        assert r.json()["categoria"] == "FUNCIONAL"
        assert r.json()["responsable"]["id"] == 3
        bandeja = client.get("/api/tickets", headers=login("funcional1")).json()
        assert [t["id"] for t in bandeja] == [tid]


def test_api08_confirmacion_requiere_booleano(client: TestClient, est: dict[str, str]) -> None:
    tid = crear(client, est, "¿Dónde veo mis actividades?").json()["id"]
    r = client.patch(f"/api/tickets/{tid}/confirmacion", json={"resuelto": "si"}, headers=est)
    assert r.status_code == 400
    assert r.json()["campo"] == "resuelto"


def test_api09_historial(client: TestClient, est: dict[str, str]) -> None:
    tid = crear(client, est, "¿Dónde veo mis actividades?").json()["id"]
    client.patch(f"/api/tickets/{tid}/confirmacion", json={"resuelto": False}, headers=est)
    eventos = client.get(f"/api/tickets/{tid}/eventos", headers=est).json()
    assert [e["tipo"] for e in eventos] == [
        "CREADO",
        "CLASIFICADO",
        "RESPUESTA_RECHAZADA",
        "RECLASIFICADO",
        "ESTADO_CAMBIADO",
        "ASIGNADO",
    ]
    assert eventos[2]["actor"] == {"id": 1, "nombre": "Estudiante Demo"}
    assert eventos[0]["actor"] is None


def test_api10_error_inesperado(
    app: FastAPI, login: Login, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.application import tickets as casos

    def explota(*_: object, **__: object) -> None:
        raise RuntimeError("detalle interno secreto")

    headers = login("estudiante")
    monkeypatch.setattr(casos.ListarTickets, "ejecutar", explota)
    with TestClient(app, raise_server_exceptions=False) as c:
        r = c.get("/api/tickets", headers=headers)
    assert r.status_code == 500
    assert r.json() == {
        "error": "interno",
        "detalle": "Ocurrió un error inesperado.",
        "campo": None,
    }
    assert "secreto" not in r.text


def test_api11_cors(client: TestClient) -> None:
    permitido = client.options(
        "/api/tickets",
        headers={"Origin": "http://localhost:4200", "Access-Control-Request-Method": "GET"},
    )
    assert permitido.headers["access-control-allow-origin"] == "http://localhost:4200"
    otro = client.options(
        "/api/tickets",
        headers={"Origin": "http://malicioso.example", "Access-Control-Request-Method": "GET"},
    )
    assert "access-control-allow-origin" not in otro.headers


def test_documentacion_openapi(client: TestClient) -> None:
    rutas = client.get("/openapi.json").json()["paths"]
    assert {
        "/api/tickets",
        "/api/tickets/{ticket_id}",
        "/api/tickets/{ticket_id}/eventos",
        "/api/tickets/{ticket_id}/confirmacion",
        "/api/auth/login",
        "/api/auth/logout",
    } <= set(rutas)
