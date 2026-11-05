import { Estado, ResumenTickets } from './models';

/** Agrupación de estados en términos del usuario. */
export type GrupoEstado = 'todas' | 'pendientes' | 'proceso' | 'completadas';

export const GRUPOS: Record<Exclude<GrupoEstado, 'todas'>, Estado[]> = {
  /** Aún nadie trabaja en ella: espera tu confirmación o que un agente la tome. */
  pendientes: ['PENDIENTE_CONFIRMACION', 'ABIERTO'],
  proceso: ['EN_ATENCION'],
  completadas: ['RESUELTO'],
};

export interface Resumen {
  total: number;
  pendientes: number;
  proceso: number;
  completadas: number;
  /** Respuestas sugeridas que esperan que el usuario diga si le sirvieron. */
  porConfirmar: number;
}

export const RESUMEN_VACIO: Resumen = {
  total: 0,
  pendientes: 0,
  proceso: 0,
  completadas: 0,
  porConfirmar: 0,
};

/** Estados que se piden al backend para un grupo (todas = sin filtro). */
export function estadosDe(grupo: GrupoEstado): Estado[] {
  return grupo === 'todas' ? [] : GRUPOS[grupo];
}

/** Convierte el conteo por estado del backend en los contadores del panel. */
export function agrupar(r: ResumenTickets): Resumen {
  const suma = (estados: Estado[]) => estados.reduce((n, e) => n + (r.por_estado[e] ?? 0), 0);
  return {
    total: r.total,
    pendientes: suma(GRUPOS.pendientes),
    proceso: suma(GRUPOS.proceso),
    completadas: suma(GRUPOS.completadas),
    porConfirmar: r.por_estado.PENDIENTE_CONFIRMACION ?? 0,
  };
}
