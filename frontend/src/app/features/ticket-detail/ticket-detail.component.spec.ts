import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { API, sesion, ticket } from '../../../testing/fixtures';
import { CLAVE_SESION } from '../../core/auth.service';
import { Evento, Rol } from '../../shared/models';
import { TicketDetailComponent } from './ticket-detail.component';

const EVENTOS: Evento[] = [
  {
    tipo: 'CREADO',
    detalle: 'Desde MAIA',
    actor: { id: 1, nombre: 'Estudiante Demo' },
    fecha: '2026-11-03T15:00:00Z',
  },
  {
    tipo: 'CLASIFICADO',
    detalle: 'AUTO (0.80, RULES)',
    actor: null,
    fecha: '2026-11-03T15:00:00Z',
  },
];

describe('TicketDetailComponent', () => {
  let fixture: ComponentFixture<TicketDetailComponent>;
  let http: HttpTestingController;
  let el: HTMLElement;

  function montar(rol: Rol): void {
    vi.useFakeTimers();
    sessionStorage.setItem(CLAVE_SESION, JSON.stringify(sesion({ rol })));
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TicketDetailComponent);
    fixture.componentRef.setInput('id', 'TCK-0001');
    el = fixture.nativeElement;
    fixture.detectChanges();
    vi.advanceTimersByTime(0);
  }

  function responder(t = ticket(), eventos = EVENTOS): void {
    http.expectOne(`${API}/tickets/TCK-0001`).flush(t);
    http.expectOne(`${API}/tickets/TCK-0001/eventos`).flush(eventos);
    fixture.detectChanges();
  }

  afterEach(() => {
    fixture.destroy();
    http.verify();
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it('muestra detalle e historial; el solicitante ve la respuesta sugerida', () => {
    montar('solicitante');
    responder();
    expect(el.textContent).toContain('¿Dónde veo mis actividades?');
    expect(el.textContent).toContain('Ticket creado');
    expect(el.textContent).toContain('Sistema'); // evento sin actor
    expect(el.querySelector('app-auto-response')).not.toBeNull();
    expect(el.querySelector('app-ticket-actions')).toBeNull();
  });

  it('el agente ve las acciones y no la confirmación', () => {
    montar('soporte_funcional');
    responder(ticket({ categoria: 'FUNCIONAL', estado: 'EN_ATENCION', respuesta_sugerida: null }));
    expect(el.querySelector('[data-destino=RESUELTO]')).not.toBeNull();
    expect(el.querySelector('app-auto-response')).toBeNull();
  });

  it('un 404 muestra "no existe o no tienes acceso"', () => {
    montar('solicitante');
    const error = { error: 'no_encontrado', detalle: 'No existe', campo: null };
    http
      .expectOne(`${API}/tickets/TCK-0001`)
      .flush(error, { status: 404, statusText: 'Not Found' });
    // forkJoin cancela la otra petición al fallar la primera
    http.match(`${API}/tickets/TCK-0001/eventos`).forEach((r) => expect(r.cancelled).toBe(true));
    fixture.detectChanges();
    expect(el.textContent).toContain('no existe o no tienes acceso');
  });
});
