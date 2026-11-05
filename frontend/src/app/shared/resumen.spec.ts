import { agrupar, estadosDe } from './resumen';

describe('resumen (contadores del panel)', () => {
  it('agrupa el conteo del backend en pendientes, en proceso y completadas', () => {
    const r = agrupar({
      total: 7,
      por_estado: { PENDIENTE_CONFIRMACION: 2, ABIERTO: 1, EN_ATENCION: 3, RESUELTO: 1 },
    });
    expect(r).toEqual({ total: 7, pendientes: 3, proceso: 3, completadas: 1, porConfirmar: 2 });
  });

  it('traduce cada grupo a los estados que se piden al backend', () => {
    expect(estadosDe('todas')).toEqual([]);
    expect(estadosDe('pendientes')).toEqual(['PENDIENTE_CONFIRMACION', 'ABIERTO']);
    expect(estadosDe('completadas')).toEqual(['RESUELTO']);
  });
});
