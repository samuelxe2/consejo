import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import { AuthService } from './core/auth.service';
import { NotificationsComponent } from './shared/components/notifications.component';
import { esAgente } from './shared/models';
import { IconComponent, NombreIcono } from './shared/components/icon.component';

const ETIQUETA_ROL = {
  solicitante: 'Solicitante',
  soporte_funcional: 'Soporte funcional',
  soporte_tecnico: 'Soporte técnico',
} as const;

interface ItemNav {
  id: string;
  etiqueta: string;
  icono: NombreIcono;
  ruta: string;
}

const NAV_SOLICITANTE: ItemNav[] = [
  { id: 'inicio', etiqueta: 'Inicio', icono: 'inicio', ruta: '/usuario' },
  {
    id: 'solicitudes',
    etiqueta: 'Mis solicitudes',
    icono: 'solicitudes',
    ruta: '/usuario/solicitudes',
  },
];

const NAV_AGENTE: ItemNav[] = [
  { id: 'bandeja', etiqueta: 'Bandeja de tickets', icono: 'bandeja', ruta: '/agente' },
];

/** Sección actual a partir de la URL (el detalle pertenece a "Mis solicitudes" / "Bandeja"). */
function seccionDe(url: string): string {
  const ruta = url.split(/[?#]/)[0];
  if (ruta.startsWith('/usuario/nueva')) return 'nueva';
  if (ruta.startsWith('/usuario/solicitudes') || ruta.startsWith('/usuario/tickets')) {
    return 'solicitudes';
  }
  if (ruta.startsWith('/usuario')) return 'inicio';
  if (ruta.startsWith('/agente')) return 'bandeja';
  return 'login';
}

@Component({
  selector: 'app-root',
  imports: [IconComponent, RouterOutlet, RouterLink, NotificationsComponent],
  template: `
    <a class="saltar" href="#contenido">Saltar al contenido</a>
    <header class="cabecera">
      <div class="cabecera-interior">
        <a class="marca" [routerLink]="auth.inicio()" aria-label="Ir al inicio">
          <span class="marca-logo" aria-hidden="true">?</span>
          <span class="marca-texto">
            <span class="marca-nombre">Mesa de Ayuda</span>
            <span class="marca-sub">Ecosistema UNAD IA 360°</span>
          </span>
        </a>
        @if (auth.sesion(); as s) {
          <span class="usuario">
            <span class="separador" aria-hidden="true">|</span>
            <span class="avatar" aria-hidden="true">{{ s.nombre.charAt(0) }}</span>
            <span class="usuario-datos">
              <span class="usuario-nombre">{{ s.nombre }}</span>
              <span class="rol">{{ rol() }}</span>
            </span>
            <span class="separador" aria-hidden="true">|</span>
            <button type="button" class="btn-salir" (click)="salir()">Salir</button>
          </span>
        }
      </div>
    </header>
    <nav class="navegacion" aria-label="Principal">
      <div class="navegacion-interior">
        @if (auth.sesion()) {
          @for (item of items(); track item.id) {
            <a
              class="nav-item"
              [routerLink]="item.ruta"
              [class.activo]="item.id === seccion()"
              [attr.aria-current]="item.id === seccion() ? 'page' : null"
            >
              <app-icon class="nav-icono" [nombre]="item.icono" />
              <span class="nav-etiqueta">{{ item.etiqueta }}</span>
            </a>
          }
          @if (!agente() && seccion() !== 'nueva') {
            <a class="nav-cta" routerLink="/usuario/nueva" data-accion="crear-global">
              <app-icon nombre="mas" />
              <span class="nav-cta-texto">Crear nueva solicitud</span>
            </a>
          }
        } @else {
          <span class="navegacion-titulo">Atención al estudiante</span>
        }
      </div>
    </nav>
    <main class="contenido" id="contenido" tabindex="-1">
      <router-outlet />
    </main>
    <app-notifications />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly rol = computed(() => {
    const r = this.auth.rol();
    return r ? ETIQUETA_ROL[r] : '';
  });
  protected readonly agente = computed(() => {
    const r = this.auth.rol();
    return r !== null && esAgente(r);
  });
  protected readonly items = computed(() => (this.agente() ? NAV_AGENTE : NAV_SOLICITANTE));

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  protected readonly seccion = computed(() => seccionDe(this.url()));

  salir(): void {
    this.auth.logout().subscribe({
      complete: () => void this.router.navigate(['/login']),
      error: () => void this.router.navigate(['/login']),
    });
  }
}
