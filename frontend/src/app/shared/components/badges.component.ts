import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { ETIQUETA_CATEGORIA, ETIQUETA_ESTADO, claseDe } from '../labels';
import { Categoria, Estado } from '../models';

@Component({
  selector: 'app-category-badge',
  template: `<span class="badge" [class]="clase()">{{ etiqueta() }}</span>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryBadgeComponent {
  readonly categoria = input.required<Categoria>();
  protected readonly etiqueta = computed(() => ETIQUETA_CATEGORIA[this.categoria()]);
  protected readonly clase = computed(() => `cat-${claseDe(this.categoria())}`);
}

@Component({
  selector: 'app-status-badge',
  template: `<span class="badge" [class]="clase()">{{ etiqueta() }}</span>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBadgeComponent {
  readonly estado = input.required<Estado>();
  protected readonly etiqueta = computed(() => ETIQUETA_ESTADO[this.estado()]);
  protected readonly clase = computed(() => `est-${claseDe(this.estado())}`);
}
