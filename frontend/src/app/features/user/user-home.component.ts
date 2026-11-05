import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, map } from 'rxjs';

import { AuthService } from '../../core/auth.service';
import { borradorConContenido, leerBorrador } from '../../core/borrador';
import { FaqService } from '../../core/faq.service';
import { EstadoSync, PollingService } from '../../core/polling.service';
import { TicketService } from '../../core/ticket.service';
import { StatusBadgeComponent } from '../../shared/components/badges.component';
import { IconComponent } from '../../shared/components/icon.component';
import { FaqListComponent } from '../../shared/components/faq-list.component';
import { TicketProgressComponent } from '../../shared/components/ticket-progress.component';
import { ConsultaFrecuente, SistemaOrigen, Ticket } from '../../shared/models';
import { RESUMEN_VACIO, Resumen, agrupar } from '../../shared/resumen';
import { tipoDe } from '../../shared/tipos-solicitud';

/** Cuántas respuestas rápidas se muestran en el inicio (lista corta a propósito). */
const MAX_RAPIDAS = 5;

interface Actividad {
  resumen: Resumen;
  destacado: Ticket | null;
}

/** Inicio del solicitante: bienvenida, acción principal, respuestas rápidas y actividad. */
@Component({
  selector: 'app-user-home',
  host: { class: 'pagina' },
  imports: [
    IconComponent,
    RouterLink,
    StatusBadgeComponent,
    FaqListComponent,
    TicketProgressComponent,
  ],
  template: `
    <section class="hero" aria-labelledby="hero-titulo">
      <p class="hero-saludo">Hola, {{ nombre() }}</p>
      <h1 id="hero-titulo">¿En qué te ayudamos hoy?</h1>
      <p class="hero-texto">Registra una solicitud y sigue su avance hasta que quede resuelta.</p>

      @if (borrador(); as b) {
        <div class="hero-borrador" role="status">
          <app-icon nombre="info" />
          <span
            >Tienes una solicitud sin terminar{{
              b.sistema ? ' sobre ' + tipoTitulo(b.sistema) : ''
            }}.</span
          >
          <a routerLink="/usuario/nueva" class="btn btn-chip">Continuar donde la dejaste</a>
        </div>
      }

      <div class="hero-acciones">
        <a class="btn btn-primario btn-grande" routerLink="/usuario/nueva" data-accion="crear">
          <app-icon nombre="mas" /> Crear nueva solicitud
        </a>
        <a class="btn btn-claro btn-grande" routerLink="/usuario/solicitudes">
          Ver mis solicitudes
        </a>
      </div>
    </section>

    <div class="inicio-secciones">
      <section class="tarjeta" id="respuestas-rapidas" aria-labelledby="rapidas-titulo">
        <h2 id="rapidas-titulo">Respuestas rápidas</h2>
        <p class="seccion-desc">
          Las dudas más comunes. Revísalas antes de crear una solicitud: quizá ya tienen respuesta.
        </p>
        <app-faq-list
          [consultas]="rapidas()"
          [cargando]="faqs() === null"
          (crear)="crearDesde($event)"
        />
      </section>

      <section class="tarjeta" aria-labelledby="actividad-titulo">
        <div class="seccion-cabecera">
          <h2 id="actividad-titulo">Tus solicitudes</h2>
          @if (resumen().total) {
            <a routerLink="/usuario/solicitudes" class="enlace-fuerte">Ver todas →</a>
          }
        </div>
        @if (sync().datos) {
          @if (resumen().total) {
            <div class="mini-resumen" aria-label="Resumen de tus solicitudes">
              <span
                ><strong>{{ resumen().total }}</strong> en total</span
              >
              <span class="c-pendiente"
                ><strong>{{ resumen().pendientes }}</strong> pendientes</span
              >
              <span class="c-proceso"
                ><strong>{{ resumen().proceso }}</strong> en proceso</span
              >
              <span class="c-ok"
                ><strong>{{ resumen().completadas }}</strong> completadas</span
              >
            </div>
            @if (destacado(); as t) {
              <a class="destacado" [routerLink]="['/usuario/tickets', t.id]" [attr.data-id]="t.id">
                <span class="destacado-etiqueta">
                  {{
                    t.estado === 'PENDIENTE_CONFIRMACION'
                      ? 'Requiere tu respuesta'
                      : 'Tu solicitud más reciente'
                  }}
                </span>
                <span class="destacado-cabecera">
                  <strong>{{ t.id }}</strong> <app-status-badge [estado]="t.estado" />
                </span>
                <span class="destacado-asunto">{{ t.asunto }}</span>
                <app-ticket-progress [ticket]="t" [compacto]="true" />
              </a>
            }
          } @else {
            <div class="vacio-ilustrado">
              <app-icon class="vacio-icono" nombre="solicitudes" [tamano]="40" />
              <p><strong>Aún no tienes solicitudes</strong></p>
              <p class="vacio">
                Cuando crees una, aquí verás en qué etapa va sin tener que buscarla.
              </p>
            </div>
          }
        } @else {
          <div class="sk-bloque" aria-label="Cargando" role="status">
            <span class="sk sk-linea"></span>
            <span class="sk sk-barra"></span>
            <span class="sk sk-linea sk-corta"></span>
          </div>
        }
      </section>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserHomeComponent {
  private readonly tickets = inject(TicketService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  protected readonly faqs = toSignal(inject(FaqService).listar(), { initialValue: null });
  protected readonly rapidas = computed(() => (this.faqs() ?? []).slice(0, MAX_RAPIDAS));
  protected readonly nombre = computed(() => this.auth.sesion()?.nombre.split(' ')[0] ?? '');
  protected readonly borrador = signal(borradorPendiente());

  protected readonly sync = signal<EstadoSync<Actividad>>({
    datos: null,
    enLinea: true,
    ultimaActualizacion: null,
  });
  protected readonly resumen = computed(() => this.sync().datos?.resumen ?? RESUMEN_VACIO);
  protected readonly destacado = computed(() => this.sync().datos?.destacado ?? null);

  constructor() {
    // Solo contadores (calculados en el backend) y una solicitud: nunca la lista completa.
    const silencioso = { silencioso: true };
    inject(PollingService)
      .consultar(() =>
        forkJoin({
          resumen: this.tickets.resumen(silencioso).pipe(map(agrupar)),
          pendiente: this.tickets.listarPagina(
            { estado: ['PENDIENTE_CONFIRMACION'] },
            { limite: 1 },
            silencioso,
          ),
          reciente: this.tickets.listarPagina({}, { limite: 1 }, silencioso),
        }).pipe(
          map((r): Actividad => ({
            resumen: r.resumen,
            // Primero lo que espera una respuesta del usuario; si no, la más reciente.
            destacado: r.pendiente.items[0] ?? r.reciente.items[0] ?? null,
          })),
        ),
      )
      .pipe(takeUntilDestroyed())
      .subscribe((estado) => this.sync.set(estado));
  }

  protected tipoTitulo(sistema: SistemaOrigen): string {
    return tipoDe(sistema)?.titulo.toLowerCase() ?? '';
  }

  crearDesde(c: ConsultaFrecuente): void {
    void this.router.navigate(['/usuario/nueva'], { queryParams: { consulta: c.pregunta } });
  }
}

function borradorPendiente() {
  const b = leerBorrador();
  return borradorConContenido(b) ? b : null;
}
