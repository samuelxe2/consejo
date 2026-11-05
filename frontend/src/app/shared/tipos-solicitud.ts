import { NombreIcono } from './components/icon.component';
import { SistemaOrigen } from './models';

/** Un campo del paso 2. `clave` es el nombre del campo en el payload del adaptador (SDD 3.4). */
export interface CampoSolicitud {
  clave: string;
  etiqueta: string;
  ayuda: string;
  placeholder: string;
  requerido: boolean;
  min: number;
  max: number;
  multilinea?: boolean;
}

/** Tipo de solicitud = plataforma donde ocurre el problema; define qué campos se piden. */
export interface TipoSolicitud {
  sistema: SistemaOrigen;
  titulo: string;
  plataforma: string;
  descripcion: string;
  icono: NombreIcono;
  campos: CampoSolicitud[];
  /** Campo del formulario que corresponde al "asunto" del backend, para ubicar sus errores. */
  campoAsunto: string;
}

const DESCRIPCION: CampoSolicitud = {
  clave: 'descripcion',
  etiqueta: 'Cuéntanos qué pasó',
  ayuda: 'Incluye qué intentabas hacer y qué viste en pantalla.',
  placeholder: 'Ej.: Entro al curso y no aparece la sección de actividades…',
  requerido: true,
  min: 10,
  max: 2000,
  multilinea: true,
};

export const TIPOS_SOLICITUD: TipoSolicitud[] = [
  {
    sistema: 'MAIA',
    titulo: 'Mis cursos y actividades',
    plataforma: 'MAIA',
    descripcion: 'Actividades, calificaciones, foros, certificados o contenidos del curso.',
    icono: 'cursos',
    campoAsunto: 'consulta',
    campos: [
      {
        clave: 'curso',
        etiqueta: 'Curso',
        ayuda: 'Nombre o código del curso donde ocurre.',
        placeholder: 'Ej.: Cálculo diferencial',
        requerido: true,
        min: 2,
        max: 80,
      },
      {
        clave: 'consulta',
        etiqueta: '¿Qué necesitas?',
        ayuda: 'Una frase corta. Mientras escribes buscamos una respuesta inmediata.',
        placeholder: 'Ej.: ¿Dónde veo mis actividades?',
        requerido: true,
        min: 3,
        max: 150,
      },
      DESCRIPCION,
    ],
  },
  {
    sistema: 'EVALUIA',
    titulo: 'Evaluaciones',
    plataforma: 'EvaluIA 2.0',
    descripcion: 'Presentar, enviar o consultar el estado de una evaluación.',
    icono: 'evaluacion',
    campoAsunto: 'error',
    campos: [
      {
        clave: 'evaluacion_id',
        etiqueta: 'Evaluación',
        ayuda: 'Código o nombre de la evaluación.',
        placeholder: 'Ej.: EV-204',
        requerido: true,
        min: 2,
        max: 40,
      },
      {
        clave: 'error',
        etiqueta: 'Mensaje de error (opcional)',
        ayuda: 'Si apareció un mensaje, cópialo tal cual. Si no, déjalo vacío.',
        placeholder: 'Ej.: Error HTTP 500 al enviar',
        requerido: false,
        min: 3,
        max: 150,
      },
      DESCRIPCION,
    ],
  },
  {
    sistema: 'COURSE_BUILDER',
    titulo: 'Diseño de cursos',
    plataforma: 'Course Builder',
    descripcion: 'Crear, editar o publicar contenidos de un curso (docentes).',
    icono: 'diseno',
    campoAsunto: 'operacion',
    campos: [
      {
        clave: 'curso',
        etiqueta: 'Curso',
        ayuda: 'Curso que estás construyendo.',
        placeholder: 'Ej.: Ética profesional',
        requerido: true,
        min: 2,
        max: 60,
      },
      {
        clave: 'operacion',
        etiqueta: '¿Qué intentabas hacer?',
        ayuda: 'La acción que no pudiste completar.',
        placeholder: 'Ej.: Publicar el foro',
        requerido: true,
        min: 3,
        max: 80,
      },
      DESCRIPCION,
    ],
  },
];

export function tipoDe(sistema: SistemaOrigen | null): TipoSolicitud | null {
  return TIPOS_SOLICITUD.find((t) => t.sistema === sistema) ?? null;
}
