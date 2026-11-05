import { Sesion, Ticket } from '../app/shared/models';
import { environment } from '../environments/environment';

export const API = environment.apiUrl;

export function sesion(parcial: Partial<Sesion> = {}): Sesion {
  return {
    token: 'tok-123',
    rol: 'solicitante',
    nombre: 'Estudiante Demo',
    expira: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    ...parcial,
  };
}

export function ticket(parcial: Partial<Ticket> = {}): Ticket {
  return {
    id: 'TCK-0001',
    sistema_origen: 'MAIA',
    asunto: '¿Dónde veo mis actividades?',
    descripcion: 'Descripción suficientemente larga.',
    contexto: null,
    categoria: 'AUTO',
    motivo: 'Coincide con FAQ: ubicar actividades',
    confianza: 0.8,
    metodo_clasificacion: 'RULES',
    respuesta_sugerida: 'Ingresa a la sección Actividades.',
    estado: 'PENDIENTE_CONFIRMACION',
    solicitante: { id: 1, nombre: 'Estudiante Demo' },
    responsable: null,
    fecha_creacion: '2026-11-03T15:00:00Z',
    fecha_actualizacion: '2026-11-03T15:00:00Z',
    ...parcial,
  };
}
