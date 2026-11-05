# Mesa de Ayuda Inteligente – Ecosistema UNAD IA 360°

Prototipo de la prueba técnica VIMEP. Diseño completo en `Documento de Diseño de Software (SDD) v1.1.docx`.

## Backend (FastAPI + SQLite)

Requisitos: Python 3.11 o superior.

**Windows (PowerShell)**

```powershell
cd backend
python -m venv .venv          # o: py -3.13 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

**Linux / macOS**

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

- La base `helpdesk.db` se crea y se siembra al primer arranque. Para reiniciarla: `python -m app.infrastructure.seed --reset`.
- Documentación interactiva: http://localhost:8000/docs

### Identidades de demostración

| Correo | Rol |
|---|---|
| estudiante@demo.unad.edu.co | solicitante |
| docente@demo.unad.edu.co | solicitante |
| funcional1@demo.unad.edu.co | soporte_funcional |
| funcional2@demo.unad.edu.co | soporte_funcional |
| tecnico@demo.unad.edu.co | soporte_tecnico |

`POST /api/auth/login` con `{"email": "..."}` devuelve el token que se envía como `Authorization: Bearer <token>`.

### Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| POST | /api/auth/login | Inicia sesión con una identidad de demostración |
| POST | /api/auth/logout | Invalida el token |
| GET | /api/tickets | Propios (solicitante) o asignados (agente), paginado: `limite` (1–100, por defecto 50) y `desplazamiento`; el total va en la cabecera `X-Total-Count`. Filtros `estado` (se puede repetir), `categoria`, `sistema_origen` y `q` (número o asunto) |
| GET | /api/tickets/resumen | Conteo por estado de los tickets del actor (contadores del panel) |
| GET | /api/tickets/{id} | Detalle con control de pertenencia |
| GET | /api/tickets/{id}/eventos | Historial del ticket |
| GET | /api/consultas-frecuentes | Consultas frecuentes del diccionario (autoservicio antes de crear un ticket) |
| POST | /api/consultas-frecuentes/sugerencia | `{"asunto": "...", "descripcion": "..."}` → la consulta frecuente que se sugeriría, con la misma regla del clasificador (o `null`) |

El número de ticket sale de un contador atómico en la tabla `secuencias` (no de `max(id) + 1`), así dos solicitudes simultáneas nunca reciben el mismo número. Las bases anteriores se migran solas al arrancar: el contador parte del mayor número existente.
| POST | /api/tickets | Crea, clasifica y enruta |
| PATCH | /api/tickets/{id} | El agente asignado cambia el estado: `{"estado": "EN_ATENCION"}` |
| PATCH | /api/tickets/{id}/confirmacion | El solicitante acepta o rechaza la respuesta AUTO: `{"resuelto": true}` |

Crear desde la vista: `{"sistema_origen": "MAIA", "asunto": "...", "descripcion": "..."}`.

Crear desde un sistema de origen simulado (lo normaliza su adaptador; `usuario` debe coincidir con la sesión):

```json
{
  "sistema_origen": "EVALUIA",
  "payload": {
    "usuario": "estudiante@demo.unad.edu.co",
    "evaluacion_id": "EV-204",
    "error": "Error HTTP 500 en integración EvaluIA–Moodle",
    "descripcion": "Al enviar la evaluación aparece un error 500 y no se guarda."
  }
}
```

Campos por sistema: MAIA (`usuario`, `curso`, `consulta`, `descripcion`), EVALUIA (`usuario`, `evaluacion_id`, `error` opcional, `descripcion`), COURSE_BUILDER (`usuario`, `curso`, `operacion`, `descripcion`).

Errores: `{"error": "validacion|no_autenticado|no_encontrado|transicion_invalida|interno", "detalle": "...", "campo": "..."}` con códigos 400, 401, 404 y 500.

### Clasificador

Por defecto `CLASSIFIER=rules`: reglas deterministas con prioridad TÉCNICO > consulta frecuente > dificultad de uso; lo incierto va a FUNCIONAL con confianza 0.3. Antes de pasar un caso a una persona se busca una respuesta en el diccionario `CONSULTAS_FRECUENTES` (`app/infrastructure/consultas_frecuentes.py`): si coincide, el ticket queda en PENDIENTE_CONFIRMACION con la respuesta sugerida, y solo si el usuario la rechaza pasa a soporte funcional (estados en `FLUJO_CONSULTA_FRECUENTE`). Para agregar una consulta frecuente, añade una entrada al diccionario y reinicia la base con `--reset`. Con `CLASSIFIER=llm` y `LLM_API_KEY`, se usa un LLM con salida JSON validada; ante error, timeout, salida inválida o confianza baja se usan las reglas. Cada ticket guarda `confianza` y `metodo_clasificacion`.

### Pruebas y calidad

```bash
pip install -r requirements-dev.txt
pytest                                   # 171 pruebas
pytest --cov=app --cov-report=term-missing
ruff check app tests
black --check app tests
mypy
```

Los nombres de las pruebas llevan el ID del plan del SDD (sección 10): `test_dom01_…`, `test_cls02_…`, `test_api07_…`, `test_seg05_…`.

## Frontend (Angular 21)

Requisitos: Node.js 20.19+ o 22.12+ y npm 10. Angular CLI se usa con `npx`; no hace falta instalarla global.

```bash
cd frontend
npm install
npx ng serve            # http://localhost:4200
```

- La URL de la API y el intervalo de polling están en `src/environments/environment.ts` (`apiUrl: 'http://localhost:8000/api'`, `pollMs: 7000`). Si el puerto 8000 está ocupado, arranca el backend con otro (`--port 8001`) y cambia `apiUrl`.
- El backend debe permitir el origen `http://localhost:4200` (`CORS_ORIGINS`, valor por defecto).

