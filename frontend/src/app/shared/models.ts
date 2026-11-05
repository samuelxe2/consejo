/** Contratos de la API (SDD 6). Se mantienen alineados con los DTO del backend. */

export type Categoria = 'AUTO' | 'FUNCIONAL' | 'TECNICO';
export type Estado = 'PENDIENTE_CONFIRMACION' | 'ABIERTO' | 'EN_ATENCION' | 'RESUELTO';
export type SistemaOrigen = 'MAIA' | 'EVALUIA' | 'COURSE_BUILDER';
export type Metodo = 'RULES' | 'LLM';
export type Rol = 'solicitante' | 'soporte_funcional' | 'soporte_tecnico';
export type TipoEvento =
  | 'CREADO'
  | 'CLASIFICADO'
  | 'ASIGNADO'
  | 'SIN_AGENTE_DISPONIBLE'
  | 'ESTADO_CAMBIADO'
  | 'RESPUESTA_CONFIRMADA'
  | 'RESPUESTA_RECHAZADA'
  | 'RECLASIFICADO';

export interface PersonaRef {
  id: number;
  nombre: string;
}

export interface Ticket {
  id: string;
  sistema_origen: SistemaOrigen;
  asunto: string;
  descripcion: string;
  contexto: string | null;
  categoria: Categoria;
  motivo: string;
  confianza: number;
  metodo_clasificacion: Metodo;
  respuesta_sugerida: string | null;
  estado: Estado;
  solicitante: PersonaRef | null;
  responsable: PersonaRef | null;
  fecha_creacion: string;
  fecha_actualizacion: string;
}

export interface Evento {
  tipo: TipoEvento;
  detalle: string | null;
  actor: PersonaRef | null;
  fecha: string;
}

export interface Sesion {
  token: string;
  rol: Rol;
  nombre: string;
  /** Puede faltar en sesiones guardadas antes de que el backend lo enviara. */
  email?: string;
  expira: string;
}

/** Desde la vista (asunto + descripción) o con el payload propio del sistema (SDD 3.4). */
export type CrearTicketDto =
  | { sistema_origen: SistemaOrigen; asunto: string; descripcion: string }
  | { sistema_origen: SistemaOrigen; payload: Record<string, string> };

/** Consulta frecuente del diccionario del backend (autoservicio). */
export interface ConsultaFrecuente {
  id: number;
  pregunta: string;
  palabras_clave: string[];
  respuesta: string;
}

export interface Filtros {
  /** Uno o varios estados (se envía el parámetro estado repetido). */
  estado?: Estado | Estado[] | null;
  categoria?: Categoria | null;
  sistema_origen?: SistemaOrigen | null;
  /** Búsqueda por número o asunto (en el backend). */
  q?: string | null;
}

export interface Paginacion {
  limite: number;
  desplazamiento?: number;
}

/** Una página del listado; el total viene de la cabecera X-Total-Count. */
export interface PaginaTickets {
  items: Ticket[];
  total: number;
}

/** Conteo por estado calculado en el backend. */
export interface ResumenTickets {
  total: number;
  por_estado: Record<Estado, number>;
}

/** Formato único de error del backend (SDD 5.5). */
export interface ApiError {
  error: string;
  detalle: string;
  campo: string | null;
}

export const SISTEMAS: { valor: SistemaOrigen; etiqueta: string }[] = [
  { valor: 'MAIA', etiqueta: 'MAIA' },
  { valor: 'EVALUIA', etiqueta: 'EvaluIA 2.0' },
  { valor: 'COURSE_BUILDER', etiqueta: 'Course Builder' },
];

export const ESTADOS: Estado[] = ['PENDIENTE_CONFIRMACION', 'ABIERTO', 'EN_ATENCION', 'RESUELTO'];

export function esAgente(rol: Rol): boolean {
  return rol !== 'solicitante';
}

export function esApiError(valor: unknown): valor is ApiError {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    typeof (valor as ApiError).detalle === 'string' &&
    typeof (valor as ApiError).error === 'string'
  );
}
