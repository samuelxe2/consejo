import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subject, debounceTime, forkJoin, map, switchMap } from 'rxjs';

import { NotificationService } from '../../core/notification.service';
import { EstadoSync, PollingService } from '../../core/polling.service';
import { TicketService } from '../../core/ticket.service';
import { IconComponent } from '../../shared/components/icon.component';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { SyncIndicatorComponent } from '../../shared/components/sync-indicator.component';
import { VerMasComponent } from '../../shared/components/ver-mas.component';
import { mensajeConfirmacion } from '../../shared/labels';
import { PaginaTickets, Ticket } from '../../shared/models';
import { GrupoEstado, RESUMEN_VACIO, Resumen, agrupar, estadosDe } from '../../shared/resumen';
import { Confirmacion, TicketListComponent } from './ticket-list.component';

/** Solicitudes por página; "Ver más" amplía de a este tamaño. */
export const TAMANO_PAGINA = 10;
/** Pausa tras la última tecla antes de buscar en el backend. */
export const DEMORA_BUSQUEDA_MS = 300;

const FILTROS: { grupo: GrupoEstado; etiqueta: string; ayuda: string }[] = [
  { grupo: 'todas', etiqueta: 'Total', ayuda: 'Todas tus solicitudes' },
  { grupo: 'pendientes', etiqueta: 'Pendientes', ayuda: 'Esperan tu confirmación o un agente' },
  { grupo: 'proceso', etiqueta: 'En proceso', ayuda: 'Un agente está trabajando en ellas' },
  { grupo: 'completadas', etiqueta: 'Completadas', ayuda: 'Ya quedaron resueltas' },
];

interface Vista {
  pagina: PaginaTickets;
  resumen: Resumen;
}

/**
 * Panel del solicitante. El backend filtra, busca, pagina y cuenta: el navegador
 * nunca descarga todas las solicitudes, solo la página visible y los contadores.
 */
