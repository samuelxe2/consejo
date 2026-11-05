import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { API, ticket } from '../../../testing/fixtures';
import { AgentInboxComponent, TAMANO_PAGINA_BANDEJA } from './agent-inbox.component';

describe('AgentInboxComponent (contenedor)', () => {
  let fixture: ComponentFixture<AgentInboxComponent>;
  let http: HttpTestingController;
  let el: HTMLElement;

  const asignado = ticket({
    id: 'TCK-0003',
    categoria: 'FUNCIONAL',
    estado: 'ABIERTO',
    respuesta_sugerida: null,
    motivo: 'Dificultad de uso: no encuentro',
    responsable: { id: 3, nombre: 'Funcional Uno' },
  });

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AgentInboxComponent);
    el = fixture.nativeElement;
    fixture.detectChanges();
    vi.advanceTimersByTime(0);
  });

  /** La petición pendiente del listado (lleva ?limite=…). */
  const lista = () => http.expectOne((r) => r.url === `${API}/tickets`);

  afterEach(() => {
    fixture.destroy();
    http.verify();
    vi.useRealTimers();
  });

  it('muestra origen, clasificación y motivo; "Tomar caso" pasa a EN_ATENCION', () => {
    lista().flush([asignado]);
    fixture.detectChanges();
    expect(el.textContent).toContain('Dificultad de uso: no encuentro');
    expect(el.textContent).toContain('Soporte funcional');

    el.querySelector<HTMLButtonElement>('[data-destino=EN_ATENCION]')!.click();
    const patch = http.expectOne({ method: 'PATCH', url: `${API}/tickets/TCK-0003` });
    expect(patch.request.body).toEqual({ estado: 'EN_ATENCION' });
    patch.flush({ ...asignado, estado: 'EN_ATENCION' });
    lista().flush([{ ...asignado, estado: 'EN_ATENCION' }]);
    fixture.detectChanges();
    expect(el.querySelector('[data-destino=RESUELTO]')?.textContent).toContain('Marcar resuelto');
  });

  it('el filtro de estado reinicia la consulta con el parámetro', () => {
    lista().flush([asignado]);
    const select = el.querySelector<HTMLSelectElement>('#filtro-estado')!;
    select.value = 'RESUELTO';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    vi.advanceTimersByTime(0);

    const req = http.expectOne((r) => r.url === `${API}/tickets`);
    expect(req.request.params.get('estado')).toBe('RESUELTO');
    req.flush([]);
    fixture.detectChanges();
    expect(el.textContent).toContain('No tienes tickets asignados con ese estado.');
  });

  it('pagina la bandeja: "Ver más" amplía el límite', () => {
    const primera = lista();
    expect(primera.request.params.get('limite')).toBe(String(TAMANO_PAGINA_BANDEJA));
    primera.flush([asignado], { headers: { 'X-Total-Count': '45' } });
    fixture.detectChanges();
    const boton = el.querySelector<HTMLButtonElement>('[data-accion="ver-mas"]')!;
    expect(boton.textContent).toContain('44 restantes');

    boton.click();
    fixture.detectChanges();
    vi.advanceTimersByTime(0);
    const segunda = lista();
    expect(segunda.request.params.get('limite')).toBe(String(TAMANO_PAGINA_BANDEJA * 2));
    segunda.flush([asignado], { headers: { 'X-Total-Count': '1' } });
    fixture.detectChanges();
    expect(el.querySelector('[data-accion="ver-mas"]')).toBeNull();
  });
});
