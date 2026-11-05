import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { NotificationService } from '../../core/notification.service';

@Component({
  selector: 'app-notifications',
  template: `
    <div class="avisos" aria-live="polite">
      @for (aviso of servicio.avisos(); track aviso.id) {
        <div class="aviso" [class]="'aviso-' + aviso.tipo" role="alert">
          <span>{{ aviso.mensaje }}</span>
          <button
            type="button"
            class="btn-icono"
            aria-label="Cerrar aviso"
            (click)="servicio.cerrar(aviso.id)"
          >
            ×
          </button>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsComponent {
  protected readonly servicio = inject(NotificationService);
}
