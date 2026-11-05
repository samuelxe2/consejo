import { Categoria, Estado, SistemaOrigen, TipoEvento } from './models';

/** Etiquetas de la interfaz (SDD 8.4). Los colores viven en styles.css por clase. */
export const ETIQUETA_CATEGORIA: Record<Categoria, string> = {
  AUTO: 'Respuesta automática',
  FUNCIONAL: 'Soporte funcional',
  TECNICO: 'Soporte técnico',
};

export const ETIQUETA_ESTADO: Record<Estado, string> = {
  PENDIENTE_CONFIRMACION: 'Esperando confirmación',
  ABIERTO: 'Abierto',
  EN_ATENCION: 'En atención',
  RESUELTO: 'Resuelto',
};

export const ETIQUETA_SISTEMA: Record<SistemaOrigen, string> = {
  MAIA: 'MAIA',
  EVALUIA: 'EvaluIA 2.0',
  COURSE_BUILDER: 'Course Builder',
};

export const ETIQUETA_EVENTO: Record<TipoEvento, string> = {
  CREADO: 'Ticket creado',
  CLASIFICADO: 'Clasificado',
  ASIGNADO: 'Asignado',
  SIN_AGENTE_DISPONIBLE: 'Sin agente disponible',
  ESTADO_CAMBIADO: 'Cambio de estado',
  RESPUESTA_CONFIRMADA: 'Respuesta confirmada',
  RESPUESTA_RECHAZADA: 'Respuesta rechazada',
  RECLASIFICADO: 'Reclasificado',
};

/** Aviso tras confirmar (o rechazar) la respuesta automática. */
export function mensajeConfirmacion(resuelto: boolean): string {
  return resuelto
    ? '¡Gracias! Marcamos tu caso como resuelto.'
    : 'Tu caso pasó a soporte funcional.';
}

/** Nombre de clase CSS derivado del valor: EN_ATENCION -> en-atencion. */
export function claseDe(valor: string): string {
  return valor.toLowerCase().replaceAll('_', '-');
}
