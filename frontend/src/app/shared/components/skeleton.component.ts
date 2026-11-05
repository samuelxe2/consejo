import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Tarjetas de carga con brillo mientras llega la primera respuesta. */
@Component({
  selector: 'app-skeleton',
  template: `
    <div class="skeletons" role="status" aria-label="Cargando">
      @for (i of filas(); track i) {
        <div class="tarjeta skeleton-tarjeta" aria-hidden="true">
          <span class="sk sk-linea sk-corta"></span>
          <span class="sk sk-linea sk-titulo"></span>
          <span class="sk sk-barra"></span>
          <span class="sk sk-linea"></span>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SkeletonComponent {
  readonly cantidad = input(3);
  protected readonly filas = computed(() => Array.from({ length: this.cantidad() }, (_, i) => i));
}
