"""Consultas frecuentes para autoservicio (GET /api/consultas-frecuentes)."""

from collections.abc import Callable

from fastapi.testclient import TestClient

from app.infrastructure.consultas_frecuentes import CONSULTAS_FRECUENTES

Login = Callable[[str], dict[str, str]]


def test_lista_las_consultas_del_diccionario(client: TestClient, login: Login) -> None:
    r = client.get("/api/consultas-frecuentes", headers=login("estudiante"))
    assert r.status_code == 200
    j = r.json()
    assert [c["pregunta"] for c in j] == [c.pregunta for c in CONSULTAS_FRECUENTES.values()]
    assert {"id", "pregunta", "palabras_clave", "respuesta"} <= set(j[0])


def test_requiere_sesion(client: TestClient) -> None:
    assert client.get("/api/consultas-frecuentes").status_code == 401


def test_login_devuelve_el_email(client: TestClient) -> None:
    r = client.post("/api/auth/login", json={"email": "estudiante@demo.unad.edu.co"})
    assert r.json()["email"] == "estudiante@demo.unad.edu.co"
