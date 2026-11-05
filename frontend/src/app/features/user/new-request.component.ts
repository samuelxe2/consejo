import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormRecord, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';

import { AuthService } from '../../core/auth.service';
import { Borrador, borrarBorrador, guardarBorrador, leerBorrador } from '../../core/borrador';
import { FaqService } from '../../core/faq.service';
import { NotificationService } from '../../core/notification.service';
import { TicketService } from '../../core/ticket.service';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { TicketProgressComponent } from '../../shared/components/ticket-progress.component';
import { ETIQUETA_CATEGORIA, mensajeConfirmacion } from '../../shared/labels';
import { ApiError, CrearTicketDto, SistemaOrigen, Ticket, esApiError } from '../../shared/models';
import {
  CampoSolicitud,
  TIPOS_SOLICITUD,
  TipoSolicitud,
  tipoDe,
} from '../../shared/tipos-solicitud';
import { AutoResponseComponent } from './auto-response.component';
import { IconComponent } from '../../shared/components/icon.component';

type Paso = 1 | 2 | 3 | 4;

/** Pausa tras la última tecla antes de pedir una sugerencia al backend. */
export const DEMORA_SUGERENCIA_MS = 400;

const PASOS: { n: Paso; titulo: string; ayuda: string }[] = [
  { n: 1, titulo: 'Tipo', ayuda: 'Elige el tema de tu solicitud.' },
  { n: 2, titulo: 'Detalles', ayuda: 'Completa solo lo necesario para entender tu caso.' },
  { n: 3, titulo: 'Revisión', ayuda: 'Verifica que todo esté bien antes de enviar.' },
  { n: 4, titulo: 'Confirmación', ayuda: 'Tu solicitud quedó registrada.' },
];

/**
 * Registro guiado en 4 pasos (tipo → detalles → revisión → confirmación).
 * Los campos dependen del tipo y se envían con el payload del adaptador del sistema;
 * el progreso se guarda para poder salir y volver sin perderlo.
 */
