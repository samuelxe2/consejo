import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export interface Miga {
  etiqueta: string;
  ruta?: string;
}

/**
 * Encabezado de cada pantalla: responde "¿dónde estoy?" (migas y título)
 * y "¿qué puedo hacer aquí?" (descripción). El contenido proyectado va a la derecha.
 */
@Component({
  selector: 'app-page-header',
  imports: [RouterLink],
  template: `
    <nav class="migas" aria-label="Estás en">
      <ol>
        @for (m of migas(); track m.etiqueta; let ultimo = $last) {
          <li>
            @if (m.ruta && !ultimo) {
              <a [routerLink]="m.ruta">{{ m.etiqueta }}</a>
            } @else {
              <span [attr.aria-current]="ultimo ? 'page' : null">{{ m.etiqueta }}</span>
            }
          </li>
        }
      </ol>
    </nav>
    <div class="encabezado">
      <div>
        <h1>{{ titulo() }}</h1>
        @if (descripcion()) {
          <p class="encabezado-desc">{{ descripcion() }}</p>
        }
      </div>
      <div class="encabezado-extra"><ng-content /></div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeaderComponent {
  readonly titulo = input.required<string>();
  readonly descripcion = input('');
  readonly migas = input<Miga[]>([]);
}
