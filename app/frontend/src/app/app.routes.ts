import { Routes } from '@angular/router';
import { adminGuard, authGuard, landingGuard, notGuestGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [landingGuard], loadComponent: () => import('./features/landing/landing').then(m => m.Landing) },
  { path: 'login', loadComponent: () => import('./features/login/login').then(m => m.Login) },
  { path: 'welcome', canActivate: [authGuard, notGuestGuard], loadComponent: () => import('./features/onboarding/onboarding').then(m => m.Onboarding) },
  { path: 'leads', canActivate: [authGuard], loadComponent: () => import('./features/leads/leads').then(m => m.LeadsPage) },
  { path: 'searches', canActivate: [authGuard], loadComponent: () => import('./features/searches/searches').then(m => m.Searches) },
  { path: 'searches/:id', canActivate: [authGuard], loadComponent: () => import('./features/searches/search-detail/search-detail').then(m => m.SearchDetail) },
  { path: 'admin', canActivate: [authGuard, adminGuard], loadComponent: () => import('./features/admin/admin').then(m => m.AdminDashboard) },
  { path: 'profile', canActivate: [authGuard], loadComponent: () => import('./features/profile/profile').then(m => m.ProfilePage) },
  { path: '**', redirectTo: '' },
];