@Component({
  selector: 'app-requests-panel',
  host: { class: 'pagina' },
  imports: [
    IconComponent,
    RouterLink,
    PageHeaderComponent,
    SkeletonComponent,
    SyncIndicatorComponent,
    TicketListComponent,
    VerMasComponent,
  ],
  template: `
    <app-page-header
      titulo="Mis solicitudes"
      descripcion="Consulta en qué etapa va cada solicitud. Toca un contador para filtrar."
      [migas]="[{ etiqueta: 'Inicio', ruta: '/usuario' }, { etiqueta: 'Mis solicitudes' }]"
    >
      <app-sync-indicator [enLinea]="sync().enLinea" [ultima]="sync().ultimaActualizacion" />
    </app-page-header>

    @if (resumen().porConfirmar > 0 && filtro() !== 'pendientes') {
      <div class="llamado" role="status">
        <span>
          <app-icon nombre="alerta" /> Tienes {{ resumen().porConfirmar }}
          {{ resumen().porConfirmar === 1 ? 'respuesta' : 'respuestas' }} por confirmar. Dinos si te
          sirvió para cerrar tu caso o pasarlo a una persona.
        </span>
        <button type="button" class="btn btn-chip" (click)="elegir('pendientes')">
          Revisar ahora
        </button>
      </div>
    }

    <div class="contadores" role="group" aria-label="Filtrar por estado">
      @for (f of filtros; track f.grupo) {
        <button
          type="button"
          class="contador-tarjeta"
          [class]="'c-' + f.grupo"
          [class.activo]="filtro() === f.grupo"
          [attr.aria-pressed]="filtro() === f.grupo"
          [attr.data-filtro]="f.grupo"
          [title]="f.ayuda"
          (click)="elegir(f.grupo)"
        >
          <span class="contador-num">{{ conteo(f.grupo) }}</span>
          <span class="contador-etiqueta">{{ f.etiqueta }}</span>
        </button>
      }
    </div>

    <div class="buscador">
      <app-icon nombre="buscar" />
      <input
        type="search"
        placeholder="Buscar por número o asunto"
        aria-label="Buscar por número o asunto"
        [value]="busqueda()"
        (input)="buscar($any($event.target).value)"
      />
    </div>

    @if (sync().datos; as v) {
      @if (v.pagina.items.length) {
        <app-ticket-list
          [tickets]="v.pagina.items"
          [procesando]="procesando()"
          (confirmar)="confirmar($event)"
        />
        <app-ver-mas
          [mostrados]="v.pagina.items.length"
          [total]="v.pagina.total"
          (cargar)="verMas()"
        />
      } @else if (v.resumen.total === 0) {
        <div class="tarjeta vacio-ilustrado">
          <app-icon class="vacio-icono" nombre="solicitudes" [tamano]="40" />
          <p><strong>Aún no tienes solicitudes</strong></p>
          <p class="vacio">Crea la primera y aquí verás cada etapa de su atención.</p>
          <a class="btn btn-primario" routerLink="/usuario/nueva">Crear nueva solicitud</a>
        </div>
      } @else {
        <div class="tarjeta vacio-ilustrado">
          <app-icon class="vacio-icono" nombre="buscar" [tamano]="40" />
          <p><strong>No hay solicitudes con este filtro</strong></p>
          <button type="button" class="btn btn-secundario" (click)="limpiar()">Ver todas</button>
        </div>
      }
    } @else {
      <app-skeleton [cantidad]="3" />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestsPanelComponent {
  private readonly tickets = inject(TicketService);
  private readonly avisos = inject(NotificationService);
  private readonly polling = inject(PollingService);
  private readonly refrescar$ = new Subject<void>();

  protected readonly filtros = FILTROS;
  protected readonly filtro = signal<GrupoEstado>('todas');
  protected readonly busqueda = signal('');
  protected readonly limite = signal(TAMANO_PAGINA);
  protected readonly procesando = signal<string | null>(null);
  protected readonly sync = signal<EstadoSync<Vista>>({
    datos: null,
    enLinea: true,
    ultimaActualizacion: null,
  });

  protected readonly resumen = computed(() => this.sync().datos?.resumen ?? RESUMEN_VACIO);

  private readonly textoBuscado = toSignal(
    toObservable(this.busqueda).pipe(debounceTime(DEMORA_BUSQUEDA_MS)),
    { initialValue: '' },
  );

  /** Lo que se pide al backend; al cambiar, se reinicia el polling con la nueva consulta. */
  private readonly consulta = computed(() => ({
    estado: estadosDe(this.filtro()),
    q: this.textoBuscado(),
    limite: this.limite(),
  }));

  constructor() {
    toObservable(this.consulta)
      .pipe(
        switchMap((c) =>
          this.polling.consultar(
            () =>
              forkJoin({
                pagina: this.tickets.listarPagina(
                  { estado: c.estado, q: c.q },
                  { limite: c.limite },
                  { silencioso: true },
                ),
                resumen: this.tickets.resumen({ silencioso: true }).pipe(map(agrupar)),
              }),
            { refrescar$: this.refrescar$ },
          ),
        ),
        takeUntilDestroyed(),
      )
      // Mientras llega la nueva consulta se mantiene la anterior (sin parpadeo).
      .subscribe((estado) =>
        this.sync.set(estado.datos ? estado : { ...estado, datos: this.sync().datos }),
      );
  }

  protected conteo(grupo: GrupoEstado): number {
    const r = this.resumen();
    return grupo === 'todas' ? r.total : r[grupo];
  }

  elegir(grupo: GrupoEstado): void {
    this.filtro.set(grupo);
    this.limite.set(TAMANO_PAGINA);
  }

  buscar(texto: string): void {
    this.busqueda.set(texto);
    this.limite.set(TAMANO_PAGINA);
  }

  verMas(): void {
    this.limite.update((n) => n + TAMANO_PAGINA);
  }

  limpiar(): void {
    this.filtro.set('todas');
    this.busqueda.set('');
    this.limite.set(TAMANO_PAGINA);
  }

  confirmar({ id, resuelto }: Confirmacion): void {
    this.procesando.set(id);
    this.tickets.confirmar(id, resuelto).subscribe({
      next: (t) => {
        this.procesando.set(null);
        this.reemplazar(t);
        this.avisos.exito(mensajeConfirmacion(resuelto));
        this.refrescar$.next();
      },
      error: () => this.procesando.set(null),
    });
  }

  /** Refleja de inmediato la respuesta del backend sin esperar al siguiente ciclo. */
  private reemplazar(ticket: Ticket): void {
    this.sync.update((s) =>
      s.datos
        ? {
            ...s,
            datos: {
              ...s.datos,
              pagina: {
                ...s.datos.pagina,
                items: s.datos.pagina.items.map((t) => (t.id === ticket.id ? ticket : t)),
              },
            },
          }
        : s,
    );
  }
}
