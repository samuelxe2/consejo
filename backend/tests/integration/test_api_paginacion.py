"""Listado paginado, resumen por estado y sugerencia de consulta frecuente."""

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient

Login = Callable[[str], dict[str, str]]
DESCRIPCION = "Descripción suficientemente larga del problema."


@pytest.fixture
def est(login: Login) -> dict[str, str]:
    return login("estudiante")


def crear(client: TestClient, headers: dict[str, str], asunto: str) -> Any:
    r = client.post(
        "/api/tickets",
        json={"sistema_origen": "MAIA", "asunto": asunto, "descripcion": DESCRIPCION},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_pagina_con_total_en_cabecera(client: TestClient, est: dict[str, str]) -> None:
    for i in range(5):
        crear(client, est, f"No me aparece el botón {i}")

    r = client.get("/api/tickets?limite=2", headers=est)
    assert r.status_code == 200
    assert r.headers["X-Total-Count"] == "5"
    assert [t["id"] for t in r.json()] == ["TCK-0005", "TCK-0004"]

    siguiente = client.get("/api/tickets?limite=2&desplazamiento=4", headers=est)
    assert [t["id"] for t in siguiente.json()] == ["TCK-0001"]
    assert siguiente.headers["X-Total-Count"] == "5"


def test_limites_de_paginacion(client: TestClient, est: dict[str, str]) -> None:
    assert client.get("/api/tickets?limite=0", headers=est).status_code == 400
    r = client.get("/api/tickets?limite=101", headers=est)
    assert r.status_code == 400
    assert r.json()["campo"] == "limite"
    assert client.get("/api/tickets?desplazamiento=-1", headers=est).status_code == 400


def test_varios_estados_y_busqueda(client: TestClient, est: dict[str, str]) -> None:
    crear(client, est, "¿Dónde veo mis actividades en MAIA?")  # AUTO, pendiente
    crear(client, est, "No me aparece el botón de publicar")  # FUNCIONAL, abierto
    crear(client, est, "Error 500 al sincronizar")  # TECNICO, abierto

    r = client.get("/api/tickets?estado=PENDIENTE_CONFIRMACION&estado=ABIERTO", headers=est)
    assert r.headers["X-Total-Count"] == "3"
    solo_abiertos = client.get("/api/tickets?estado=ABIERTO", headers=est)
    assert solo_abiertos.headers["X-Total-Count"] == "2"

    por_asunto = client.get("/api/tickets?q=BOTÓN", headers=est).json()
    assert [t["id"] for t in por_asunto] == ["TCK-0002"]
    por_numero = client.get("/api/tickets?q=tck-0003", headers=est).json()
    assert [t["id"] for t in por_numero] == ["TCK-0003"]


def test_resumen_por_estado_solo_de_los_propios(
    client: TestClient, est: dict[str, str], login: Login
) -> None:
    crear(client, est, "¿Dónde veo mis actividades en MAIA?")
    crear(client, est, "No me aparece el botón de publicar")
    crear(client, login("docente"), "No me aparece el botón de publicar")

    r = client.get("/api/tickets/resumen", headers=est)
    assert r.status_code == 200
    j = r.json()
    assert j["total"] == 2
    assert j["por_estado"] == {
        "PENDIENTE_CONFIRMACION": 1,
        "ABIERTO": 1,
        "EN_ATENCION": 0,
        "RESUELTO": 0,
    }
    agente = client.get("/api/tickets/resumen", headers=login("funcional1")).json()
    assert agente["total"] == sum(agente["por_estado"].values())


@pytest.mark.parametrize(
    ("asunto", "descripcion"),
    [
        ("No sé dónde veo mis actividades", ""),
        ("¿Dónde veo mis actividades?", "Busqué en el curso."),
        ("Quiero consultar el estado de mi evaluación", ""),
        ("Error al ver mis calificaciones", ""),  # palabra de error: no se sugiere
        ("Timeout en la integración con Moodle", "no carga"),  # técnico: no se sugiere
        ("No me aparece el botón de publicar", ""),  # sin consulta frecuente
    ],
)
def test_la_sugerencia_coincide_con_la_clasificacion(
    client: TestClient, est: dict[str, str], asunto: str, descripcion: str
) -> None:
    """Una sola regla: si el endpoint sugiere, al crear el ticket queda AUTO, y viceversa."""
    # El mismo texto en ambas llamadas (la creación exige al menos 10 caracteres).
    descripcion = f"{descripcion} {DESCRIPCION}".strip()
    sugerencia = client.post(
        "/api/consultas-frecuentes/sugerencia",
        json={"asunto": asunto, "descripcion": descripcion},
        headers=est,
    )
    assert sugerencia.status_code == 200
    consulta = sugerencia.json()["consulta"]

    creado = client.post(
        "/api/tickets",
        json={
            "sistema_origen": "MAIA",
            "asunto": asunto,
            "descripcion": descripcion,
        },
        headers=est,
    ).json()
    assert (consulta is not None) == (creado["categoria"] == "AUTO")
    if consulta:
        assert consulta["respuesta"] == creado["respuesta_sugerida"]


def test_sugerencia_requiere_sesion_y_no_crea_tickets(
    client: TestClient, est: dict[str, str]
) -> None:
    cuerpo = {"asunto": "¿Dónde veo mis actividades?"}
    assert client.post("/api/consultas-frecuentes/sugerencia", json=cuerpo).status_code == 401
    r = client.post("/api/consultas-frecuentes/sugerencia", json=cuerpo, headers=est)
    assert r.json()["consulta"]["pregunta"] == "ubicar actividades"
    assert client.get("/api/tickets", headers=est).headers["X-Total-Count"] == "0"
    vacio = client.post("/api/consultas-frecuentes/sugerencia", json={}, headers=est)
    assert vacio.json() == {"consulta": None}
