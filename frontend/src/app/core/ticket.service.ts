import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../environments/environment';
import {
  CrearTicketDto,
  Estado,
  Evento,
  Filtros,
  PaginaTickets,
  Paginacion,
  ResumenTickets,
  Ticket,
} from '../shared/models';
import { silencioso } from './http-context';

export interface OpcionesLectura {
  /** Las lecturas del polling no muestran avisos; su estado lo refleja el indicador. */
  silencioso?: boolean;
}

/** Llamadas REST de tickets (SDD 6). */
@Injectable({ providedIn: 'root' })
export class TicketService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/tickets`;

  /** Primera página (hasta el límite por defecto del backend). */
  listar(filtros: Filtros = {}, opciones: OpcionesLectura = {}): Observable<Ticket[]> {
    return this.http.get<Ticket[]>(this.base, {
      params: parametros(filtros),
      ...contexto(opciones),
    });
  }

  /** Una página con el total de resultados (cabecera X-Total-Count). */
  listarPagina(
    filtros: Filtros,
    paginacion: Paginacion,
    opciones: OpcionesLectura = {},
  ): Observable<PaginaTickets> {
    let params = parametros(filtros).set('limite', paginacion.limite);
    if (paginacion.desplazamiento) params = params.set('desplazamiento', paginacion.desplazamiento);
    return this.http
      .get<Ticket[]>(this.base, { params, observe: 'response', ...contexto(opciones) })
      .pipe(
        map((r) => {
          const items = r.body ?? [];
          const total = Number(r.headers.get('X-Total-Count'));
          return { items, total: Number.isFinite(total) && total > 0 ? total : items.length };
        }),
      );
  }

  /** Conteo por estado calculado en el backend. */
  resumen(opciones: OpcionesLectura = {}): Observable<ResumenTickets> {
    return this.http.get<ResumenTickets>(`${this.base}/resumen`, contexto(opciones));
  }

  obtener(id: string, opciones: OpcionesLectura = {}): Observable<Ticket> {
    return this.http.get<Ticket>(this.url(id), contexto(opciones));
  }

  eventos(id: string, opciones: OpcionesLectura = {}): Observable<Evento[]> {
    return this.http.get<Evento[]>(`${this.url(id)}/eventos`, contexto(opciones));
  }

  crear(dto: CrearTicketDto): Observable<Ticket> {
    return this.http.post<Ticket>(this.base, dto);
  }

  cambiarEstado(id: string, estado: Estado): Observable<Ticket> {
    return this.http.patch<Ticket>(this.url(id), { estado });
  }

  confirmar(id: string, resuelto: boolean): Observable<Ticket> {
    return this.http.patch<Ticket>(`${this.url(id)}/confirmacion`, { resuelto });
  }

  private url(id: string): string {
    return `${this.base}/${encodeURIComponent(id)}`;
  }
}

function parametros(filtros: Filtros): HttpParams {
  let params = new HttpParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (Array.isArray(valor)) {
      for (const v of valor) params = params.append(clave, v);
    } else if (typeof valor === 'string' && valor.trim()) {
      params = params.set(clave, valor.trim());
    }
  }
  return params;
}

function contexto(opciones: OpcionesLectura) {
  return opciones.silencioso ? { context: silencioso() } : {};
}
