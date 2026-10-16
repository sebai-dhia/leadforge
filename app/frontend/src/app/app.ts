import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './auth.service';
import { Logo } from './logo';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Logo],
  template: `
    @if (auth.loggedIn()) {
      <header class="app-bar">
        <div class="app-bar-inner">
          <a routerLink="/leads" class="brand" aria-label="Leadforge, your leads"><app-logo [size]="26" /></a>
          <nav aria-label="Main">
            <a routerLink="/leads" routerLinkActive="on">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/></svg>
              Leads</a>
            <a routerLink="/searches" routerLinkActive="on">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              Find leads</a>
            <a routerLink="/profile" routerLinkActive="on">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
              Profile</a>
          </nav>
          <span class="user">
            @if (auth.isDemo()) { <span class="demo-chip">Demo</span> } @else { {{ auth.email() }} }
            <button class="ghost" (click)="auth.logout()">Log out</button>
          </span>
        </div>
      </header>
    }
    <main [class.app-main]="auth.loggedIn()"><router-outlet /></main>
    @if (auth.loggedIn()) {
      <footer class="app-footer">Place data by <a href="https://www.geoapify.com/" target="_blank" rel="noopener">Geoapify</a> and OpenStreetMap contributors</footer>
    }
  `,
})
export class App {
  protected readonly auth = inject(AuthService);
}
