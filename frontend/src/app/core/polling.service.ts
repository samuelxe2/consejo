import { Injectable } from '@angular/core';
import { EMPTY, Observable, catchError, exhaustMap, map, merge, of, scan, timer } from 'rxjs';

import { environment } from '../../environments/environment';

export interface EstadoSync<T> {
  datos: T | null;
  enLinea: boolean;
  ultimaActualizacion: Date | null;
}

type Resultado<T> = { ok: true; datos: T } | { ok: false };

/**
 * Consulta periódica (SDD 8.1, RF-09): primera consulta inmediata y luego cada `ms`.
 * - `exhaustMap`: si una respuesta tarda más que el intervalo, no se lanza otra en paralelo.
 * - Ante un fallo se conservan los datos previos y se marca `enLinea = false`.
 * - Quien se suscribe la detiene con `takeUntilDestroyed`.
 */
@Injectable({ providedIn: 'root' })
export class PollingService {
  consultar<T>(
    fuente: () => Observable<T>,
    opciones: { ms?: number; refrescar$?: Observable<unknown> } = {},
  ): Observable<EstadoSync<T>> {
    const ms = opciones.ms ?? environment.pollMs;
    const disparos = merge(timer(0, ms), opciones.refrescar$ ?? EMPTY);
    const inicial: EstadoSync<T> = { datos: null, enLinea: true, ultimaActualizacion: null };

    return disparos.pipe(
      exhaustMap(() =>
        fuente().pipe(
          map((datos): Resultado<T> => ({ ok: true, datos })),
          catchError(() => of<Resultado<T>>({ ok: false })),
        ),
      ),
      scan(
        (previo: EstadoSync<T>, r: Resultado<T>): EstadoSync<T> =>
          r.ok
            ? { datos: r.datos, enLinea: true, ultimaActualizacion: new Date() }
            : { ...previo, enLinea: false },
        inicial,
      ),
    );
  }
}
