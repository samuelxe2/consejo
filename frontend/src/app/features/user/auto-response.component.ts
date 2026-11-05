import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Respuesta sugerida de un ticket AUTO con confirmación o rechazo (RF-06). */
@Component({
  selector: 'app-auto-response',
  template: `
    <div class="respuesta-auto">
      <p class="respuesta-titulo">Respuesta sugerida</p>
      <p class="respuesta-texto">{{ respuesta() }}</p>
      <div class="acciones">
        <button
          type="button"
          class="btn btn-exito"
          data-accion="resuelto"
          [disabled]="deshabilitado()"
          (click)="decision.emit(true)"
        >
          Resolvió mi caso
        </button>
        <button
          type="button"
          class="btn btn-secundario"
          data-accion="no-resuelto"
          [disabled]="deshabilitado()"
          (click)="decision.emit(false)"
        >
          No resolvió
        </button>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AutoResponseComponent {
  readonly respuesta = input.required<string>();
  readonly deshabilitado = input(false);
  readonly decision = output<boolean>();
}
