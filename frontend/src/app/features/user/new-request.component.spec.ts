import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { API, sesion, ticket } from '../../../testing/fixtures';
import { authInterceptor } from '../../core/auth.interceptor';
import { CLAVE_SESION } from '../../core/auth.service';
import { CLAVE_BORRADOR, leerBorrador } from '../../core/borrador';
import { ConsultaFrecuente, Sesion } from '../../shared/models';
import { DEMORA_SUGERENCIA_MS, NewRequestComponent } from './new-request.component';

const FAQS: ConsultaFrecuente[] = [
  {
    id: 1,
    pregunta: 'ubicar actividades',
    palabras_clave: ['donde veo', 'actividades'],
    respuesta: 'Ingresa al curso y abre la sección Actividades.',
  },
];

describe('NewRequestComponent (registro guiado)', () => {
  let fixture: ComponentFixture<NewRequestComponent>;
  let http: HttpTestingController;
  let el: HTMLElement;

  function crear(s: Sesion = sesion({ email: 'estudiante@demo.unad.edu.co' })): void {
    sessionStorage.setItem(CLAVE_SESION, JSON.stringify(s));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(NewRequestComponent);
    el = fixture.nativeElement;
    fixture.detectChanges();
  }

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
    vi.useRealTimers();
  });

  const q = <T extends Element = HTMLElement>(sel: string) => el.querySelector<T>(sel);
  const paso = () => q('.paso-contenido')?.getAttribute('data-paso');

  function elegir(tipo: string): void {
    q<HTMLButtonElement>(`[data-tipo="${tipo}"]`)!.click();
    fixture.detectChanges();
  }

  function escribir(clave: string, valor: string): void {
    const campo = q<HTMLInputElement>(`#campo-${clave}`)!;
    campo.value = valor;
    campo.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function revisar(): void {
    q<HTMLButtonElement>('button[type=submit]')!.click();
    fixture.detectChanges();
  }

  function enviar(): void {
    q<HTMLButtonElement>('[data-accion="enviar"]')!.click();
    fixture.detectChanges();
  }

  function completarMaia(): void {
    elegir('MAIA');
    escribir('curso', 'Cálculo diferencial');
    escribir('consulta', 'No puedo adjuntar la tarea');
    escribir('descripcion', '  El botón de adjuntar no responde.  ');
  }

  it('FE-09: el paso 2 muestra solo los campos del tipo elegido', () => {
    crear();
    expect(paso()).toBe('1');
    elegir('EVALUIA');
    expect(paso()).toBe('2');
    const campos = [...el.querySelectorAll('input, textarea')].map((c) => c.id);
    expect(campos).toEqual(['campo-evaluacion_id', 'campo-error', 'campo-descripcion']);

    q<HTMLButtonElement>('.asistente-acciones .btn-secundario')!.click(); // ← Cambiar tipo
    fixture.detectChanges();
    elegir('COURSE_BUILDER');
    const otros = [...el.querySelectorAll('input, textarea')].map((c) => c.id);
    expect(otros).toEqual(['campo-curso', 'campo-operacion', 'campo-descripcion']);
  });

  it('FE-09: campos vacíos o cortos (tras recortar) muestran errores y no avanzan', () => {
    crear();
    elegir('MAIA');
    revisar();
    expect(paso()).toBe('2');
    expect(q('[data-campo="curso"]')?.textContent).toContain('Completa "Curso"');
    expect(q('[data-campo="descripcion"]')).not.toBeNull();

    escribir('consulta', '  ab  ');
    expect(q('[data-campo="consulta"]')?.textContent).toContain('al menos 3');
  });

  it('FE-09: el opcional vacío no bloquea y no se envía', () => {
    crear();
    elegir('EVALUIA');
    escribir('evaluacion_id', 'EV-204');
    escribir('descripcion', 'No puedo ver la nota de la evaluación.');
    revisar();
    expect(paso()).toBe('3');
    enviar();
    const req = http.expectOne(`${API}/tickets`);
    expect(req.request.body.payload).toEqual({
      usuario: 'estudiante@demo.unad.edu.co',
      evaluacion_id: 'EV-204',
      descripcion: 'No puedo ver la nota de la evaluación.',
    });
    req.flush(ticket({ id: 'TCK-0002', sistema_origen: 'EVALUIA' }));
  });

  it('FE-09: revisa, envía el payload del adaptador y confirma con la respuesta sugerida', () => {
    crear();
    completarMaia();
    revisar();
    expect(paso()).toBe('3');
    expect(q('.revision')?.textContent).toContain('Cálculo diferencial');

    enviar();
    expect(q<HTMLButtonElement>('[data-accion="enviar"]')!.disabled).toBe(true);
    const req = http.expectOne(`${API}/tickets`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      sistema_origen: 'MAIA',
      payload: {
        usuario: 'estudiante@demo.unad.edu.co',
        curso: 'Cálculo diferencial',
        consulta: 'No puedo adjuntar la tarea',
        descripcion: 'El botón de adjuntar no responde.',
      },
    });
    req.flush(ticket({ id: 'TCK-0007' }));
    fixture.detectChanges();

    expect(paso()).toBe('4');
    expect(el.textContent).toContain('Solicitud TCK-0007 registrada');
    expect(el.textContent).toContain('Ingresa a la sección Actividades.');
    expect(leerBorrador()).toBeNull();

    q<HTMLButtonElement>('[data-accion="no-resuelto"]')!.click();
    const conf = http.expectOne(`${API}/tickets/TCK-0007/confirmacion`);
    expect(conf.request.body).toEqual({ resuelto: false });
    conf.flush(
      ticket({
        id: 'TCK-0007',
        categoria: 'FUNCIONAL',
        estado: 'ABIERTO',
        respuesta_sugerida: null,
        responsable: { id: 3, nombre: 'Funcional Uno' },
      }),
    );
    fixture.detectChanges();
    expect(q('.resultado-texto')?.textContent).toContain('soporte funcional');
    expect(q('.resultado-texto')?.textContent).toContain('Funcional Uno la revisará');
  });

  it('FE-09: un 400 del backend vuelve al paso 2 y marca el campo equivalente', () => {
    crear();
    completarMaia();
    revisar();
    enviar();
    http
      .expectOne(`${API}/tickets`)
      .flush(
        { error: 'validacion', detalle: 'El asunto es demasiado largo.', campo: 'asunto' },
        { status: 400, statusText: 'Bad Request' },
      );
    fixture.detectChanges();
    expect(paso()).toBe('2');
    expect(q('[data-campo="consulta"]')?.textContent).toContain('El asunto es demasiado largo.');

    escribir('consulta', 'Otra consulta');
    expect(q('[data-campo="consulta"]')).toBeNull();
  });

  it('sin correo en la sesión envía asunto y descripción', () => {
    crear(sesion());
    completarMaia();
    revisar();
    enviar();
    const req = http.expectOne(`${API}/tickets`);
    expect(req.request.body).toEqual({
      sistema_origen: 'MAIA',
      asunto: 'No puedo adjuntar la tarea',
      descripcion: 'El botón de adjuntar no responde.',
    });
    req.flush(ticket());
  });

  it('pide la sugerencia al backend tras una pausa, solo con el último texto', () => {
    vi.useFakeTimers();
    crear();
    const router = TestBed.inject(Router);
    const navegar = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    elegir('MAIA');
    expect(q('[data-sugerencia]')).toBeNull();

    escribir('consulta', 'No sé');
    vi.advanceTimersByTime(DEMORA_SUGERENCIA_MS - 100);
    escribir('consulta', 'No sé dónde veo mis actividades');
    http.expectNone(`${API}/consultas-frecuentes/sugerencia`); // aún escribiendo
    vi.advanceTimersByTime(DEMORA_SUGERENCIA_MS);

    const req = http.expectOne(`${API}/consultas-frecuentes/sugerencia`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      asunto: 'No sé dónde veo mis actividades',
      descripcion: '',
    });
    req.flush({ consulta: FAQS[0] });
    fixture.detectChanges();
    expect(q('[data-sugerencia]')?.textContent).toContain('Ingresa al curso');

    q<HTMLButtonElement>('[data-sugerencia] .btn-exito')!.click();
    expect(navegar).toHaveBeenCalledWith('/usuario');
    expect(sessionStorage.getItem(CLAVE_BORRADOR)).toBeNull();
  });

  it('guarda el progreso y lo retoma al volver', () => {
    crear();
    elegir('MAIA');
    escribir('curso', 'Ética');
    expect(leerBorrador()).toMatchObject({ paso: 2, sistema: 'MAIA', valores: { curso: 'Ética' } });
    fixture.destroy();

    fixture = TestBed.createComponent(NewRequestComponent);
    el = fixture.nativeElement;
    fixture.detectChanges();
    expect(paso()).toBe('2');
    expect(q<HTMLInputElement>('#campo-curso')!.value).toBe('Ética');
  });
});
