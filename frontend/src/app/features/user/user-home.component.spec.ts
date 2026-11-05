import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { API, sesion, ticket } from '../../../testing/fixtures';
import { authInterceptor } from '../../core/auth.interceptor';
import { CLAVE_SESION } from '../../core/auth.service';
import { guardarBorrador } from '../../core/borrador';
import { ConsultaFrecuente, ResumenTickets, Ticket } from '../../shared/models';
import { UserHomeComponent } from './user-home.component';

const FAQS: ConsultaFrecuente[] = Array.from({ length: 7 }, (_, i) => ({
  id: i + 1,
  pregunta: `pregunta ${i + 1}`,
  palabras_clave: [`clave${i + 1}`],
  respuesta: `Respuesta ${i + 1}.`,
}));

describe('UserHomeComponent (inicio)', () => {
  let fixture: ComponentFixture<UserHomeComponent>;
  let http: HttpTestingController;
  let el: HTMLElement;

  function crear(): void {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(UserHomeComponent);
    el = fixture.nativeElement;
    vi.advanceTimersByTime(0);
  }

  const VACIO: ResumenTickets = {
    total: 0,
    por_estado: { PENDIENTE_CONFIRMACION: 0, ABIERTO: 0, EN_ATENCION: 0, RESUELTO: 0 },
  };

  /** Responde el ciclo de "Tus solicitudes": resumen, la pendiente y la más reciente. */
  function actividad(
    resumen: ResumenTickets = VACIO,
    pendientes: Ticket[] = [],
    recientes: Ticket[] = [],
  ): TestRequest[] {
    http.expectOne(`${API}/tickets/resumen`).flush(resumen);
    const listas = http.match((r) => r.url === `${API}/tickets`);
    expect(listas).toHaveLength(2);
    for (const r of listas) {
      const pendiente = r.request.params.get('estado') === 'PENDIENTE_CONFIRMACION';
      r.flush(pendiente ? pendientes : recientes);
    }
    fixture.detectChanges();
    return listas;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.setItem(CLAVE_SESION, JSON.stringify(sesion()));
  });

  afterEach(() => {
    fixture.destroy();
    http.verify();
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it('da la bienvenida centrada en solicitudes, sin emojis', () => {
    crear();
    http.expectOne(`${API}/consultas-frecuentes`).flush([]);
    actividad();
    fixture.detectChanges();
    expect(el.textContent).toContain('Hola, Estudiante');
    expect(el.querySelector('[data-tipo]')).toBeNull();
    expect(el.querySelector('[data-accion="crear"]')?.getAttribute('href')).toBe('/usuario/nueva');
    expect(el.querySelector('.hero a[href="/usuario/solicitudes"]')).not.toBeNull();
    expect(el.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(el.textContent).toContain('Aún no tienes solicitudes');
  });

  it('muestra una lista corta de respuestas rápidas reales y lleva al registro si no sirven', () => {
    crear();
    http.expectOne(`${API}/consultas-frecuentes`).flush(FAQS);
    actividad();
    fixture.detectChanges();
    const items = el.querySelectorAll<HTMLDetailsElement>('details.faq-item');
    expect(items).toHaveLength(5);
    expect([...items].every((d) => !d.open)).toBe(true);
    // Mismo name: el navegador deja abierto uno a la vez (acordeón exclusivo).
    expect(new Set([...items].map((d) => d.getAttribute('name'))).size).toBe(1);

    items[1].querySelector<HTMLElement>('summary')!.click();
    fixture.detectChanges();
    expect(items[1].open).toBe(true);
    expect(items[1].querySelector('.faq-respuesta')?.textContent).toContain('Respuesta 2.');

    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const botones = items[1].querySelectorAll<HTMLButtonElement>('.faq-acciones .btn-chip');
    botones[1].click(); // No, crear solicitud
    expect(navegar).toHaveBeenCalledWith(['/usuario/nueva'], {
      queryParams: { consulta: 'pregunta 2' },
    });
  });

  it('destaca la solicitud que espera respuesta y resume los estados', () => {
    crear();
    http.expectOne(`${API}/consultas-frecuentes`).flush([]);
    const consultas = actividad(
      {
        total: 2,
        por_estado: { PENDIENTE_CONFIRMACION: 1, ABIERTO: 0, EN_ATENCION: 0, RESUELTO: 1 },
      },
      [ticket({ id: 'TCK-0002', estado: 'PENDIENTE_CONFIRMACION' })],
      [ticket({ id: 'TCK-0003', estado: 'RESUELTO' })],
    );
    // Solo pide una solicitud de cada tipo, nunca la lista completa.
    expect(consultas.every((r) => r.request.params.get('limite') === '1')).toBe(true);
    fixture.detectChanges();
    expect(el.querySelector('.destacado')?.getAttribute('data-id')).toBe('TCK-0002');
    expect(el.querySelector('.destacado')?.textContent).toContain('Requiere tu respuesta');
    expect(el.querySelector('.mini-resumen')?.textContent).toContain('2 en total');
    expect(el.querySelector('.mini-resumen')?.textContent).toContain('1 completadas');
  });

  it('ofrece retomar una solicitud sin terminar', () => {
    guardarBorrador({ paso: 2, sistema: 'MAIA', valores: { curso: 'Ética' } });
    crear();
    http.expectOne(`${API}/consultas-frecuentes`).flush([]);
    actividad();
    fixture.detectChanges();
    expect(el.querySelector('.hero-borrador')?.textContent).toContain('mis cursos y actividades');
  });
});
