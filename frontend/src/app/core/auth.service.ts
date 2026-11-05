import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, finalize, of, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { Rol, Sesion, esAgente } from '../shared/models';
import { silencioso } from './http-context';

export const CLAVE_SESION = 'mesa-ayuda.sesion';

/** Sesión del usuario. El rol que importa es el del backend; aquí solo guía la navegación. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly _sesion = signal<Sesion | null>(leerSesion());

  readonly sesion = this._sesion.asReadonly();
  readonly autenticado = computed(() => this._sesion() !== null);
  readonly rol = computed<Rol | null>(() => this._sesion()?.rol ?? null);
  readonly token = computed(() => this._sesion()?.token ?? null);

  login(email: string): Observable<Sesion> {
    return this.http
      .post<Sesion>(`${environment.apiUrl}/auth/login`, { email })
      .pipe(tap((sesion) => this.guardar(sesion)));
  }

  /** Invalida el token en el backend; la sesión local se borra aunque la llamada falle. */
  logout(): Observable<unknown> {
    if (!this.token()) {
      return of(null);
    }
    return this.http
      .post(`${environment.apiUrl}/auth/logout`, {}, { context: silencioso() })
      .pipe(finalize(() => this.limpiar()));
  }

  limpiar(): void {
    this._sesion.set(null);
    try {
      sessionStorage.removeItem(CLAVE_SESION);
    } catch {
      /* almacenamiento no disponible */
    }
  }

  /** Ruta de inicio según el rol actual. */
  inicio(): string {
    const rol = this.rol();
    if (!rol) return '/login';
    return esAgente(rol) ? '/agente' : '/usuario';
  }

  private guardar(sesion: Sesion): void {
    this._sesion.set(sesion);
    try {
      sessionStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
    } catch {
      /* la sesión sigue en memoria */
    }
  }
}

function leerSesion(): Sesion | null {
  try {
    const crudo = sessionStorage.getItem(CLAVE_SESION);
    if (!crudo) return null;
    const sesion = JSON.parse(crudo) as Sesion;
    return new Date(sesion.expira).getTime() > Date.now() ? sesion : null;
  } catch {
    return null;
  }
}
