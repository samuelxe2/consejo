import { HttpContext, HttpContextToken } from '@angular/common/http';

/** Peticiones que no deben mostrar avisos de error (polling, logout). El 401 se maneja igual. */
export const SILENCIOSO = new HttpContextToken<boolean>(() => false);

export function silencioso(): HttpContext {
  return new HttpContext().set(SILENCIOSO, true);
}
