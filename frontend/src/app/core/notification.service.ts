import { Injectable, signal } from '@angular/core';

export type TipoAviso = 'error' | 'exito' | 'info';

export interface Aviso {
  id: number;
  tipo: TipoAviso;
  mensaje: string;
}

/** Avisos visibles para el usuario (SDD 8.1). */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  static readonly DURACION_MS = 5000;

  private siguienteId = 1;
  private readonly _avisos = signal<Aviso[]>([]);
  readonly avisos = this._avisos.asReadonly();

  mostrar(mensaje: string, tipo: TipoAviso = 'info'): void {
    const aviso = { id: this.siguienteId++, tipo, mensaje };
    this._avisos.update((lista) => [...lista, aviso]);
    setTimeout(() => this.cerrar(aviso.id), NotificationService.DURACION_MS);
  }

  error(mensaje: string): void {
    this.mostrar(mensaje, 'error');
  }

  exito(mensaje: string): void {
    this.mostrar(mensaje, 'exito');
  }

  cerrar(id: number): void {
    this._avisos.update((lista) => lista.filter((a) => a.id !== id));
  }
}
