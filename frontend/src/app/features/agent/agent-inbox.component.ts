import { DatePipe, PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subject, switchMap } from 'rxjs';

import { NotificationService } from '../../core/notification.service';
import { EstadoSync, PollingService } from '../../core/polling.service';
import { TicketService } from '../../core/ticket.service';
import {
  CategoryBadgeComponent,
  StatusBadgeComponent,
} from '../../shared/components/badges.component';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { SyncIndicatorComponent } from '../../shared/components/sync-indicator.component';
import { VerMasComponent } from '../../shared/components/ver-mas.component';
import { ETIQUETA_ESTADO, ETIQUETA_SISTEMA } from '../../shared/labels';
import { ESTADOS, Estado, PaginaTickets, Ticket } from '../../shared/models';
import { TicketActionsComponent } from './ticket-actions.component';
import { IconComponent } from '../../shared/components/icon.component';

/** Tickets por página en la bandeja; "Ver más" amplía de a este tamaño. */
export const TAMANO_PAGINA_BANDEJA = 20;

/** Bandeja del agente: solo tickets asignados, filtro por estado y polling (SDD 8.3). */
@Component({
  selector: 'app-agent-inbox',
  host: { class: 'pagina' },
  imports: [
    IconComponent,
    DatePipe,
    PercentPipe,
    RouterLink,
    CategoryBadgeComponent,
    StatusBadgeComponent,
    SyncIndicatorComponent,
    TicketActionsComponent,
    PageHeaderComponent,
    SkeletonComponent,
    VerMasComponent,
  ],
  template: `
    <section>
      <app-page-header
        titulo="Bandeja de tickets"
        descripcion="Casos asignados a ti. Toma un caso para atenderlo y márcalo resuelto al terminar."
        [migas]="[{ etiqueta: 'Bandeja' }]"
      >
        <app-sync-indicator [enLinea]="sync().enLinea" [ultima]="sync().ultimaActualizacion" />
      </app-page-header>
      <div class="filtros">
        <label for="filtro-estado">Estado</label>
        <select
          id="filtro-estado"
          [value]="filtro() ?? ''"
          (change)="filtrar($any($event.target).value)"
        >
          <option value="">Todos</option>
          @for (e of estados; track e) {
            <option [value]="e">{{ etiquetasEstado[e] }}</option>
          }
        </select>
      </div>

      @if (sync().datos === null) {
        <app-skeleton [cantidad]="3" />
      }
      @for (t of sync().datos?.items ?? []; track t.id) {
        <article class="tarjeta ticket" [attr.data-id]="t.id">
          <header class="ticket-cabecera">
            <a class="ticket-id" [routerLink]="['tickets', t.id]">{{ t.id }}</a>
            <span class="origen">{{ sistemas[t.sistema_origen] }}</span>
            <app-category-badge [categoria]="t.categoria" />
            <app-status-badge [estado]="t.estado" />
          </header>
          <h3>{{ t.asunto }}</h3>
          <p class="motivo">
            {{ t.motivo }} <span class="confianza">({{ t.confianza | percent }})</span>
          </p>
          <p class="meta">
            {{ t.solicitante?.nombre }} · {{ t.fecha_creacion | date: 'dd/MM/yyyy HH:mm' }}
          </p>
          <app-ticket-actions
            [estado]="t.estado"
            [deshabilitado]="procesando() === t.id"
            (cambiar)="cambiar(t, $event)"
          />
        </article>
      } @empty {
        @if (sync().datos) {
          <div class="tarjeta vacio-ilustrado">
            <app-icon class="vacio-icono" nombre="bandeja" [tamano]="40" />
            <p class="vacio">No tienes tickets asignados{{ filtro() ? ' con ese estado' : '' }}.</p>
          </div>
        }
      }
      @if (sync().datos; as p) {
        <app-ver-mas [mostrados]="p.items.length" [total]="p.total" (cargar)="verMas()" />
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentInboxComponent {
  private readonly tickets = inject(TicketService);
  private readonly avisos = inject(NotificationService);
  private readonly polling = inject(PollingService);
  private readonly refrescar$ = new Subject<void>();

  protected readonly estados = ESTADOS.filter((e) => e !== 'PENDIENTE_CONFIRMACION');
  protected readonly etiquetasEstado = ETIQUETA_ESTADO;
  protected readonly sistemas = ETIQUETA_SISTEMA;
  protected readonly filtro = signal<Estado | null>(null);
  protected readonly procesando = signal<string | null>(null);
  protected readonly limite = signal(TAMANO_PAGINA_BANDEJA);
  protected readonly sync = signal<EstadoSync<PaginaTickets>>({
    datos: null,
    enLinea: true,
    ultimaActualizacion: null,
  });

  constructor() {
    const consulta = computed(() => ({ estado: this.filtro(), limite: this.limite() }));
    toObservable(consulta)
      .pipe(
        switchMap(({ estado, limite }) =>
          this.polling.consultar(
            () => this.tickets.listarPagina({ estado }, { limite }, { silencioso: true }),
            { refrescar$: this.refrescar$ },
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((estado) => this.sync.set(estado));
  }

  filtrar(valor: string): void {
    this.filtro.set((valor || null) as Estado | null);
    this.limite.set(TAMANO_PAGINA_BANDEJA);
  }

  verMas(): void {
    this.limite.update((n) => n + TAMANO_PAGINA_BANDEJA);
  }

  cambiar(ticket: Ticket, destino: Estado): void {
    this.procesando.set(ticket.id);
    this.tickets.cambiarEstado(ticket.id, destino).subscribe({
      next: (t) => {
        this.procesando.set(null);
        this.sync.update((s) =>
          s.datos
            ? {
                ...s,
                datos: { ...s.datos, items: s.datos.items.map((x) => (x.id === t.id ? t : x)) },
              }
            : s,
        );
        this.avisos.exito(`${t.id}: ${ETIQUETA_ESTADO[t.estado]}.`);
        this.refrescar$.next();
      },
      error: () => {
        this.procesando.set(null);
        this.refrescar$.next();
      },
    });
  }
}
