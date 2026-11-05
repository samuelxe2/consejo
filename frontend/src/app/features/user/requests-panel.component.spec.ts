import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { API, sesion, ticket } from '../../../testing/fixtures';
import { authInterceptor } from '../../core/auth.interceptor';
import { CLAVE_SESION } from '../../core/auth.service';
import { ResumenTickets, Ticket } from '../../shared/models';
import {
  DEMORA_BUSQUEDA_MS,
  RequestsPanelComponent,
  TAMANO_PAGINA,
} from './requests-panel.component';

const LISTA = [
  ticket({ id: 'TCK-0001', asunto: '¿Dónde veo mis actividades?' }),
  ticket({
    id: 'TCK-0002',
    asunto: 'No me aparece el foro',
    categoria: 'FUNCIONAL',
    estado: 'EN_ATENCION',
  }),
  ticket({ id: 'TCK-0003', asunto: 'Error 500', categoria: 'TECNICO', estado: 'RESUELTO' }),
];

const RESUMEN: ResumenTickets = {
  total: 3,
  por_estado: { PENDIENTE_CONFIRMACION: 1, ABIERTO: 0, EN_ATENCION: 1, RESUELTO: 1 },
};

describe('RequestsPanelComponent (mis solicitudes)', () => {
  let fixture: ComponentFixture<RequestsPanelComponent>;
  let http: HttpTestingController;
  let el: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.setItem(CLAVE_SESION, JSON.stringify(sesion()));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(RequestsPanelComponent);
    el = fixture.nativeElement;
    fixture.detectChanges();
    vi.advanceTimersByTime(0);
  });

  afterEach(() => {
    fixture.destroy();
    http.verify();
    vi.useRealTimers();
    sessionStorage.clear();
  });

  /** Atiende el ciclo pendiente: una página del listado y el resumen. */
  function responder(items: Ticket[], total = items.length, resumen = RESUMEN): TestRequest {
    const lista = http.expectOne((r) => r.url === `${API}/tickets`);
    lista.flush(items, { headers: { 'X-Total-Count': String(total) } });
    http.expectOne(`${API}/tickets/resumen`).flush(resumen);
    fixture.detectChanges();
    return lista;
  }

  const ids = () =>
    [...el.querySelectorAll('article[data-id]')].map((a) => a.getAttribute('data-id'));
  const contador = (g: string) => el.querySelector<HTMLButtonElement>(`[data-filtro="${g}"]`)!;

  it('muestra skeletons mientras carga y luego la primera página con su respuesta sugerida', () => {
    expect(el.querySelector('app-skeleton')).not.toBeNull();
    const req = responder(LISTA);
    expect(req.request.params.get('limite')).toBe(String(TAMANO_PAGINA));
    expect(req.request.params.has('estado')).toBe(false);
    expect(el.querySelector('app-skeleton')).toBeNull();
    expect(ids()).toEqual(['TCK-0001', 'TCK-0002', 'TCK-0003']);
    expect(el.textContent).toContain('Ingresa a la sección Actividades.');
  });

  it('los contadores vienen del resumen del backend y filtran en el servidor', () => {
    responder(LISTA, 3);
    expect(contador('todas').textContent).toContain('3');
    expect(contador('pendientes').textContent).toContain('1');
    expect(contador('proceso').textContent).toContain('1');
    expect(contador('completadas').textContent).toContain('1');

    contador('pendientes').click();
    fixture.detectChanges();
    vi.advanceTimersByTime(0);
    const req = responder([LISTA[0]], 1);
    expect(req.request.params.getAll('estado')).toEqual(['PENDIENTE_CONFIRMACION', 'ABIERTO']);
    expect(contador('pendientes').getAttribute('aria-pressed')).toBe('true');
    expect(ids()).toEqual(['TCK-0001']);
  });

  it('pagina: "Ver más" pide la página ampliada solo si quedan resultados', () => {
    responder(LISTA, 25);
    const boton = el.querySelector<HTMLButtonElement>('[data-accion="ver-mas"]')!;
    expect(boton.textContent).toContain('22 restantes');

    boton.click();
    fixture.detectChanges();
    vi.advanceTimersByTime(0);
    const req = responder([...LISTA, ...LISTA.map((t) => ({ ...t, id: t.id + 'b' }))], 25);
    expect(req.request.params.get('limite')).toBe(String(TAMANO_PAGINA * 2));
    expect(ids()).toHaveLength(6);

    vi.advanceTimersByTime(7000); // el polling conserva la página ampliada
    expect(responder(LISTA, 3).request.params.get('limite')).toBe(String(TAMANO_PAGINA * 2));
    expect(el.querySelector('[data-accion="ver-mas"]')).toBeNull();
  });

  it('busca en el backend tras una pausa al escribir', () => {
    responder(LISTA);
    const buscador = el.querySelector<HTMLInputElement>('input[type=search]')!;
    buscador.value = 'foro';
    buscador.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    vi.advanceTimersByTime(DEMORA_BUSQUEDA_MS - 1);
    http.expectNone((r) => r.params.has('q'));

    vi.advanceTimersByTime(1);
    fixture.detectChanges();
    vi.advanceTimersByTime(0);
    const req = responder([], 0);
    expect(req.request.params.get('q')).toBe('foro');
    expect(el.textContent).toContain('No hay solicitudes con este filtro');
  });

  it('avisa de respuestas por confirmar; rechazar envía resuelto=false y vuelve a consultar', () => {
    responder(LISTA);
    expect(el.querySelector('.llamado')?.textContent).toContain('1 respuesta por confirmar');

    el.querySelector<HTMLButtonElement>('[data-accion="no-resuelto"]')!.click();
    const req = http.expectOne(`${API}/tickets/TCK-0001/confirmacion`);
    expect(req.request.body).toEqual({ resuelto: false });
    req.flush(ticket({ categoria: 'FUNCIONAL', estado: 'ABIERTO', respuesta_sugerida: null }));
    fixture.detectChanges();
    expect(el.querySelector('[data-id="TCK-0001"]')?.textContent).toContain('Abierto');

    responder(LISTA.slice(1), 2, {
      total: 3,
      por_estado: { PENDIENTE_CONFIRMACION: 0, ABIERTO: 1, EN_ATENCION: 1, RESUELTO: 1 },
    });
    expect(el.querySelector('.llamado')).toBeNull();
  });

  it('sin solicitudes invita a crear la primera', () => {
    responder([], 0, {
      total: 0,
      por_estado: { PENDIENTE_CONFIRMACION: 0, ABIERTO: 0, EN_ATENCION: 0, RESUELTO: 0 },
    });
    expect(el.textContent).toContain('Aún no tienes solicitudes');
    expect(el.querySelector('.vacio-ilustrado a')?.getAttribute('href')).toBe('/usuario/nueva');
  });
});