### Vistas

| Ruta | Rol | Contenido |
|---|---|---|
| /login | todos | Elegir una identidad de demostración |
| /usuario | solicitante | Inicio: bienvenida, tipos de solicitud, botón "Crear nueva solicitud", respuestas rápidas (consultas frecuentes reales) y tu actividad |
| /usuario/nueva | solicitante | Registro en 4 pasos (tipo → detalles → revisión → confirmación); campos según el tipo, sugerencia de respuesta mientras se escribe y progreso guardado |
| /usuario/solicitudes | solicitante | Contadores que filtran (total, pendientes, en proceso, completadas), búsqueda y tarjetas con su línea de tiempo; confirmar la respuesta sugerida |
| /usuario/tickets/:id | solicitante | Seguimiento: detalle, línea de tiempo con fechas ("¿En qué va mi solicitud?") y registro de actividad |
| /agente | agentes | Bandeja de asignados con filtro por estado y acciones "Tomar caso" / "Marcar resuelto" |
| /agente/tickets/:id | agentes | Detalle, acción e historial |

Las listas y el detalle se actualizan cada 7 s (`timer` + `exhaustMap`, sin peticiones simultáneas); si la red falla se conservan los datos y el indicador muestra "Sin conexión". Los guards solo guían la navegación: la autorización real está en el backend.

### Estructura

```
src/app/
  core/       AuthService, TicketService, PollingService, NotificationService, interceptor, guards
  shared/     modelos, etiquetas, badges, indicador de sincronización, historial, avisos
  features/   login, user (inicio, registro guiado, panel, respuesta AUTO), agent (bandeja, acciones), ticket-detail
```

### Pruebas y formato

```bash
npm run test:ci         # Vitest (runner por defecto de Angular 21), 71 pruebas
npm run format:check    # Prettier
npx ng build            # build de producción
```

Las pruebas FE-01 a FE-12 del SDD llevan su ID en el nombre (`FE-06: consulta en t=0 y cada 7 s…`). El polling se prueba con temporizadores falsos de Vitest y las llamadas HTTP con `HttpTestingController`. Además hay pruebas de los contenedores (solicitante, bandeja y detalle).