@Component({
  selector: 'app-new-request',
  host: { class: 'pagina' },
  imports: [
    IconComponent,
    ReactiveFormsModule,
    RouterLink,
    PageHeaderComponent,
    TicketProgressComponent,
    AutoResponseComponent,
  ],
  template: `
    <app-page-header
      titulo="Nueva solicitud"
      [descripcion]="pasos[paso() - 1].ayuda"
      [migas]="[{ etiqueta: 'Inicio', ruta: '/usuario' }, { etiqueta: 'Nueva solicitud' }]"
    />

    <div class="asistente tarjeta">
      <ol class="asistente-pasos" aria-label="Progreso del registro">
        @for (p of pasos; track p.n) {
          <li
            [class.hecho]="p.n < paso()"
            [class.actual]="p.n === paso()"
            [attr.aria-current]="p.n === paso() ? 'step' : null"
          >
            <span class="asistente-num">{{ p.n < paso() ? '✓' : p.n }}</span>
            <span class="asistente-titulo">{{ p.titulo }}</span>
          </li>
        }
      </ol>
      <div
        class="asistente-barra"
        role="progressbar"
        aria-label="Avance"
        aria-valuemin="1"
        aria-valuemax="4"
        [attr.aria-valuenow]="paso()"
      >
        <span [style.width.%]="((paso() - 1) / 3) * 100"></span>
      </div>

      @switch (paso()) {
        @case (1) {
          <div class="paso-contenido" data-paso="1">
            <h2 tabindex="-1">¿Sobre qué es tu solicitud?</h2>
            <div class="tipos">
              @for (t of tipos; track t.sistema) {
                <button
                  type="button"
                  class="tipo-tarjeta"
                  [class.seleccionado]="sistema() === t.sistema"
                  [attr.aria-pressed]="sistema() === t.sistema"
                  [attr.data-tipo]="t.sistema"
                  (click)="elegir(t.sistema)"
                >
                  <app-icon class="tipo-icono" [nombre]="t.icono" [tamano]="28" />
                  <span class="tipo-titulo">{{ t.titulo }}</span>
                  <span class="tipo-plataforma">{{ t.plataforma }}</span>
                  <span class="tipo-desc">{{ t.descripcion }}</span>
                </button>
              }
            </div>
            <p class="ayuda-contextual">
              <app-icon nombre="info" /> ¿No sabes cuál elegir? Escoge el que más se parezca: el
              sistema clasifica tu caso y lo envía al equipo correcto.
            </p>
          </div>
        }
        @case (2) {
          @if (tipo(); as t) {
            <form
              class="paso-contenido formulario"
              data-paso="2"
              [formGroup]="form"
              (ngSubmit)="revisar()"
              novalidate
            >
              <h2 tabindex="-1">
                <app-icon class="titulo-icono" [nombre]="t.icono" [tamano]="22" /> {{ t.titulo }}
                <span class="tipo-plataforma">{{ t.plataforma }}</span>
              </h2>

              @for (c of t.campos; track c.clave) {
                <div class="campo" [class.campo-ok]="valido(c.clave)">
                  <label [for]="'campo-' + c.clave">{{ c.etiqueta }}</label>
                  @if (c.multilinea) {
                    <textarea
                      [id]="'campo-' + c.clave"
                      rows="5"
                      [formControlName]="c.clave"
                      [placeholder]="c.placeholder"
                      [attr.aria-invalid]="!!errorDe(c)"
                      [attr.aria-describedby]="'ayuda-' + c.clave"
                    ></textarea>
                    <div class="contador">{{ largo(c.clave) }} / {{ c.max }}</div>
                  } @else {
                    <input
                      [id]="'campo-' + c.clave"
                      type="text"
                      [formControlName]="c.clave"
                      [placeholder]="c.placeholder"
                      [attr.maxlength]="c.max + 20"
                      [attr.aria-invalid]="!!errorDe(c)"
                      [attr.aria-describedby]="'ayuda-' + c.clave"
                    />
                  }
                  @if (errorDe(c); as msg) {
                    <p class="error-campo" [attr.data-campo]="c.clave">{{ msg }}</p>
                  } @else {
                    <p class="ayuda-campo" [id]="'ayuda-' + c.clave">{{ c.ayuda }}</p>
                  }
                </div>
              }

              @if (sugerencia(); as s) {
                <aside class="sugerencia" data-sugerencia aria-live="polite">
                  <p class="sugerencia-titulo">Puede que esto resuelva tu duda ahora mismo</p>
                  <p class="sugerencia-pregunta">{{ capital(s.pregunta) }}</p>
                  <p>{{ s.respuesta }}</p>
                  <div class="acciones">
                    <button type="button" class="btn btn-exito" (click)="resueltoSinTicket()">
                      Esto resolvió mi duda
                    </button>
                    <button type="button" class="btn btn-secundario" (click)="descartar(s.id)">
                      No, seguir con la solicitud
                    </button>
                  </div>
                </aside>
              }

              <div class="asistente-acciones">
                <button type="button" class="btn btn-secundario" (click)="ir(1)">
                  ← Cambiar tipo
                </button>
                <button type="submit" class="btn btn-primario">Revisar →</button>
              </div>
            </form>
          }
        }
        @case (3) {
          @if (tipo(); as t) {
            <div class="paso-contenido" data-paso="3">
              <h2 tabindex="-1">Revisa tu solicitud</h2>
              <dl class="revision">
                <dt>Tipo</dt>
                <dd>{{ t.titulo }} · {{ t.plataforma }}</dd>
                @for (c of t.campos; track c.clave) {
                  @if (valor(c.clave)) {
                    <dt>{{ c.etiqueta }}</dt>
                    <dd class="descripcion-revision">{{ valor(c.clave) }}</dd>
                  }
                }
              </dl>
              <p class="ayuda-contextual">
                <app-icon nombre="info" /> Al enviar, la clasificamos al instante: si tenemos una
                respuesta te la mostramos; si no, la asignamos al equipo de soporte indicado.
              </p>
              @if (errorGeneral(); as err) {
                <p class="error-campo" role="alert">{{ err }}</p>
              }
              <div class="asistente-acciones">
                <button type="button" class="btn btn-secundario" (click)="ir(2)">← Editar</button>
                <button
                  type="button"
                  class="btn btn-primario"
                  data-accion="enviar"
                  [disabled]="enviando()"
                  (click)="enviar()"
                >
                  {{ enviando() ? 'Enviando…' : 'Confirmar y enviar' }}
                </button>
              </div>
            </div>
          }
        }
        @case (4) {
          @if (creado(); as tk) {
            <div class="paso-contenido resultado" data-paso="4">
              <div class="resultado-check"><app-icon nombre="check" [tamano]="34" /></div>
              <h2 tabindex="-1">Solicitud {{ tk.id }} registrada</h2>
              @if (tk.estado === 'PENDIENTE_CONFIRMACION' && tk.respuesta_sugerida) {
                <p class="resultado-texto">
                  ¡Tenemos una respuesta para ti! Léela y cuéntanos si resolvió tu caso.
                </p>
                <app-auto-response
                  [respuesta]="tk.respuesta_sugerida"
                  [deshabilitado]="procesando()"
                  (decision)="confirmar(tk, $event)"
                />
              } @else if (tk.estado === 'RESUELTO') {
                <p class="resultado-texto">Tu caso quedó resuelto. ¡Gracias por confirmarlo!</p>
              } @else {
                <p class="resultado-texto">
                  La enviamos a <strong>{{ equipo(tk) }}</strong
                  >{{ tk.responsable ? ': ' + tk.responsable.nombre + ' la revisará.' : '.' }}
                  Te avisaremos aquí mismo cada vez que avance.
                </p>
              }
              <app-ticket-progress [ticket]="tk" [compacto]="true" />
              <div class="asistente-acciones resultado-acciones">
                <a class="btn btn-primario" [routerLink]="['/usuario/tickets', tk.id]"
                  >Ver seguimiento</a
                >
                <a class="btn btn-secundario" routerLink="/usuario/solicitudes"
                  >Ir a mis solicitudes</a
                >
                <button type="button" class="btn btn-enlace" (click)="otra()">
                  Crear otra solicitud
                </button>
              </div>
            </div>
          }
        }
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewRequestComponent {
  /** Query params opcionales: tipo preseleccionado y consulta rápida que no resolvió. */
  readonly tipoInicial = input<string | undefined>(undefined, { alias: 'tipo' });
  readonly consultaInicial = input<string | undefined>(undefined, { alias: 'consulta' });

  private readonly auth = inject(AuthService);
  private readonly tickets = inject(TicketService);
  private readonly avisos = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly pasos = PASOS;
  protected readonly tipos = TIPOS_SOLICITUD;
  protected readonly paso = signal<Paso>(1);
  protected readonly sistema = signal<SistemaOrigen | null>(null);
  protected readonly tipo = computed(() => tipoDe(this.sistema()));
  protected readonly enviando = signal(false);
  protected readonly procesando = signal(false);
  protected readonly creado = signal<Ticket | null>(null);
  protected readonly errorGeneral = signal<string | null>(null);
  protected readonly intentado = signal(false);
  /** Errores 400 del backend por campo; se borran cuando el usuario edita ese campo. */
  private readonly erroresServidor = signal<Record<string, string>>({});

  /** Un único grupo con todos los campos posibles; se validan solo los del tipo elegido. */
  readonly form = new FormRecord<FormControl<string>>({});

  private readonly valores = toSignal(
    this.form.valueChanges.pipe(
      startWith(null),
      map(() => this.form.getRawValue()),
    ),
    { initialValue: {} as Record<string, string> },
  );

  private readonly faqs = inject(FaqService);
  private readonly descartadas = signal<number[]>([]);

  /** Lo que se consulta al backend: el campo equivalente al asunto y la descripción. */
  private readonly textoEscrito = computed(() => {
    const t = this.tipo();
    const v = this.valores();
    if (!t || this.paso() !== 2) return null;
    return { asunto: v[t.campoAsunto] ?? '', descripcion: v['descripcion'] ?? '' };
  });

  /**
   * Respuesta rápida para lo escrito. La regla vive solo en el backend (la misma que
   * clasifica al crear el ticket); se consulta tras una pausa al escribir y solo cuenta
   * la última petición.
   */
  private readonly sugerida = toSignal(
    toObservable(this.textoEscrito).pipe(
      debounceTime(DEMORA_SUGERENCIA_MS),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      switchMap((t) =>
        t && `${t.asunto} ${t.descripcion}`.trim().length >= 3
          ? this.faqs.sugerir(t.asunto, t.descripcion)
          : of(null),
      ),
    ),
    { initialValue: null },
  );

  protected readonly sugerencia = computed(() => {
    const s = this.sugerida();
    return s && this.paso() === 2 && !this.descartadas().includes(s.id) ? s : null;
  });

  constructor() {
    for (const t of TIPOS_SOLICITUD) {
      for (const c of t.campos) {
        if (!this.form.contains(c.clave)) {
          const control = new FormControl('', { nonNullable: true });
          this.form.addControl(c.clave, control);
          control.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
            if (this.erroresServidor()[c.clave]) {
              this.erroresServidor.update(({ [c.clave]: _, ...resto }) => resto);
            }
          });
        }
      }
    }

    const b = leerBorrador();
    if (b) {
      this.form.patchValue(b.valores);
      this.sistema.set(b.sistema);
      this.aplicarValidadores();
      this.paso.set(b.sistema ? b.paso : 1);
    }

    // Accesos directos desde el inicio; no pisan lo que el usuario ya escribió.
    effect(() => {
      const tipo = this.tipoInicial() as SistemaOrigen | undefined;
      const consulta = this.consultaInicial();
      if (consulta) {
        const c = this.form.controls;
        if (!c['consulta'].value.trim()) c['consulta'].setValue(consulta);
        if (!c['descripcion'].value.trim()) {
          c['descripcion'].setValue(
            `Revisé la respuesta rápida sobre «${consulta}» y no resolvió mi duda: `,
          );
        }
      }
      if (tipo && tipoDe(tipo)) this.elegir(tipo);
    });

    // Guarda el progreso de los pasos 1 a 3.
    effect(() => {
      const paso = this.paso();
      const borrador: Borrador = {
        paso: paso === 4 ? 1 : paso,
        sistema: this.sistema(),
        valores: this.valores(),
      };
      if (paso === 4) borrarBorrador();
      else guardarBorrador(borrador);
    });

    // El error general del envío se oculta en cuanto el usuario cambia algo.
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.errorGeneral.set(null));
  }

  elegir(sistema: SistemaOrigen): void {
    this.sistema.set(sistema);
    this.intentado.set(false);
    this.aplicarValidadores();
    this.ir(2);
  }

  ir(paso: Paso): void {
    this.paso.set(paso);
    // Lleva el foco al título del paso para lectores de pantalla y teclado.
    setTimeout(() =>
      this.host.nativeElement.querySelector<HTMLElement>('.paso-contenido h2')?.focus(),
    );
  }

  revisar(): void {
    this.intentado.set(true);
    const t = this.tipo();
    if (!t) return;
    const invalidos = t.campos.filter((c) => this.form.controls[c.clave].invalid);
    if (invalidos.length) {
      for (const c of invalidos) this.form.controls[c.clave].markAsTouched();
      setTimeout(() =>
        this.host.nativeElement.querySelector<HTMLElement>(`#campo-${invalidos[0].clave}`)?.focus(),
      );
      return;
    }
    this.ir(3);
  }

  enviar(): void {
    const t = this.tipo();
    if (!t) return;
    this.enviando.set(true);
    this.errorGeneral.set(null);
    this.tickets.crear(this.dto(t)).subscribe({
      next: (ticket) => {
        this.enviando.set(false);
        this.creado.set(ticket);
        this.avisos.exito(`Solicitud ${ticket.id} registrada.`);
        this.ir(4);
      },
      error: (err: unknown) => {
        this.enviando.set(false);
        if (!(err instanceof HttpErrorResponse) || !esApiError(err.error)) return;
        this.ubicarError(t, err.error);
      },
    });
  }

  confirmar(ticket: Ticket, resuelto: boolean): void {
    this.procesando.set(true);
    this.tickets.confirmar(ticket.id, resuelto).subscribe({
      next: (t) => {
        this.procesando.set(false);
        this.creado.set(t);
        this.avisos.exito(mensajeConfirmacion(resuelto));
      },
      error: () => this.procesando.set(false),
    });
  }

  /** La respuesta rápida bastó: no se crea ticket. */
  resueltoSinTicket(): void {
    borrarBorrador();
    this.avisos.exito('¡Qué bien! Tu duda quedó resuelta sin crear una solicitud.');
    void this.router.navigateByUrl('/usuario');
  }

  descartar(id: number): void {
    this.descartadas.update((ids) => [...ids, id]);
  }

  otra(): void {
    this.form.reset();
    this.creado.set(null);
    this.sistema.set(null);
    this.descartadas.set([]);
    this.intentado.set(false);
    this.ir(1);
  }

  protected valor(clave: string): string {
    return (this.valores()[clave] ?? '').trim();
  }

  protected largo(clave: string): number {
    return (this.valores()[clave] ?? '').length;
  }

  protected valido(clave: string): boolean {
    const c = this.form.controls[clave];
    this.valores(); // re-evalúa al escribir
    return c.valid && c.dirty && !!c.value.trim();
  }

  protected capital(texto: string): string {
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  protected equipo(t: Ticket): string {
    return ETIQUETA_CATEGORIA[t.categoria].toLowerCase();
  }

  protected errorDe(c: CampoSolicitud): string | null {
    this.valores(); // re-evalúa al escribir
    const control = this.form.controls[c.clave];
    const delServidor = this.erroresServidor()[c.clave];
    if (delServidor) return delServidor;
    if (!control.invalid || !(control.dirty || control.touched || this.intentado())) return null;
    if (control.hasError('required')) return `Completa "${c.etiqueta}".`;
    if (control.hasError('minimo')) return `Escribe al menos ${c.min} caracteres.`;
    if (control.hasError('maxlength')) return `Máximo ${c.max} caracteres.`;
    return null;
  }

  private aplicarValidadores(): void {
    const t = this.tipo();
    for (const [clave, control] of Object.entries(this.form.controls)) {
      const campo = t?.campos.find((c) => c.clave === clave);
      control.setValidators(
        campo
          ? [
              ...(campo.requerido ? [Validators.required] : []),
              textoMin(campo.min),
              Validators.maxLength(campo.max),
            ]
          : null,
      );
      control.updateValueAndValidity({ emitEvent: false });
    }
  }

  /** Con correo en sesión se usa el adaptador del sistema; si no, asunto + descripción. */
  private dto(t: TipoSolicitud): CrearTicketDto {
    const v = Object.fromEntries(t.campos.map((c) => [c.clave, this.valor(c.clave)]));
    const email = this.auth.sesion()?.email;
    if (email) {
      const payload: Record<string, string> = { usuario: email };
      for (const [k, val] of Object.entries(v)) if (val) payload[k] = val;
      return { sistema_origen: t.sistema, payload };
    }
    const asunto =
      t.sistema === 'MAIA'
        ? v['consulta']
        : t.sistema === 'EVALUIA'
          ? v['error'] || `Consulta sobre evaluación ${v['evaluacion_id']}`
          : `${v['operacion']} en ${v['curso']}`;
    return { sistema_origen: t.sistema, asunto, descripcion: v['descripcion'] };
  }

  private ubicarError(t: TipoSolicitud, err: ApiError): void {
    const campo = err.campo === 'asunto' ? t.campoAsunto : err.campo;
    if (campo && t.campos.some((c) => c.clave === campo)) {
      this.erroresServidor.update((e) => ({ ...e, [campo]: err.detalle }));
      this.ir(2);
    } else {
      this.errorGeneral.set(err.detalle);
    }
  }
}

/** Como minLength, pero ignora espacios al inicio y al final (igual que el backend). */
function textoMin(min: number) {
  return (control: { value: string }) =>
    control.value && control.value.trim().length < min ? { minimo: true } : null;
}
