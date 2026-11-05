import { ticket } from '../../testing/fixtures';
import { Evento } from './models';
import { pasoActual, pasosDe } from './progress';

const claves = (t: ReturnType<typeof pasosDe>) => t.map((p) => `${p.clave}:${p.estado}`);

describe('pasosDe (línea de tiempo de la solicitud)', () => {
  it('AUTO pendiente: recibida hecha, respuesta automática en curso', () => {
    const pasos = pasosDe(ticket());
    expect(claves(pasos)).toEqual(['recibida:hecho', 'respuesta:actual', 'resuelta:pendiente']);
    expect(pasoActual(pasos).titulo).toBe('Respuesta automática');
  });

  it('AUTO confirmado: todos los pasos hechos y fecha de confirmación', () => {
    const eventos: Evento[] = [
      { tipo: 'RESPUESTA_CONFIRMADA', detalle: null, actor: null, fecha: '2026-11-03T16:00:00Z' },
    ];
    const pasos = pasosDe(ticket({ estado: 'RESUELTO' }), eventos);
    expect(pasos.every((p) => p.estado === 'hecho')).toBe(true);
    expect(pasos[2].fecha).toBe('2026-11-03T16:00:00Z');
  });

  it('FUNCIONAL abierto con responsable: asignada en curso', () => {
    const pasos = pasosDe(
      ticket({
        categoria: 'FUNCIONAL',
        estado: 'ABIERTO',
        responsable: { id: 3, nombre: 'Funcional Uno' },
      }),
    );
    expect(claves(pasos)).toEqual([
      'recibida:hecho',
      'asignada:actual',
      'atencion:pendiente',
      'resuelta:pendiente',
    ]);
    expect(pasos[1].titulo).toBe('Asignada a soporte funcional');
    expect(pasos[1].descripcion).toContain('Funcional Uno');
  });

  it('TÉCNICO en atención: toma la fecha del cambio de estado', () => {
    const eventos: Evento[] = [
      {
        tipo: 'ASIGNADO',
        detalle: 'Asignado a Técnico Demo',
        actor: null,
        fecha: '2026-11-03T15:00:01Z',
      },
      {
        tipo: 'ESTADO_CAMBIADO',
        detalle: 'ABIERTO → EN_ATENCION',
        actor: null,
        fecha: '2026-11-03T15:30:00Z',
      },
    ];
    const pasos = pasosDe(
      ticket({
        categoria: 'TECNICO',
        estado: 'EN_ATENCION',
        responsable: { id: 5, nombre: 'Técnico Demo' },
      }),
      eventos,
    );
    expect(pasoActual(pasos).clave).toBe('atencion');
    expect(pasoActual(pasos).fecha).toBe('2026-11-03T15:30:00Z');
    expect(pasos[1].fecha).toBe('2026-11-03T15:00:01Z');
  });

  it('respuesta AUTO rechazada: agrega el paso de reasignación', () => {
    const eventos: Evento[] = [
      { tipo: 'RESPUESTA_RECHAZADA', detalle: null, actor: null, fecha: '2026-11-03T15:10:00Z' },
    ];
    const pasos = pasosDe(ticket({ categoria: 'FUNCIONAL', estado: 'ABIERTO' }), eventos);
    expect(claves(pasos)).toEqual([
      'recibida:hecho',
      'rechazo:hecho',
      'asignada:actual',
      'atencion:pendiente',
      'resuelta:pendiente',
    ]);
    expect(pasos[2].descripcion).toBe('Esperando un agente disponible.');
  });
});
