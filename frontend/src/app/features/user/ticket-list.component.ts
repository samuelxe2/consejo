import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  CategoryBadgeComponent,
  StatusBadgeComponent,
} from '../../shared/components/badges.component';
import { TicketProgressComponent } from '../../shared/components/ticket-progress.component';
import { ETIQUETA_SISTEMA, claseDe } from '../../shared/labels';
import { Ticket } from '../../shared/models';
import { AutoResponseComponent } from './auto-response.component';
import { IconComponent } from '../../shared/components/icon.component';

export interface Confirmacion {
  id: string;
  resuelto: boolean;
}

/** Tickets propios del solicitante (presentación). */
@Component({
  selector: 'app-ticket-list',
  imports: [
    IconComponent,
    DatePipe,
    RouterLink,
    CategoryBadgeComponent,
    StatusBadgeComponent,
    TicketProgressComponent,
    AutoResponseComponent,
  ],
  template: `
    @for (t of tickets(); track t.id) {
      <article class="tarjeta ticket" [class]="'borde-' + clase(t.categoria)" [attr.data-id]="t.id">
        <header class="ticket-cabecera">
          <a class="ticket-id" [routerLink]="['/usuario/tickets', t.id]">{{ t.id }}</a>
          <span class="origen">{{ sistemas[t.sistema_origen] }}</span>
          <app-category-badge [categoria]="t.categoria" />
          <app-status-badge [estado]="t.estado" />
          <span class="meta fecha">{{ t.fecha_creacion | date: 'd MMM, HH:mm' }}</span>
        </header>
        <h3>
          <a class="titulo-enlace" [routerLink]="['/usuario/tickets', t.id]">{{ t.asunto }}</a>
        </h3>
        <app-ticket-progress [ticket]="t" [compacto]="true" />
        @if (t.estado === 'PENDIENTE_CONFIRMACION' && t.respuesta_sugerida) {
          <app-auto-response
            [respuesta]="t.respuesta_sugerida"
            [deshabilitado]="procesando() === t.id"
            (decision)="confirmar.emit({ id: t.id, resuelto: $event })"
          />
        }
        <a class="ver-detalle" [routerLink]="['/usuario/tickets', t.id]"
          >Ver seguimiento completo →</a
        >
      </article>
    } @empty {
      <div class="tarjeta vacio-bloque">
        <app-icon class="vacio-icono" nombre="solicitudes" [tamano]="40" />
        <p><strong>Aún no tienes solicitudes.</strong></p>
        <p class="vacio">Cuando envíes una, aquí verás en qué etapa va.</p>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketListComponent {
  readonly tickets = input.required<Ticket[]>();
  readonly procesando = input<string | null>(null);
  readonly confirmar = output<Confirmacion>();
  protected readonly sistemas = ETIQUETA_SISTEMA;
  protected readonly clase = claseDe;
}
