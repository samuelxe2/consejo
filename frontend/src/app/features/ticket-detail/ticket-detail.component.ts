import { DatePipe, PercentPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subject, catchError, forkJoin, switchMap, throwError } from 'rxjs';

import { AuthService } from '../../core/auth.service';
import { NotificationService } from '../../core/notification.service';
import { EstadoSync, PollingService } from '../../core/polling.service';
import { TicketService } from '../../core/ticket.service';
import {
  CategoryBadgeComponent,
  StatusBadgeComponent,
} from '../../shared/components/badges.component';
import { Miga, PageHeaderComponent } from '../../shared/components/page-header.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { SyncIndicatorComponent } from '../../shared/components/sync-indicator.component';
import { TicketHistoryComponent } from '../../shared/components/ticket-history.component';
import { TicketProgressComponent } from '../../shared/components/ticket-progress.component';
import { ETIQUETA_ESTADO, ETIQUETA_SISTEMA, mensajeConfirmacion } from '../../shared/labels';
import { Estado, Evento, Ticket, esAgente } from '../../shared/models';
import { TicketActionsComponent } from '../agent/ticket-actions.component';
import { AutoResponseComponent } from '../user/auto-response.component';
import { IconComponent } from '../../shared/components/icon.component';

interface Detalle {
  ticket: Ticket;
  eventos: Evento[];
}

