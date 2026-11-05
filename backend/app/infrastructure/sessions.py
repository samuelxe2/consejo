import secrets
from datetime import timedelta

from app.domain.entities import Usuario
from app.domain.ports import Clock, Sesion


class InMemorySessionStore:
    """Tokens opacos en memoria con expiración. Solo para demostración (SDD 9.1)."""

    def __init__(self, ttl_min: int, clock: Clock) -> None:
        self._ttl = timedelta(minutes=ttl_min)
        self._clock = clock
        self._sesiones: dict[str, Sesion] = {}

    def create(self, usuario: Usuario) -> Sesion:
        sesion = Sesion(secrets.token_urlsafe(32), usuario, self._clock() + self._ttl)
        self._sesiones[sesion.token] = sesion
        return sesion

    def get(self, token: str) -> Sesion | None:
        sesion = self._sesiones.get(token)
        if sesion is None:
            return None
        if sesion.expira <= self._clock():
            del self._sesiones[token]
            return None
        return sesion

    def revoke(self, token: str) -> None:
        self._sesiones.pop(token, None)
