import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guards';

const authPage = () => import('./features/auth/auth-page').then((m) => m.AuthPage);

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    data: { mode: 'login' },
    title: 'Log in · JobPilot',
    loadComponent: authPage,
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    data: { mode: 'register' },
    title: 'Create account · JobPilot',
    loadComponent: authPage,
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/shell/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'board' },
      {
        path: 'board',
        title: 'Board · JobPilot',
        loadComponent: () => import('./features/board/board').then((m) => m.Board),
      },
      {
        path: 'applications',
        title: 'Applications · JobPilot',
        loadComponent: () =>
          import('./features/applications/applications-list').then((m) => m.ApplicationsList),
      },
      {
        path: 'resumes',
        title: 'Resumes · JobPilot',
        loadComponent: () => import('./features/resumes/resumes').then((m) => m.Resumes),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
