import { TestBed } from '@angular/core/testing';

import { Categoria, Estado } from '../models';
import { CategoryBadgeComponent, StatusBadgeComponent } from './badges.component';

async function renderizar<T>(tipo: new () => T, input: string, valor: string) {
  const fixture = TestBed.createComponent(tipo);
  fixture.componentRef.setInput(input, valor);
  await fixture.whenStable();
  return (fixture.nativeElement as HTMLElement).querySelector('span')!;
}

describe('Badges', () => {
  it.each<[Categoria, string, string]>([
    ['AUTO', 'Respuesta automática', 'cat-auto'],
    ['FUNCIONAL', 'Soporte funcional', 'cat-funcional'],
    ['TECNICO', 'Soporte técnico', 'cat-tecnico'],
  ])('FE-12: categoría %s -> "%s" con clase %s', async (valor, etiqueta, clase) => {
    const span = await renderizar(CategoryBadgeComponent, 'categoria', valor);
    expect(span.textContent).toBe(etiqueta);
    expect([...span.classList].sort()).toEqual(['badge', clase].sort());
  });

  it.each<[Estado, string, string]>([
    ['PENDIENTE_CONFIRMACION', 'Esperando confirmación', 'est-pendiente-confirmacion'],
    ['ABIERTO', 'Abierto', 'est-abierto'],
    ['EN_ATENCION', 'En atención', 'est-en-atencion'],
    ['RESUELTO', 'Resuelto', 'est-resuelto'],
  ])('FE-12: estado %s -> "%s" con clase %s', async (valor, etiqueta, clase) => {
    const span = await renderizar(StatusBadgeComponent, 'estado', valor);
    expect(span.textContent).toBe(etiqueta);
    expect([...span.classList].sort()).toEqual(['badge', clase].sort());
  });
});
