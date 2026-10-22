import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { GoogleSignIn } from '../../shared/google-sign-in/google-sign-in';
import { I18n, I18nKey } from '../../i18n/i18n';
import { LangSwitch } from '../../shared/lang-switch/lang-switch';
import { Logo } from '../../shared/logo/logo';
import { SpecializationDialog } from '../../shared/specialization-dialog/specialization-dialog';
import { SpecializationKey } from '../../shared/specialization-picker/specialization-picker';

/**
 * Sign-in. Returning people sign in (Google first, then email); newcomers get the guest option below.
 * Same night-map look as the landing page, drawn for the dark theme only.
 */
/** For display only: the server reads the email from the verified token itself. */
function emailOf(credential: string): string {
  try {
    const payload = JSON.parse(atob(credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.email === 'string' ? payload.email : '';
  } catch { return ''; }
}

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink, Logo, GoogleSignIn, LangSwitch, SpecializationDialog],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  protected readonly t = inject(I18n).t;

  email = '';
  password = '';
  protected readonly showPw = signal(false);
  readonly busy = signal(false);
  protected readonly choosing = signal(false);
  readonly error = signal<I18nKey | null>(null);
  readonly idleMinutes = signal(15);
  readonly demoFull = signal(false);
  readonly googleUnavailable = signal(false);
  readonly googleError = signal<I18nKey | null>(null);
  /** The Google token waiting to be connected to an existing password account, and what to show about it. */
  protected readonly linkCredential = signal<string | null>(null);
  protected readonly linkEmail = signal('');
  protected readonly linkError = signal<I18nKey | null>(null);
  protected linkPassword = '';

  protected readonly dots: [number, number, boolean][] = [[150, 96, true], [255, 56, false], [340, 122, true], [205, 140, false], [430, 150, true], [300, 86, false], [95, 150, false]];
  protected readonly points: [I18nKey, I18nKey][] = [
    ['landing.why1', 'landing.why1Text'], ['landing.why2', 'landing.why2Text'], ['landing.why3', 'landing.why3Text'],
  ];

  ngOnInit() {
    this.refreshStatus();
  }

  refreshStatus() {
    this.api.demoStatus().subscribe({
      next: s => {
        this.idleMinutes.set(s.idleMinutes);
        this.demoFull.set(s.demoFull);
      },
      error: () => { /* status endpoint optional on initial load */ }
    });
  }

  guest(spec: SpecializationKey) {
    this.busy.set(true);
    this.error.set(null);
    this.auth.guest(spec).subscribe({
      next: () => this.router.navigateByUrl(this.auth.home()),
      error: e => { this.choosing.set(false); this.fail(e); },
    });
  }

  submit() {
    this.busy.set(true);
    this.error.set(null);
    this.auth.login(this.email, this.password).subscribe({
      next: () => this.router.navigateByUrl(this.auth.home()),
      error: e => this.fail(e),
    });
  }

  google(credential: string) {
    this.busy.set(true);
    this.googleError.set(null);
    this.auth.google(credential).subscribe({
      next: () => this.router.navigateByUrl(this.auth.home()),
      error: e => {
        this.busy.set(false);
        this.googleError.set(
          e.status === 429 ? 'login.full'
          : e.status === 401 ? 'login.errGoogle'
          : 'login.errServer');
        if (e.status === 429) this.refreshStatus();
        if (e.status === 409) {
          // the email already has a password account: ask for its password once, to connect Google to it
          this.googleError.set(null);
          this.linkCredential.set(credential);
          this.linkEmail.set(emailOf(credential));
          this.linkPassword = '';
          this.linkError.set(null);
          setTimeout(() => document.querySelector<HTMLInputElement>('input[name=linkpw]')?.focus());
        }
      },
    });
  }

  link() {
    const credential = this.linkCredential();
    if (!credential || this.busy()) return;
    this.busy.set(true);
    this.linkError.set(null);
    this.auth.googleLink(credential, this.linkPassword).subscribe({
      next: () => this.router.navigateByUrl(this.auth.home()),
      error: e => {
        this.busy.set(false);
        this.linkError.set(
          e.status === 401 ? 'login.errLinkWrong'
          : e.status === 409 ? 'login.errLinkOther'
          : e.status === 429 ? 'login.errLinkLater'
          : e.status === 400 ? 'login.errLinkExpired'
          : 'login.errServer');
        if (e.status === 400) { this.linkCredential.set(null); this.googleError.set('login.errLinkExpired'); }
      },
    });
  }

  cancelLink() {
    this.linkCredential.set(null);
    this.linkPassword = '';
    this.linkError.set(null);
  }

  private fail(e: { status: number }) {
    this.busy.set(false);
    if (e.status === 429) {
      this.error.set('login.full');
      this.refreshStatus();
      return;
    }
    if (e.status === 401) {
      this.error.set('login.errWrong');
      return;
    }
    this.error.set('login.errServer');
  }
}
