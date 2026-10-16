import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  template: `
    <header>
      <a routerLink="/" class="brand">Lead Finder</a>
      @if (auth.email(); as email) {
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
