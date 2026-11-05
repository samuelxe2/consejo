import { TestBed } from '@angular/core/testing';

import { Estado } from '../../shared/models';
import { TicketActionsComponent } from './ticket-actions.component';

describe('TicketActionsComponent', () => {
  async function montar(estado: Estado) {
    const fixture = TestBed.createComponent(TicketActionsComponent);
    fixture.componentRef.setInput('estado', estado);
    const emitidos: Estado[] = [];
    fixture.componentInstance.cambiar.subscribe((e) => emitidos.push(e));
    await fixture.whenStable();
    const botones = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')];
    return { botones, emitidos };
  }

  it.each([
    ['ABIERTO', 'Tomar caso', 'EN_ATENCION'],
    ['EN_ATENCION', 'Marcar resuelto', 'RESUELTO'],
  ] as const)('FE-11: en %s solo muestra "%s" y emite %s', async (estado, etiqueta, destino) => {
    const { botones, emitidos } = await montar(estado);
    expect(botones.map((b) => b.textContent?.trim())).toEqual([etiqueta]);
    botones[0].click();
    expect(emitidos).toEqual([destino]);
  });

  it.each(['RESUELTO', 'PENDIENTE_CONFIRMACION'] as const)(
    'FE-11: en %s no muestra acciones',
    async (estado) => {
      const { botones } = await montar(estado);
      expect(botones).toEqual([]);
    },
  );
});
