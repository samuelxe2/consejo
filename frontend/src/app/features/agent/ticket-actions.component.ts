import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { Estado } from '../../shared/models';

interface Accion {
  destino: Estado;
  etiqueta: string;
}

/**
 * Solo muestra la acción que el backend permitiría al agente asignado (SDD 6.3).
 * La decisión final sigue siendo del backend.
 */
export const ACCION_POR_ESTADO: Partial<Record<Estado, Accion>> = {
  ABIERTO: { destino: 'EN_ATENCION', etiqueta: 'Tomar caso' },
  EN_ATENCION: { destino: 'RESUELTO', etiqueta: 'Marcar resuelto' },
};

@Component({
  selector: 'app-ticket-actions',
  template: `
    @if (accion(); as a) {
      <button
        type="button"
        class="btn btn-primario"
        [attr.data-destino]="a.destino"
        [disabled]="deshabilitado()"
        (click)="cambiar.emit(a.destino)"
      >
        {{ a.etiqueta }}
      </button>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketActionsComponent {
  readonly estado = input.required<Estado>();
  readonly deshabilitado = input(false);
  readonly cambiar = output<Estado>();
  protected readonly accion = computed(() => ACCION_POR_ESTADO[this.estado()] ?? null);
}
