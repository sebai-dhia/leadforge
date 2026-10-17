import { Routes } from '@angular/router';
import { authGuard, landingGuard } from './auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [landingGuard], loadComponent: () => import('./landing').then(m => m.Landing) },
  { path: 'login', loadComponent: () => import('./login').then(m => m.Login) },
  { path: 'welcome', canActivate: [authGuard], loadComponent: () => import('./onboarding').then(m => m.Onboarding) },
  { path: 'leads', canActivate: [authGuard], loadComponent: () => import('./leads').then(m => m.LeadsPage) },
  { path: 'searches', canActivate: [authGuard], loadComponent: () => import('./searches').then(m => m.Searches) },
  { path: 'searches/:id', canActivate: [authGuard], loadComponent: () => import('./search-detail').then(m => m.SearchDetail) },
  { path: 'profile', canActivate: [authGuard], loadComponent: () => import('./profile').then(m => m.ProfilePage) },
  { path: '**', redirectTo: '' },
];
