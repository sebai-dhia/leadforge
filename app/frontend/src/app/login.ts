import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Logo } from './logo';
import { GoogleSignIn } from './google-sign-in';
import { LangSwitch } from './lang-switch';
import { SpecializationDialog } from './specialization-dialog';
import { SpecializationKey } from './specialization-picker';
import { I18n, I18nKey } from './i18n';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink, Logo, GoogleSignIn, LangSwitch, SpecializationDialog],
  template: `
    <div class="wrap">
      <header class="top">
        <a routerLink="/" class="brand" [attr.aria-label]="t('landing.home')"><app-logo [size]="28" /></a>
        <span class="right"><app-lang-switch /><a routerLink="/" class="back">{{ t('login.back') }}</a></span>
      </header>

      <div class="center">
        <div class="box">
          <h1>{{ t('login.title') }}</h1>
          <p class="lede">{{ t('login.lede') }}</p>

          <section class="demo" [attr.aria-label]="t('login.justLooking')">
            <div class="demo-head">
              <span>{{ t('login.justLooking') }}</span>
              <span class="seats" role="status"><span class="dot" [class.full]="demoFull()"></span>{{ t('login.seats', { n: activeCount(), max: maxCount() }) }}</span>
            </div>
            @if (demoFull()) {
              <div class="alert" role="alert">{{ t('login.full') }}</div>
            }
            <button type="button" class="btn demo-btn" [disabled]="busy() || demoFull()" [attr.aria-expanded]="choosing()" (click)="choosing.set(true)">
              <span>{{ t('login.guest') }}</span><span aria-hidden="true">→</span>
            </button>
            <p class="fine">{{ t('login.guestFine', { m: idleMinutes() }) }}</p>
          </section>

          <div class="or"><span></span>{{ t('login.or') }}<span></span></div>
          <app-google-sign-in (credential)="google($event)" (failed)="googleUnavailable.set(true)" />
          @if (googleUnavailable()) { <p class="fine center-text">{{ t('login.googleUnavailable') }}</p> }
          @if (googleError(); as e) { <p class="err center-text" role="alert">{{ t(e) }}</p> }

          <div class="or"><span></span>{{ t('login.orEmail') }}<span></span></div>

          <form (ngSubmit)="submit()">
            <label>{{ t('login.email') }} <input name="email" type="email" required autocomplete="email" placeholder="you@example.com" [(ngModel)]="email"></label>
            <label>{{ t('login.password') }} <input name="password" type="password" required minlength="8"
              autocomplete="current-password" [placeholder]="t('login.passwordHint')" [(ngModel)]="password"></label>
            @if (error(); as e) { <p class="err" role="alert">{{ t(e) }}</p> }
            <button type="submit" class="btn ghost submit" [disabled]="busy()">{{ t('login.signin') }}</button>
          </form>
        </div>
      </div>
      <app-specialization-dialog [open]="choosing()" [busy]="busy()" (closed)="choosing.set(false)" (picked)="guest($event)" />
    </div>
  `,
  styles: `
    .wrap { min-height: 100vh; display: flex; flex-direction: column; }
    .top { display: flex; align-items: center; justify-content: space-between; gap: 16px; max-width: 1160px; width: 100%; margin: 0 auto; padding: 20px 24px; box-sizing: border-box; }
    .brand { text-decoration: none; display: inline-flex; min-height: 44px; align-items: center; }
    .right { display: inline-flex; align-items: center; gap: 16px; flex-wrap: nowrap; justify-content: flex-end; flex: none; }
    .right app-lang-switch { flex: none; }
    @media (max-width: 480px) { .back { display: none; } .top { padding-left: 16px; padding-right: 16px; } }
    .back { color: var(--mute); text-decoration: none; font-size: 15px; min-height: 44px; display: inline-flex; align-items: center; justify-content: flex-end; min-width: 9.5rem; }
    .back:hover { color: var(--ink); }
    .center { flex: 1; display: flex; align-items: center; justify-content: center; padding: 16px 24px 64px; }
    .box { width: 100%; max-width: 440px; }
    h1 { font-size: 34px; margin: 0 0 10px; }
    .lede { margin-bottom: 26px; }
    .demo { background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: 22px; }
    .demo-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 16px; font-weight: 600; font-size: 15px; flex-wrap: wrap; }
    .seats { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 400; color: var(--mute); }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
    .dot.full { background: var(--warn); }
    .alert { border: 1px solid color-mix(in srgb, var(--warn) 45%, transparent); background: color-mix(in srgb, var(--warn) 10%, transparent); color: var(--warn); border-radius: 12px; padding: 12px 14px; font-size: 14.5px; margin-bottom: 14px; }
    .demo-buttons { display: flex; flex-direction: column; gap: 10px; }
    .demo-btn { justify-content: space-between; min-height: 52px; border-radius: 12px; padding: 0 18px; font-size: 16px; }
    .center-text { text-align: center; }
    .fine { font-size: 13px; color: var(--mute); margin: 14px 0 0; }
    .or { display: flex; align-items: center; gap: 14px; margin: 24px 0; color: var(--mute); font-size: 13px; }
    .or span { flex: 1; height: 1px; background: var(--line); }
    form label { font-size: 14px; font-weight: 500; }
    form input { min-height: 48px; border-radius: 12px; font-size: 16px; }
    .submit { width: 100%; min-height: 50px; border-radius: 12px; font-size: 16px; margin-top: 4px; }
  `,
})
export class Login implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  protected readonly t = inject(I18n).t;

  email = '';
  password = '';
  readonly busy = signal(false);
  protected readonly choosing = signal(false);
  readonly error = signal<I18nKey | null>(null);
  readonly activeCount = signal(0);
  readonly maxCount = signal(5);
  readonly idleMinutes = signal(15);
  readonly demoFull = signal(false);
  readonly googleUnavailable = signal(false);
  readonly googleError = signal<I18nKey | null>(null);

  ngOnInit() {
    this.refreshStatus();
  }

  refreshStatus() {
    this.api.demoStatus().subscribe({
      next: s => {
        this.activeCount.set(s.activeSessions);
        this.maxCount.set(s.maxSessions);
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
      error: e => this.fail(e),
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
          : e.status === 409 ? 'login.errExists'
          : e.status === 401 ? 'login.errGoogle'
          : 'login.errServer');
        if (e.status === 429) this.refreshStatus();
      },
    });
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
