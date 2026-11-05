import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

import { ConsultaFrecuente } from '../models';
import { IconComponent } from './icon.component';

/**
 * Respuestas rápidas: el usuario abre una consulta frecuente y lee la respuesta
 * sin crear un ticket. Si no le sirve, `crear` lo lleva al registro con la pregunta.
 * Acordeón nativo con <details>/<summary>: teclado y lector de pantalla sin código extra;
 * la animación de apertura y cierre está en styles.css.
 */
@Component({
  selector: 'app-faq-list',
  imports: [IconComponent],
  template: `
    @if (consultas().length) {
      <ul class="faq">
        @for (c of consultas(); track c.id) {
          <li>
            <!-- name agrupa los <details>: al abrir uno, el navegador cierra los demás. -->
            <details class="faq-item" name="respuestas-rapidas" [attr.data-faq]="c.id">
              <summary class="faq-pregunta">
                <app-icon class="faq-icono" nombre="pregunta" />
                <span>{{ capital(c.pregunta) }}</span>
                <app-icon class="faq-flecha" nombre="flecha" />
              </summary>
              <div class="faq-respuesta">
                <p>{{ c.respuesta }}</p>
                @if (util() === c.id) {
                  <p class="faq-gracias" role="status">
                    ✓ ¡Qué bien! No necesitas crear una solicitud.
                  </p>
                } @else {
                  <div class="faq-acciones">
                    <span>¿Te sirvió?</span>
                    <button type="button" class="btn btn-chip" (click)="util.set(c.id)">
                      Sí, gracias
                    </button>
                    <button type="button" class="btn btn-chip" (click)="crear.emit(c)">
                      No, crear solicitud
                    </button>
                  </div>
                }
              </div>
            </details>
          </li>
        }
      </ul>
    } @else if (cargando()) {
      <ul class="faq" aria-hidden="true">
        @for (i of [1, 2, 3]; track i) {
          <li class="faq-item"><span class="sk sk-linea"></span></li>
        }
      </ul>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FaqListComponent {
  readonly consultas = input.required<ConsultaFrecuente[]>();
  readonly cargando = input(false);
  readonly crear = output<ConsultaFrecuente>();

  protected readonly util = signal<number | null>(null);

  protected capital(texto: string): string {
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }
}
