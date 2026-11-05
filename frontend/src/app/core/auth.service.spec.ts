import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API, sesion } from '../../testing/fixtures';
import { AuthService, CLAVE_SESION } from './auth.service';

describe('AuthService', () => {
  let http: HttpTestingController;

  function crear(): AuthService {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(AuthService);
  }

  beforeEach(() => sessionStorage.clear());
  afterEach(() => http.verify());

  it('FE-01: login guarda token y rol; logout los borra', () => {
    const auth = crear();
    const recibido = sesion({ rol: 'soporte_tecnico', nombre: 'Técnico Demo' });

    auth.login('tecnico@demo.unad.edu.co').subscribe();
    const req = http.expectOne(`${API}/auth/login`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'tecnico@demo.unad.edu.co' });
    req.flush(recibido);

    expect(auth.token()).toBe('tok-123');
    expect(auth.rol()).toBe('soporte_tecnico');
    expect(auth.inicio()).toBe('/agente');
    expect(JSON.parse(sessionStorage.getItem(CLAVE_SESION)!)).toEqual(recibido);

    auth.logout().subscribe();
    http.expectOne(`${API}/auth/logout`).flush({ detalle: 'Sesión cerrada.' });
    expect(auth.autenticado()).toBe(false);
    expect(auth.inicio()).toBe('/login');
    expect(sessionStorage.getItem(CLAVE_SESION)).toBeNull();
  });

  it('FE-01: logout borra la sesión local aunque el backend falle', () => {
    const auth = crear();
    auth.login('estudiante@demo.unad.edu.co').subscribe();
    http.expectOne(`${API}/auth/login`).flush(sesion());

    auth.logout().subscribe({ error: () => undefined });
    http.expectOne(`${API}/auth/logout`).flush(null, { status: 500, statusText: 'Error' });
    expect(auth.autenticado()).toBe(false);
  });

  it('FE-01: restaura una sesión vigente y descarta una expirada', () => {
    sessionStorage.setItem(CLAVE_SESION, JSON.stringify(sesion()));
    expect(crear().rol()).toBe('solicitante');

    TestBed.resetTestingModule();
    sessionStorage.setItem(
      CLAVE_SESION,
      JSON.stringify(sesion({ expira: new Date(Date.now() - 1000).toISOString() })),
    );
    expect(crear().autenticado()).toBe(false);
  });

  it('FE-01: login fallido no deja sesión', () => {
    const auth = crear();
    auth.login('nadie@demo.unad.edu.co').subscribe({ error: () => undefined });
    http
      .expectOne(`${API}/auth/login`)
      .flush(
        { error: 'no_autenticado', detalle: 'Usuario no reconocido.', campo: null },
        { status: 401, statusText: 'Unauthorized' },
      );
    expect(auth.autenticado()).toBe(false);
  });
});
