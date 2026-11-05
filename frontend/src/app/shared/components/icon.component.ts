import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Iconos de línea (SVG, trazo de 24×24) para la interfaz; heredan el color del texto. */
const TRAZOS = {
  inicio: ['M3 10.5 12 3l9 7.5', 'M5 9.5V21h14V9.5', 'M10 21v-6h4v6'],
  solicitudes: ['M8 3h8l4 4v14H4V3h4z', 'M8 12h8', 'M8 16h6', 'M8 8h3'],
  bandeja: ['M3 13h5l2 3h4l2-3h5', 'M5 5h14l2 8v6H3v-6z'],
  mas: ['M12 5v14', 'M5 12h14'],
  buscar: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M20 20l-4-4'],
  alerta: ['M12 3 2 20h20L12 3z', 'M12 10v4', 'M12 17h.01'],
  info: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 11v5', 'M12 8h.01'],
  pregunta: [
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
    'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6',
    'M12 17h.01',
  ],
  cursos: [
    'M4 5h6a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4z',
    'M20 5h-6a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6z',
  ],
  evaluacion: ['M9 4h6v3H9z', 'M7 5H5v16h14V5h-2', 'M9 14l2 2 4-4'],
  diseno: ['M12 3 3 8l9 5 9-5-9-5z', 'M3 13l9 5 9-5', 'M3 17.5l9 5 9-5'],
  check: ['M5 12.5l4.5 4.5L19 7'],
  flecha: ['M9 6l6 6-6 6'],
} as const;

export type NombreIcono = keyof typeof TRAZOS;

@Component({
  selector: 'app-icon',
  host: { class: 'icono', 'aria-hidden': 'true' },
  template: `
    <svg
      viewBox="0 0 24 24"
      [attr.width]="tamano()"
      [attr.height]="tamano()"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      focusable="false"
    >
      @for (d of trazos(); track $index) {
        <path [attr.d]="d" />
      }
    </svg>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IconComponent {
  readonly nombre = input.required<NombreIcono>();
  readonly tamano = input(18);
  protected readonly trazos = computed(() => TRAZOS[this.nombre()]);
}
