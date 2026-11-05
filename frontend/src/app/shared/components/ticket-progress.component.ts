import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { Evento, Ticket } from '../models';
import { pasoActual, pasosDe } from '../progress';

/**
 * Línea de tiempo del estado de la solicitud.
 * `compacto`: barra horizontal para las tarjetas de la lista; si no, línea vertical con detalle.
 */
@Component({
  selector: 'app-ticket-progress',
  imports: [DatePipe],
  template: `
    @if (compacto()) {
      <div class="progreso-compacto">
        <ol class="pasos" [attr.aria-label]="'Progreso: ' + actual().titulo">
          @for (p of pasos(); track p.clave) {
            <li class="paso" [class]="'paso-' + p.estado" [attr.data-paso]="p.clave">
              <span class="paso-punto" aria-hidden="true"></span>
              <span class="paso-titulo">{{ p.titulo }}</span>
            </li>
          }
        </ol>
        <p class="progreso-siguiente">
          <strong>{{ actual().titulo }}:</strong> {{ actual().descripcion }}
        </p>
      </div>
    } @else {
      <ol class="linea-tiempo">
        @for (p of pasos(); track p.clave) {
          <li class="hito" [class]="'hito-' + p.estado" [attr.data-paso]="p.clave">
            <span class="hito-punto" aria-hidden="true"></span>
            <div class="hito-cuerpo">
              <div class="hito-cabecera">
                <strong>{{ p.titulo }}</strong>
                @if (p.estado === 'actual') {
                  <span class="hito-ahora">Ahora</span>
                }
                @if (p.fecha && p.estado !== 'pendiente') {
                  <time [attr.datetime]="p.fecha">{{ p.fecha | date: 'd MMM, HH:mm' }}</time>
                }
              </div>
              <p>{{ p.descripcion }}</p>
            </div>
          </li>
        }
      </ol>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketProgressComponent {
  readonly ticket = input.required<Ticket>();
  readonly eventos = input<Evento[]>([]);
  readonly compacto = input(false);

  protected readonly pasos = computed(() => pasosDe(this.ticket(), this.eventos()));
  protected readonly actual = computed(() => pasoActual(this.pasos()));
}
