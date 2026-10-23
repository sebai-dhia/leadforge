import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { I18n } from './i18n/i18n';
import { Logo } from './shared/logo/logo';
import { ToastHost } from './shared/toast/toast';
import { UserMenu } from './shared/user-menu/user-menu';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Logo, UserMenu, ToastHost],
  templateUrl: './app.html',
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly t = inject(I18n).t;
  protected readonly year = new Date().getFullYear();
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
