import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Botón "Ver más" de las listas paginadas; no se muestra si ya está todo cargado. */
@Component({
  selector: 'app-ver-mas',
  template: `
    @if (mostrados() < total()) {
      <div class="ver-mas">
        <button
          type="button"
          class="btn btn-secundario"
          data-accion="ver-mas"
          (click)="cargar.emit()"
        >
          Ver más ({{ total() - mostrados() }} restantes)
        </button>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerMasComponent {
  readonly mostrados = input.required<number>();
  readonly total = input.required<number>();
  readonly cargar = output<void>();
}
