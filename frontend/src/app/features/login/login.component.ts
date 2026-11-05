import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth.service';

interface Identidad {
  email: string;
  nombre: string;
  rol: string;
}

/** Identidades de demostración sembradas en el backend (SDD 7). */
export const IDENTIDADES: Identidad[] = [
  { email: 'estudiante@demo.unad.edu.co', nombre: 'Estudiante Demo', rol: 'Solicitante' },
  { email: 'docente@demo.unad.edu.co', nombre: 'Docente Demo', rol: 'Solicitante' },
  { email: 'funcional1@demo.unad.edu.co', nombre: 'Funcional Uno', rol: 'Soporte funcional' },
  { email: 'funcional2@demo.unad.edu.co', nombre: 'Funcional Dos', rol: 'Soporte funcional' },
  { email: 'tecnico@demo.unad.edu.co', nombre: 'Técnico Demo', rol: 'Soporte técnico' },
];

@Component({
  selector: 'app-login',
  template: `
    <section class="login tarjeta">
      <div class="login-hero">
        <span class="marca-logo marca-logo-grande" aria-hidden="true">?</span>
        <h1>Mesa de Ayuda Inteligente</h1>
        <p class="sub">
          Ecosistema UNAD IA 360°. Clasificamos tu solicitud con IA y te mostramos en qué etapa va.
        </p>
      </div>
      <p class="login-instruccion">Elige una identidad de demostración</p>
      <ul class="identidades">
        @for (i of identidades; track i.email) {
          <li>
            <button
              type="button"
              class="identidad"
              [class.identidad-agente]="i.rol !== 'Solicitante'"
              [disabled]="enviando() !== null"
              (click)="entrar(i.email)"
            >
              <span class="avatar" aria-hidden="true">{{ i.nombre.charAt(0) }}</span>
              <span class="identidad-nombre">{{ i.nombre }}</span>
              <span class="identidad-rol">{{ i.rol }}</span>
              <span class="identidad-email">{{ i.email }}</span>
            </button>
          </li>
        }
      </ul>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly identidades = IDENTIDADES;
  protected readonly enviando = signal<string | null>(null);

  entrar(email: string): void {
    this.enviando.set(email);
    this.auth.login(email).subscribe({
      next: () => void this.router.navigateByUrl(this.auth.inicio()),
      error: () => this.enviando.set(null),
    });
  }
}
