import { TestBed } from '@angular/core/testing';

import { ticket } from '../../../testing/fixtures';
import { Ticket } from '../models';
import { TicketProgressComponent } from './ticket-progress.component';

function render(t: Ticket, compacto: boolean) {
  const fixture = TestBed.createComponent(TicketProgressComponent);
  fixture.componentRef.setInput('ticket', t);
  fixture.componentRef.setInput('compacto', compacto);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('TicketProgressComponent', () => {
  it('compacto: marca el paso actual y explica qué sigue', () => {
    const el = render(ticket({ categoria: 'FUNCIONAL', estado: 'EN_ATENCION' }), true);
    expect(el.querySelectorAll('.paso')).toHaveLength(4);
    expect(el.querySelector('.paso-actual')?.getAttribute('data-paso')).toBe('atencion');
    expect(el.querySelectorAll('.paso-hecho')).toHaveLength(2);
    expect(el.querySelector('.progreso-siguiente')?.textContent).toContain('En atención');
  });

  it('vertical: muestra "Ahora" en el hito en curso y fechas solo en los alcanzados', () => {
    const el = render(ticket(), false);
    const hitos = el.querySelectorAll('.hito');
    expect(hitos).toHaveLength(3);
    expect(hitos[1].classList).toContain('hito-actual');
    expect(hitos[1].querySelector('.hito-ahora')).not.toBeNull();
    expect(hitos[2].querySelector('time')).toBeNull();
  });
});
