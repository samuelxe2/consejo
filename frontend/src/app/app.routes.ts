import { Routes } from '@angular/router';

import { invitadoGuard, rolGuard } from './core/role.guard';

/** Rutas (SDD 8.2): carga diferida por feature y guards de navegación por rol. */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    canActivate: [invitadoGuard],
    title: 'Ingresar · Mesa de Ayuda',
    loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'usuario',
    canActivate: [rolGuard('solicitante')],
    children: [
      {
        path: '',
        title: 'Inicio · Mesa de Ayuda',
        loadComponent: () =>
          import('./features/user/user-home.component').then((m) => m.UserHomeComponent),
      },
      {
        path: 'nueva',
        title: 'Nueva solicitud · Mesa de Ayuda',
        loadComponent: () =>
          import('./features/user/new-request.component').then((m) => m.NewRequestComponent),
      },
      {
        path: 'solicitudes',
        title: 'Mis solicitudes · Mesa de Ayuda',
        loadComponent: () =>
          import('./features/user/requests-panel.component').then((m) => m.RequestsPanelComponent),
      },
      {
        path: 'tickets/:id',
        title: 'Detalle · Mesa de Ayuda',
        loadComponent: () =>
          import('./features/ticket-detail/ticket-detail.component').then(
            (m) => m.TicketDetailComponent,
          ),
      },
    ],
  },
  {
    path: 'agente',
    canActivate: [rolGuard('agente')],
    children: [
      {
        path: '',
        title: 'Bandeja · Mesa de Ayuda',
        loadComponent: () =>
          import('./features/agent/agent-inbox.component').then((m) => m.AgentInboxComponent),
      },
      {
        path: 'tickets/:id',
        title: 'Detalle · Mesa de Ayuda',
        loadComponent: () =>
          import('./features/ticket-detail/ticket-detail.component').then(
            (m) => m.TicketDetailComponent,
          ),
      },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
