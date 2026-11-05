import { SistemaOrigen } from '../shared/models';

/** Progreso del registro, para volver al inicio sin perderlo (se guarda en sessionStorage). */
export interface Borrador {
  paso: 1 | 2 | 3;
  sistema: SistemaOrigen | null;
  valores: Record<string, string>;
}

export const CLAVE_BORRADOR = 'mesa-ayuda.borrador';

export function leerBorrador(): Borrador | null {
  try {
    const crudo = sessionStorage.getItem(CLAVE_BORRADOR);
    return crudo ? (JSON.parse(crudo) as Borrador) : null;
  } catch {
    return null;
  }
}

export function guardarBorrador(b: Borrador): void {
  try {
    sessionStorage.setItem(CLAVE_BORRADOR, JSON.stringify(b));
  } catch {
    /* sin almacenamiento el progreso dura mientras la pantalla esté abierta */
  }
}

export function borrarBorrador(): void {
  try {
    sessionStorage.removeItem(CLAVE_BORRADOR);
  } catch {
    /* nada que borrar */
  }
}

/** Hay algo que valga la pena retomar: un tipo elegido o algún texto escrito. */
export function borradorConContenido(b: Borrador | null): boolean {
  return !!b && (!!b.sistema || Object.values(b.valores).some((v) => v.trim()));
}
