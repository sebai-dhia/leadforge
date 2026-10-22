import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './auth.service';
import { I18n } from './i18n';
import { Logo } from './logo';
import { ToastHost } from './toast';
import { UserMenu } from './user-menu';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Logo, UserMenu, ToastHost],
  template: `
    @if (showChrome()) {
      <header class="app-bar" [class.admin]="inAdmin()">
        <div class="app-bar-inner">
          <a [routerLink]="inAdmin() ? '/admin' : '/leads'" class="brand" aria-label="Leadforge"><app-logo [size]="26" /></a>
          @if (inAdmin()) {
            <nav [attr.aria-label]="t('nav.adminMode')">
              <span class="mode-tag">{{ t('nav.adminMode') }}</span>
            </nav>
            <a routerLink="/leads" class="mode-btn" [attr.aria-label]="t('nav.exitAdmin')" [attr.title]="t('nav.exitAdmin')">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </a>
          } @else {
            <nav aria-label="Main">
              <a routerLink="/leads" routerLinkActive="on">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/></svg>
                {{ t('nav.leads') }}</a>
              <a routerLink="/searches" routerLinkActive="on">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                {{ t('nav.find') }}</a>
            </nav>
            @if (auth.isAdmin()) {
              <a routerLink="/admin" class="mode-btn" [attr.aria-label]="t('nav.adminMode')" [attr.title]="t('nav.adminMode')">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4 6v6c0 4.5 3.2 7.6 8 9 4.8-1.4 8-4.5 8-9V6l-8-3z"/><path d="M9 12.5l2 2 4-4.5"/></svg>
              </a>
            }
          }
          @if (auth.loggedIn()) { <app-user-menu /> }
        </div>
      </header>
      @if (auth.isGuest()) {
        <div class="guest-banner" role="note">
          <span>{{ t('banner.guest') }}</span>
          <button type="button" class="ghost" (click)="keepLeads()">{{ t('banner.keep') }}</button>
        </div>
      }
    }
    <main [class.app-main]="showChrome()"><router-outlet /></main>
    <app-toasts />
    @if (showChrome()) {
      <footer class="app-footer">{{ t('footer.placeData') }} <a href="https://www.geoapify.com/" target="_blank" rel="noopener">Geoapify</a> {{ t('footer.and') }}</footer>
    }
  `,
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly t = inject(I18n).t;
  private readonly router = inject(Router);

  /** The first-run picker is a full page with its own header. */
  private readonly fullPage = toSignal(
    this.router.events.pipe(filter(e => e instanceof NavigationEnd), map(e => (e as NavigationEnd).urlAfterRedirects.startsWith('/welcome'))),
    { initialValue: this.router.url.startsWith('/welcome') });
  /** Admin mode: its own top bar, so it is clear which side of the app you are in. */
  protected readonly inAdmin = toSignal(
    this.router.events.pipe(filter(e => e instanceof NavigationEnd), map(e => (e as NavigationEnd).urlAfterRedirects.startsWith('/admin'))),
    { initialValue: this.router.url.startsWith('/admin') });
  // while logging out the header and the page width stay as they were until the next page has loaded
  protected readonly showChrome = () => (this.auth.loggedIn() || this.auth.leaving()) && !this.fullPage();

  protected keepLeads() {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
