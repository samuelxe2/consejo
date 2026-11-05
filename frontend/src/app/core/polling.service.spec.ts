import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, defer, finalize, of, throwError, timer, map } from 'rxjs';

import { SyncIndicatorComponent } from '../shared/components/sync-indicator.component';
import { EstadoSync, PollingService } from './polling.service';

const MS = 7000;

/** Contenedor mínimo que se suscribe como lo hacen las vistas reales. */
@Component({
  imports: [SyncIndicatorComponent],
  template: `<app-sync-indicator
    [enLinea]="estado().enLinea"
    [ultima]="estado().ultimaActualizacion"
  />`,
})
class HostComponent {
  static fuente: () => Observable<number[]> = () => of([]);
  readonly estado = signal<EstadoSync<number[]>>({
    datos: null,
    enLinea: true,
    ultimaActualizacion: null,
  });

  constructor() {
    inject(PollingService)
      .consultar(() => HostComponent.fuente(), { ms: MS })
      .pipe(takeUntilDestroyed())
      .subscribe((e) => this.estado.set(e));
  }
}

describe('PollingService', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('FE-06: consulta en t=0 y cada 7 s; se detiene al destruir el componente', () => {
    let llamadas = 0;
    HostComponent.fuente = () => defer(() => of([++llamadas]));
    const fixture = TestBed.createComponent(HostComponent);
    vi.advanceTimersByTime(0); // timer(0): primera consulta sin esperar el intervalo
    expect(llamadas).toBe(1);
    vi.advanceTimersByTime(MS - 1);
    expect(llamadas).toBe(1);
    vi.advanceTimersByTime(1);
    expect(llamadas).toBe(2);
    vi.advanceTimersByTime(MS * 3);
    expect(llamadas).toBe(5);
    expect(fixture.componentInstance.estado().datos).toEqual([5]);

    fixture.destroy();
    vi.advanceTimersByTime(MS * 5);
    expect(llamadas).toBe(5);
  });

  it('FE-07: respuesta lenta (> 7 s) no lanza una segunda petición simultánea', () => {
    let llamadas = 0;
    let activas = 0;
    let maxActivas = 0;
    const lenta = () =>
      defer(() => {
        llamadas++;
        maxActivas = Math.max(maxActivas, ++activas);
        return timer(10_000).pipe(
          map(() => [llamadas]),
          finalize(() => activas--),
        );
      });
    const sub = TestBed.inject(PollingService).consultar(lenta, { ms: MS }).subscribe();

    vi.advanceTimersByTime(9_999); // el tick de t=7 s llega con la primera en curso
    expect(llamadas).toBe(1);
    vi.advanceTimersByTime(1); // t=10 s responde la primera
    expect(activas).toBe(0);
    vi.advanceTimersByTime(4_000); // t=14 s: siguiente tick
    expect(llamadas).toBe(2);
    expect(maxActivas).toBe(1);
    sub.unsubscribe();
  });

  it('FE-08: fallo de red conserva los datos previos y muestra "Sin conexión"', () => {
    const respuestas: (() => Observable<number[]>)[] = [
      () => of([1, 2]),
      () => throwError(() => new Error('red')),
      () => of([3]),
    ];
    let i = 0;
    HostComponent.fuente = () => defer(() => respuestas[Math.min(i++, respuestas.length - 1)]());
    const fixture = TestBed.createComponent(HostComponent);
    const estado = fixture.componentInstance.estado;
    vi.advanceTimersByTime(0);
    fixture.detectChanges();
    expect(estado().enLinea).toBe(true);
    const primera = estado().ultimaActualizacion;

    vi.advanceTimersByTime(MS);
    fixture.detectChanges();
    expect(estado().datos).toEqual([1, 2]);
    expect(estado().enLinea).toBe(false);
    expect(estado().ultimaActualizacion).toBe(primera);
    expect(fixture.nativeElement.textContent).toContain('Sin conexión');

    vi.advanceTimersByTime(MS); // se recupera sin intervención
    fixture.detectChanges();
    expect(estado()).toMatchObject({ datos: [3], enLinea: true });
    expect(fixture.nativeElement.textContent).not.toContain('Sin conexión');
    fixture.destroy();
  });

  it('refrescar$ fuerza una consulta inmediata', () => {
    let llamadas = 0;
    const refrescar$ = new Subject<void>();
    const sub = TestBed.inject(PollingService)
      .consultar(() => defer(() => of(++llamadas)), { ms: MS, refrescar$ })
      .subscribe();
    vi.advanceTimersByTime(0);
    refrescar$.next();
    expect(llamadas).toBe(2);
    sub.unsubscribe();
  });
});
