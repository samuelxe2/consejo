import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { API, sesion } from '../../testing/fixtures';
import { authInterceptor } from './auth.interceptor';
import { AuthService, CLAVE_SESION } from './auth.service';
import { silencioso } from './http-context';
import { NotificationService } from './notification.service';

describe('authInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  let auth: AuthService;
  let avisos: NotificationService;
  let navegar: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sessionStorage.setItem(CLAVE_SESION, JSON.stringify(sesion()));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    avisos = TestBed.inject(NotificationService);
    navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => {
    ctrl.verify();
    sessionStorage.clear();
  });

  const ignorar = { error: () => undefined };

  it('FE-02: agrega Authorization a las peticiones de la API', () => {
    http.get(`${API}/tickets`).subscribe();
    expect(ctrl.expectOne(`${API}/tickets`).request.headers.get('Authorization')).toBe(
      'Bearer tok-123',
    );
  });

  it('FE-02: no envía el token a otros orígenes ni al login', () => {
    http.get('https://otro.example/datos').subscribe();
    http.post(`${API}/auth/login`, {}).subscribe();
    expect(ctrl.expectOne('https://otro.example/datos').request.headers.has('Authorization')).toBe(
      false,
    );
    expect(ctrl.expectOne(`${API}/auth/login`).request.headers.has('Authorization')).toBe(false);
  });

  it('FE-02: ante 401 cierra sesión y redirige a /login', () => {
    http.get(`${API}/tickets`, { context: silencioso() }).subscribe(ignorar);
    ctrl
      .expectOne(`${API}/tickets`)
      .flush(
        { error: 'no_autenticado', detalle: 'Token inválido o expirado.', campo: null },
        { status: 401, statusText: 'Unauthorized' },
      );
    expect(auth.autenticado()).toBe(false);
    expect(navegar).toHaveBeenCalledWith(['/login']);
    expect(avisos.avisos()[0].mensaje).toContain('sesión expiró');
  });

  it('FE-02: el 401 del login no redirige; muestra el detalle', () => {
    auth.limpiar();
    http.post(`${API}/auth/login`, {}).subscribe(ignorar);
    ctrl
      .expectOne(`${API}/auth/login`)
      .flush(
        { error: 'no_autenticado', detalle: 'Usuario no reconocido.', campo: null },
        { status: 401, statusText: 'Unauthorized' },
      );
    expect(navegar).not.toHaveBeenCalled();
    expect(avisos.avisos().map((a) => a.mensaje)).toEqual(['Usuario no reconocido.']);
  });

  it('FE-03: error 400 del backend muestra el detalle en NotificationService', () => {
    let recibido: unknown;
    http.post(`${API}/tickets`, {}).subscribe({ error: (e) => (recibido = e) });
    ctrl
      .expectOne(`${API}/tickets`)
      .flush(
        { error: 'validacion', detalle: "El campo 'asunto' es obligatorio.", campo: 'asunto' },
        { status: 400, statusText: 'Bad Request' },
      );
    expect(avisos.avisos()).toEqual([
      expect.objectContaining({ tipo: 'error', mensaje: "El campo 'asunto' es obligatorio." }),
    ]);
    expect(recibido).toBeDefined(); // el error se propaga al componente
    expect(auth.autenticado()).toBe(true);
  });

  it('FE-03: error sin formato del backend y fallo de red usan mensajes genéricos', () => {
    http.get(`${API}/a`).subscribe(ignorar);
    http.get(`${API}/b`).subscribe(ignorar);
    ctrl.expectOne(`${API}/a`).flush('<html>', { status: 502, statusText: 'Bad Gateway' });
    ctrl.expectOne(`${API}/b`).error(new ProgressEvent('error'), { status: 0 });
    expect(avisos.avisos().map((a) => a.mensaje)).toEqual([
      'Ocurrió un error inesperado.',
      'Sin conexión con el servidor.',
    ]);
  });

  it('FE-03: las peticiones silenciosas no muestran avisos', () => {
    http.get(`${API}/tickets`, { context: silencioso() }).subscribe(ignorar);
    ctrl.expectOne(`${API}/tickets`).error(new ProgressEvent('error'), { status: 0 });
    expect(avisos.avisos()).toEqual([]);
  });
});
