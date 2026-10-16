import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./login').then(m => m.Login) },
  { path: '', canActivate: [authGuard], loadComponent: () => import('./leads').then(m => m.LeadsPage) },
  { path: 'searches', canActivate: [authGuard], loadComponent: () => import('./searches').then(m => m.Searches) },
  { path: 'searches/:id', canActivate: [authGuard], loadComponent: () => import('./search-detail').then(m => m.SearchDetail) },
  { path: 'profile', canActivate: [authGuard], loadComponent: () => import('./profile').then(m => m.ProfilePage) },
  { path: '**', redirectTo: '' },
];
