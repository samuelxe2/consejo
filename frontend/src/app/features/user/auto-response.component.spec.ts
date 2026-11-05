import { TestBed } from '@angular/core/testing';

import { AutoResponseComponent } from './auto-response.component';

describe('AutoResponseComponent', () => {
  async function montar(deshabilitado = false) {
    const fixture = TestBed.createComponent(AutoResponseComponent);
    fixture.componentRef.setInput('respuesta', 'Ingresa a la sección Actividades.');
    fixture.componentRef.setInput('deshabilitado', deshabilitado);
    const decisiones: boolean[] = [];
    fixture.componentInstance.decision.subscribe((d) => decisiones.push(d));
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const boton = (accion: string) =>
      el.querySelector<HTMLButtonElement>(`[data-accion=${accion}]`)!;
    return { el, decisiones, boton };
  }

  it('FE-10: "Resolvió mi caso" emite true y "No resolvió" emite false', async () => {
    const { el, decisiones, boton } = await montar();
    expect(el.textContent).toContain('Ingresa a la sección Actividades.');
    boton('resuelto').click();
    boton('no-resuelto').click();
    expect(decisiones).toEqual([true, false]);
  });

  it('FE-10: deshabilitado mientras se procesa', async () => {
    const { boton } = await montar(true);
    expect(boton('resuelto').disabled).toBe(true);
    expect(boton('no-resuelto').disabled).toBe(true);
  });
});
