import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';

import { environment } from '../../environments/environment';
import { ConsultaFrecuente } from '../shared/models';
import { silencioso } from './http-context';

/** Consultas frecuentes del backend. */
@Injectable({ providedIn: 'root' })
export class FaqService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/consultas-frecuentes`;
  private cache$: Observable<ConsultaFrecuente[]> | null = null;

  /** Lista para las respuestas rápidas; se pide una vez por carga de la página. */
  listar(): Observable<ConsultaFrecuente[]> {
    this.cache$ ??= this.http.get<ConsultaFrecuente[]>(this.base, { context: silencioso() }).pipe(
      catchError(() => {
        // La ayuda es opcional: si falla, se reintenta en la próxima visita.
        this.cache$ = null;
        return of([]);
      }),
      shareReplay(1),
    );
    return this.cache$;
  }

  /**
   * Consulta frecuente que respondería lo escrito. La regla vive solo en el backend
   * (la misma que clasifica al crear el ticket); aquí no se duplica.
   */
  sugerir(asunto: string, descripcion: string): Observable<ConsultaFrecuente | null> {
    return this.http
      .post<{
        consulta: ConsultaFrecuente | null;
      }>(`${this.base}/sugerencia`, { asunto, descripcion }, { context: silencioso() })
      .pipe(
        map((r) => r.consulta),
        catchError(() => of(null)),
      );
  }
}
