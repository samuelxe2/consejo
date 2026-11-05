class DominioError(Exception):
    """Error de negocio; el manejador de la API lo traduce a un código HTTP."""

    def __init__(self, detalle: str) -> None:
        super().__init__(detalle)
        self.detalle = detalle


class ValidacionError(DominioError):
    def __init__(self, detalle: str, campo: str | None = None) -> None:
        super().__init__(detalle)
        self.campo = campo


class TicketNoEncontrado(DominioError):
    def __init__(self, ticket_id: str) -> None:
        super().__init__(f"El ticket {ticket_id} no existe o no es accesible.")


class TransicionInvalida(DominioError):
    pass


class NoAutenticado(DominioError):
    pass