/** Detalle, acciones e historial; lo usan /usuario/tickets/:id y /agente/tickets/:id. */
@Component({
  selector: 'app-ticket-detail',
  host: { class: 'pagina' },
  imports: [
    IconComponent,
    DatePipe,
    PercentPipe,
    RouterLink,
    CategoryBadgeComponent,
    StatusBadgeComponent,
    SyncIndicatorComponent,
    TicketHistoryComponent,
    TicketProgressComponent,
    TicketActionsComponent,
    AutoResponseComponent,
    PageHeaderComponent,
    SkeletonComponent,
  ],
  template: `
    <app-page-header
      [titulo]="'Seguimiento de ' + id()"
      [descripcion]="
        agente()
          ? 'Revisa el caso, cambia su estado y consulta su historial.'
          : 'Mira en qué etapa va tu solicitud y qué sigue.'
      "
      [migas]="migas()"
    >
      <a [routerLink]="volver()" class="btn btn-secundario">← Volver</a>
    </app-page-header>
    @if (noEncontrado()) {
      <div class="tarjeta vacio-ilustrado">
        <app-icon class="vacio-icono" nombre="buscar" [tamano]="40" />
        <p class="vacio">El ticket {{ id() }} no existe o no tienes acceso.</p>
        <a class="btn btn-secundario" [routerLink]="volver()">Volver</a>
      </div>
    } @else if (sync().datos; as d) {
      <div class="columnas columnas-detalle">
        <article class="tarjeta detalle">
          <header class="ticket-cabecera">
            <span class="ticket-id">{{ d.ticket.id }}</span>
            <span class="origen">{{ sistemas[d.ticket.sistema_origen] }}</span>
            <app-category-badge [categoria]="d.ticket.categoria" />
            <app-status-badge [estado]="d.ticket.estado" />
            <app-sync-indicator [enLinea]="sync().enLinea" [ultima]="sync().ultimaActualizacion" />
          </header>
          <h2>{{ d.ticket.asunto }}</h2>
          <p class="descripcion">{{ d.ticket.descripcion }}</p>
          @if (d.ticket.contexto) {
            <p class="meta">Contexto: {{ d.ticket.contexto }}</p>
          }
          <dl class="datos">
            <dt>Clasificación</dt>
            <dd>
              {{ d.ticket.motivo }} ({{ d.ticket.confianza | percent }} ·
              {{ d.ticket.metodo_clasificacion === 'LLM' ? 'IA' : 'reglas' }})
            </dd>
            <dt>Solicitante</dt>
            <dd>{{ d.ticket.solicitante?.nombre ?? '—' }}</dd>
            <dt>Responsable</dt>
            <dd>{{ d.ticket.responsable?.nombre ?? 'Sin asignar' }}</dd>
            <dt>Creado</dt>
            <dd>{{ d.ticket.fecha_creacion | date: 'dd/MM/yyyy HH:mm' }}</dd>
            <dt>Actualizado</dt>
            <dd>{{ d.ticket.fecha_actualizacion | date: 'dd/MM/yyyy HH:mm' }}</dd>
          </dl>
          @if (agente()) {
            <app-ticket-actions
              [estado]="d.ticket.estado"
              [deshabilitado]="procesando()"
              (cambiar)="cambiar($event)"
            />
          } @else if (d.ticket.estado === 'PENDIENTE_CONFIRMACION' && d.ticket.respuesta_sugerida) {
            <app-auto-response
              [respuesta]="d.ticket.respuesta_sugerida"
              [deshabilitado]="procesando()"
              (decision)="confirmar($event)"
            />
          }
        </article>
        <aside class="lateral">
          <section class="tarjeta">
            <h2>¿En qué va {{ agente() ? 'este caso' : 'mi solicitud' }}?</h2>
            <app-ticket-progress [ticket]="d.ticket" [eventos]="d.eventos" />
          </section>
          <details class="tarjeta registro">
            <summary>Registro de actividad ({{ d.eventos.length }})</summary>
            <app-ticket-history [eventos]="d.eventos" />
          </details>
        </aside>
      </div>
    } @else {
      <app-skeleton [cantidad]="1" />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketDetailComponent {
  /** Viene del parámetro de ruta :id (withComponentInputBinding). */
  readonly id = input.required<string>();

  private readonly auth = inject(AuthService);
  private readonly tickets = inject(TicketService);
  private readonly avisos = inject(NotificationService);
  private readonly polling = inject(PollingService);
  private readonly refrescar$ = new Subject<void>();

  protected readonly sistemas = ETIQUETA_SISTEMA;
  protected readonly agente = computed(() => {
    const rol = this.auth.rol();
    return rol !== null && esAgente(rol);
  });
  protected readonly volver = computed(() => (this.agente() ? '/agente' : '/usuario/solicitudes'));
  protected readonly migas = computed<Miga[]>(() =>
    this.agente()
      ? [{ etiqueta: 'Bandeja', ruta: '/agente' }, { etiqueta: this.id() }]
      : [
          { etiqueta: 'Inicio', ruta: '/usuario' },
          { etiqueta: 'Mis solicitudes', ruta: '/usuario/solicitudes' },
          { etiqueta: this.id() },
        ],
  );
  protected readonly procesando = signal(false);
  protected readonly noEncontrado = signal(false);
  protected readonly sync = signal<EstadoSync<Detalle>>({
    datos: null,
    enLinea: true,
    ultimaActualizacion: null,
  });

  constructor() {
    toObservable(this.id)
      .pipe(
        switchMap((id) => {
          this.noEncontrado.set(false);
          return this.polling.consultar(() => this.cargar(id), { refrescar$: this.refrescar$ });
        }),
        takeUntilDestroyed(),
      )
      .subscribe((estado) => this.sync.set(estado));
  }

  cambiar(destino: Estado): void {
    this.procesando.set(true);
    this.tickets.cambiarEstado(this.id(), destino).subscribe({
      next: (t) => this.actualizado(`${t.id}: ${ETIQUETA_ESTADO[t.estado]}.`),
      error: () => this.fallo(),
    });
  }

  confirmar(resuelto: boolean): void {
    this.procesando.set(true);
    this.tickets.confirmar(this.id(), resuelto).subscribe({
      next: () => this.actualizado(mensajeConfirmacion(resuelto)),
      error: () => this.fallo(),
    });
  }

  private cargar(id: string) {
    return forkJoin({
      ticket: this.tickets.obtener(id, { silencioso: true }),
      eventos: this.tickets.eventos(id, { silencioso: true }),
    }).pipe(
      catchError((err: unknown) => {
        if (err instanceof HttpErrorResponse && err.status === 404) this.noEncontrado.set(true);
        return throwError(() => err);
      }),
    );
  }

  private actualizado(mensaje: string): void {
    this.procesando.set(false);
    this.avisos.exito(mensaje);
    this.refrescar$.next();
  }

  private fallo(): void {
    this.procesando.set(false);
    this.refrescar$.next();
  }
}
