import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Última actualización y estado de conexión del polling. */
@Component({
  selector: 'app-sync-indicator',
  imports: [DatePipe],
  template: `
    <span class="sync" [class.sync-offline]="!enLinea()" role="status">
      <span class="sync-dot" aria-hidden="true"></span>
      @if (enLinea()) {
        @if (ultima(); as fecha) {
          Actualizado {{ fecha | date: 'HH:mm:ss' }}
        } @else {
          Cargando…
        }
      } @else {
        Sin conexión
        @if (ultima(); as fecha) {
          · datos de las {{ fecha | date: 'HH:mm:ss' }}
        }
      }
    </span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SyncIndicatorComponent {
  readonly enLinea = input(true);
  readonly ultima = input<Date | null>(null);
}
