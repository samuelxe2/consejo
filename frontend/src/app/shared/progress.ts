import { ETIQUETA_CATEGORIA, ETIQUETA_SISTEMA } from './labels';
import { Estado, Evento, Ticket, TipoEvento } from './models';

export type EstadoPaso = 'hecho' | 'actual' | 'pendiente';

/** Una etapa del recorrido de la solicitud, tal como la ve el usuario. */
export interface Paso {
  clave: string;
  titulo: string;
  descripcion: string;
  estado: EstadoPaso;
  fecha: string | null;
}

/** Último evento de un tipo; para cambios de estado, el que llega a `destino`. */
function fechaDe(eventos: Evento[], tipo: TipoEvento, destino?: Estado): string | null {
  for (let i = eventos.length - 1; i >= 0; i--) {
    const e = eventos[i];
    if (e.tipo !== tipo) continue;
    if (destino && !(e.detalle ?? '').endsWith(`→ ${destino}`)) continue;
    return e.fecha;
  }
  return null;
}

function estadoPaso(indice: number, actual: number, resuelto: boolean): EstadoPaso {
  if (resuelto || indice < actual) return 'hecho';
  return indice === actual ? 'actual' : 'pendiente';
}

/**
 * Recorrido de la solicitud según su categoría y estado.
 * AUTO: recibida → respuesta sugerida → resuelta.
 * FUNCIONAL/TÉCNICO: recibida → [respuesta no resolvió] → asignada → en atención → resuelta.
 * Los eventos (opcionales) aportan fechas y detectan el rechazo de la respuesta automática.
 */
export function pasosDe(ticket: Ticket, eventos: Evento[] = []): Paso[] {
  const resuelto = ticket.estado === 'RESUELTO';
  const recibida = {
    clave: 'recibida',
    titulo: 'Solicitud recibida',
    descripcion: `Registrada desde ${ETIQUETA_SISTEMA[ticket.sistema_origen]}.`,
    fecha: fechaDe(eventos, 'CREADO') ?? ticket.fecha_creacion,
  };
  const fin = {
    clave: 'resuelta',
    titulo: 'Resuelta',
    descripcion: resuelto
      ? 'Tu solicitud quedó cerrada.'
      : 'Se cerrará cuando el caso quede solucionado.',
    fecha: resuelto
      ? (fechaDe(eventos, 'RESPUESTA_CONFIRMADA') ??
        fechaDe(eventos, 'ESTADO_CAMBIADO', 'RESUELTO') ??
        ticket.fecha_actualizacion)
      : null,
  };

  if (ticket.categoria === 'AUTO') {
    const pasos = [
      recibida,
      {
        clave: 'respuesta',
        titulo: 'Respuesta automática',
        descripcion: resuelto
          ? 'Confirmaste que la respuesta sugerida resolvió tu caso.'
          : 'Te sugerimos una solución. Cuéntanos si te sirvió.',
        fecha: fechaDe(eventos, 'CLASIFICADO') ?? ticket.fecha_creacion,
      },
      fin,
    ];
    return pasos.map((p, i) => ({ ...p, estado: estadoPaso(i, 1, resuelto) }));
  }

  const equipo = ETIQUETA_CATEGORIA[ticket.categoria];
  const persona = ticket.responsable?.nombre;
  const pasos: Omit<Paso, 'estado'>[] = [recibida];

  const rechazo = fechaDe(eventos, 'RESPUESTA_RECHAZADA');
  if (rechazo) {
    pasos.push({
      clave: 'rechazo',
      titulo: 'La respuesta automática no resolvió',
      descripcion: 'Pasamos tu caso a una persona del equipo.',
      fecha: rechazo,
    });
  }

  pasos.push(
    {
      clave: 'asignada',
      titulo: `Asignada a ${equipo.toLowerCase()}`,
      descripcion: persona
        ? ticket.estado === 'ABIERTO'
          ? `${persona} revisará tu caso en breve.`
          : `Responsable: ${persona}.`
        : 'Esperando un agente disponible.',
      fecha: fechaDe(eventos, 'ASIGNADO') ?? (persona ? ticket.fecha_creacion : null),
    },
    {
      clave: 'atencion',
      titulo: 'En atención',
      descripcion:
        ticket.estado === 'EN_ATENCION'
          ? `${persona ?? 'El equipo'} está trabajando en tu caso.`
          : 'Un agente trabajará en tu caso.',
      fecha: fechaDe(eventos, 'ESTADO_CAMBIADO', 'EN_ATENCION'),
    },
    fin,
  );

  const indice = pasos.findIndex(
    (p) => p.clave === (ticket.estado === 'ABIERTO' ? 'asignada' : 'atencion'),
  );
  return pasos.map((p, i) => ({ ...p, estado: estadoPaso(i, indice, resuelto) }));
}

/** El paso en curso (o el último, si ya se resolvió). */
export function pasoActual(pasos: Paso[]): Paso {
  return pasos.find((p) => p.estado === 'actual') ?? pasos[pasos.length - 1];
}
