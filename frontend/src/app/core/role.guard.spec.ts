import { provideHttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { sesion } from '../../testing/fixtures';
import { Rol } from '../shared/models';
import { CLAVE_SESION } from './auth.service';
import { invitadoGuard, rolGuard } from './role.guard';

@Component({ template: 'pagina' })
class PaginaComponent {}

describe('Guards por rol', () => {
  async function navegarComo(rol: Rol | null, url: string): Promise<string> {
    sessionStorage.clear();
    if (rol) sessionStorage.setItem(CLAVE_SESION, JSON.stringify(sesion({ rol })));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideRouter([
          { path: 'login', canActivate: [invitadoGuard], component: PaginaComponent },
          { path: 'usuario', canActivate: [rolGuard('solicitante')], component: PaginaComponent },
          { path: 'agente', canActivate: [rolGuard('agente')], component: PaginaComponent },
        ]),
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return TestBed.inject(Router).url;
  }

  afterEach(() => sessionStorage.clear());

  it('FE-04: solicitante que intenta /agente vuelve a /usuario', async () => {
    expect(await navegarComo('solicitante', '/agente')).toBe('/usuario');
  });

  it('FE-04: sin sesión, /usuario y /agente redirigen a /login', async () => {
    expect(await navegarComo(null, '/usuario')).toBe('/login');
    TestBed.resetTestingModule();
    expect(await navegarComo(null, '/agente')).toBe('/login');
  });

  it('FE-04: agentes entran a /agente y no a /usuario', async () => {
    expect(await navegarComo('soporte_funcional', '/agente')).toBe('/agente');
    TestBed.resetTestingModule();
    expect(await navegarComo('soporte_tecnico', '/usuario')).toBe('/agente');
  });

  it('FE-04: con sesión, /login lleva a la vista del rol', async () => {
    expect(await navegarComo('solicitante', '/login')).toBe('/usuario');
  });
});
