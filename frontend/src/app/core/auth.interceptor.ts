import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { esApiError } from '../shared/models';
import { AuthService } from './auth.service';
import { SILENCIOSO } from './http-context';
import { NotificationService } from './notification.service';

/** Agrega el token, traduce el error del backend a avisos y ante 401 cierra sesión (SDD 8.1). */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const avisos = inject(NotificationService);
  const router = inject(Router);

  const esApi = req.url.startsWith(environment.apiUrl);
  const esLogin = req.url.endsWith('/auth/login');
  const token = auth.token();
  const peticion =
    esApi && token && !esLogin
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(peticion).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse)) {
        return throwError(() => err);
      }
      if (err.status === 401 && !esLogin) {
        if (auth.autenticado()) {
          auth.limpiar();
          avisos.error('Tu sesión expiró. Inicia sesión de nuevo.');
        }
        void router.navigate(['/login']);
      } else if (!req.context.get(SILENCIOSO)) {
        avisos.error(mensajeDe(err));
      }
      return throwError(() => err);
    }),
  );
};

export function mensajeDe(err: HttpErrorResponse): string {
  if (err.status === 0) return 'Sin conexión con el servidor.';
  if (esApiError(err.error)) return err.error.detalle;
  return 'Ocurrió un error inesperado.';
}
