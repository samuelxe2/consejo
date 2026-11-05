import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API, ticket } from '../../testing/fixtures';
import { SILENCIOSO } from './http-context';
import { TicketService } from './ticket.service';

describe('TicketService', () => {
  let servicio: TicketService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    servicio = TestBed.inject(TicketService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('FE-05: listar construye los parámetros de filtro y omite los vacíos', () => {
    servicio.listar({ estado: 'ABIERTO', categoria: null, sistema_origen: 'EVALUIA' }).subscribe();
    const req = http.expectOne((r) => r.url === `${API}/tickets`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys().sort()).toEqual(['estado', 'sistema_origen']);
    expect(req.request.params.get('estado')).toBe('ABIERTO');
    expect(req.request.params.get('sistema_origen')).toBe('EVALUIA');
    expect(req.request.context.get(SILENCIOSO)).toBe(false);
    req.flush([]);
  });

  it('FE-05: las lecturas del polling van marcadas como silenciosas', () => {
    servicio.listar({}, { silencioso: true }).subscribe();
    const req = http.expectOne(`${API}/tickets`);
    expect(req.request.params.keys()).toEqual([]);
    expect(req.request.context.get(SILENCIOSO)).toBe(true);
    req.flush([]);
  });

  it('FE-05: detalle, eventos, crear, cambiar estado y confirmar', () => {
    servicio.obtener('TCK-0001').subscribe();
    servicio.eventos('TCK-0001').subscribe();
    servicio
      .crear({ sistema_origen: 'MAIA', asunto: 'Asunto', descripcion: 'Descripción larga' })
      .subscribe();
    servicio.cambiarEstado('TCK-0001', 'EN_ATENCION').subscribe();
    servicio.confirmar('TCK-0001', false).subscribe();

    const esperadas: [string, string, unknown][] = [
      ['GET', `${API}/tickets/TCK-0001`, null],
      ['GET', `${API}/tickets/TCK-0001/eventos`, null],
      [
        'POST',
        `${API}/tickets`,
        { sistema_origen: 'MAIA', asunto: 'Asunto', descripcion: 'Descripción larga' },
      ],
      ['PATCH', `${API}/tickets/TCK-0001`, { estado: 'EN_ATENCION' }],
      ['PATCH', `${API}/tickets/TCK-0001/confirmacion`, { resuelto: false }],
    ];
    for (const [metodo, url, cuerpo] of esperadas) {
      const req = http.expectOne({ method: metodo, url });
      expect(req.request.body).toEqual(cuerpo);
      req.flush(metodo === 'GET' && url.endsWith('eventos') ? [] : ticket());
    }
  });

  it('FE-05: codifica el id en la URL', () => {
    servicio.obtener('TCK/../x').subscribe();
    http.expectOne(`${API}/tickets/TCK%2F..%2Fx`).flush(ticket());
  });

  it('listarPagina envía límite, desplazamiento, estados repetidos y búsqueda; lee el total', () => {
    let pagina: unknown;
    servicio
      .listarPagina(
        { estado: ['PENDIENTE_CONFIRMACION', 'ABIERTO'], q: '  foro  ' },
        { limite: 10, desplazamiento: 20 },
      )
      .subscribe((p) => (pagina = p));
    const req = http.expectOne((r) => r.url === `${API}/tickets`);
    expect(req.request.params.getAll('estado')).toEqual(['PENDIENTE_CONFIRMACION', 'ABIERTO']);
    expect(req.request.params.get('q')).toBe('foro');
    expect(req.request.params.get('limite')).toBe('10');
    expect(req.request.params.get('desplazamiento')).toBe('20');
    req.flush([ticket()], { headers: { 'X-Total-Count': '31' } });
    expect(pagina).toEqual({ items: [ticket()], total: 31 });
  });

  it('resumen pide el conteo por estado al backend', () => {
    servicio.resumen({ silencioso: true }).subscribe();
    const req = http.expectOne(`${API}/tickets/resumen`);
    expect(req.request.context.get(SILENCIOSO)).toBe(true);
    req.flush({ total: 0, por_estado: {} });
  });
});
