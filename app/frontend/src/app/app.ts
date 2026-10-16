import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header>
      <a routerLink="/" class="brand">Lead Finder</a>
      @if (auth.email(); as email) {
        <nav aria-label="Main">
          <a routerLink="/" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }">Searches</a>
          <a routerLink="/profile" routerLinkActive="on">Profile</a>
        </nav>
        <span class="user">{{ email }} <button class="ghost" (click)="auth.logout()">Log out</button></span>
      }
    </header>
    <main><router-outlet /></main>
    <footer>Place data by <a href="https://www.geoapify.com/" target="_blank" rel="noopener">Geoapify</a> and OpenStreetMap contributors</footer>
  `,
})
export class App {
  protected readonly auth = inject(AuthService);
}
