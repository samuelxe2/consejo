import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { esAgente } from '../shared/models';
import { AuthService } from './auth.service';

export type TipoVista = 'solicitante' | 'agente';

/**
 * Guard de navegación por rol. No es un mecanismo de seguridad: el backend
 * vuelve a validar la sesión y la pertenencia en cada petición (SDD 8.1).
 */
export function rolGuard(vista: TipoVista): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const rol = auth.rol();
    if (!rol) {
      return router.parseUrl('/login');
    }
    const permitido = vista === 'agente' ? esAgente(rol) : !esAgente(rol);
    return permitido ? true : router.parseUrl(auth.inicio());
  };
}

/** Si ya hay sesión, /login lleva a la vista del rol. */
export const invitadoGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.autenticado() ? inject(Router).parseUrl(auth.inicio()) : true;
};
