import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { ETIQUETA_EVENTO } from '../labels';
import { Evento } from '../models';

/** Historial de eventos de un ticket (RF-10). */
@Component({
  selector: 'app-ticket-history',
  imports: [DatePipe],
  template: `
    @if (eventos().length) {
      <ol class="historial">
        @for (e of eventos(); track $index) {
          <li>
            <div class="historial-cabecera">
              <strong>{{ etiquetas[e.tipo] }}</strong>
              <time [attr.datetime]="e.fecha">{{ e.fecha | date: 'dd/MM/yyyy HH:mm' }}</time>
            </div>
            @if (e.detalle) {
              <p>{{ e.detalle }}</p>
            }
            <small>{{ e.actor ? e.actor.nombre : 'Sistema' }}</small>
          </li>
        }
      </ol>
    } @else {
      <p class="vacio">Sin eventos registrados.</p>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketHistoryComponent {
  readonly eventos = input.required<Evento[]>();
  protected readonly etiquetas = ETIQUETA_EVENTO;
}
